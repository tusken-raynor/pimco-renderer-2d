/**
 * Text Render Slave Worker Entry Point.
 *
 * This worker handles text/effect layer rendering (layers with PimcoMaskSubstitutionCompiled masks).
 * It receives assets (images, fonts) from the Asset Manager via a MessagePort and renders
 * batches of text layers using the text rasterization and effects pipeline.
 *
 * Message Protocol:
 * - init: Initialize the worker and report capabilities
 * - batch: Render a batch of text layers
 * - abort: Cancel current rendering operation
 *
 * The worker also receives asset-data messages from the Asset Manager via
 * a separate MessagePort registered by the master.
 *
 * Synchronization:
 * The slave waits until both conditions are met before rendering:
 * 1. A batch message has been received from the master
 * 2. All assets referenced in the batch (non-negative IDs) have been received
 * Either the batch arrival or an asset arrival can trigger rendering.
 *
 * Capability Requirements:
 * - WebGL2 is required for full effect support (embroidery, engraving, etc.)
 * - Without WebGL2, only basic effects (no-effect, simple color) will work
 */

import { TextRenderSlave } from '../js/text-render-slave';
import { createTextBatchCoordinator, type PendingBatch } from '../js/text-render-slave/batch-coordinator';
import { probeCapabilities } from '../js/renderer/capability-probe';
import { buildEventTopic, topicHasSubscriber } from '../js/renderer/event-topics';
import { wrapError } from '../js/errors';
import { isInitMessage, isBatchMessage, isAbortMessage, isAssetDataMessage } from '../js/types';
import type {
  MasterToSlaveMessage,
  AssetManagerToSlaveMessage,
  CapabilitiesMessage,
  ResultMessage,
  ErrorMessage,
  ReadyMessage,
  PimcoEventMessage,
  RenderSegment,
  TextLayerDescriptor,
} from '../js/types';

// Import effects for routing.
// During the GPU migration, only no-effect (the universal fallback) and
// engraving (first GPU-converted effect) are wired in. Other effects' files
// remain in src/js/effects/ but their entry points are not imported here —
// they'll be re-imported as each is GPU-converted in subsequent PRs.
import { processNoEffectLayer } from '../js/effects/no-effect';
import { processEngravingEffectLayer } from '../js/effects/engraving';
import { processHotstampEffectLayer } from '../js/effects/hotstamp';
import { processMetalEffectLayer } from '../js/effects/metal';
import { processEmbroideryEffectLayer } from '../js/effects/embroidery';
import { processFoilEffectLayer } from '../js/effects/foil';
import { processPaintedEffectLayer } from '../js/effects/painted';
import { processShadowEffectLayer } from '../js/effects/shadow';
import { processNormalEffectLayer } from '../js/effects/normal';
import { initWebGLBuddy, myWebGLBuddy } from '../js/effects';
import { uploadCanvasToHandle } from '../js/effects/effect-utils';
import { applyProjection, initProjection } from '../js/text-render-slave/projection';
import type { GPUTextureHandle } from 'webgl-postprocessor';

import { canvasToImageBitmap, createCanvas, getContext2D } from '../js/utils/canvas';
import type { AnyCanvas } from '../js/utils/canvas';
import {
  applyTransformAndDraw,
  hasActiveTransform,
  type TextAlignment,
} from '../js/text-render-slave/transforms';

// Create the text render slave instance
const textRenderSlave = new TextRenderSlave();

// Track the asset manager port for receiving assets
let assetPort: MessagePort | null = null;

// Track capabilities for effect routing
let hasWebGL2 = false;

// Active pimco lifecycle subscription patterns received from the master with
// each batch. emitPimcoEvent() runs the topic match against this list before
// doing any work — when nothing matches, no createImageBitmap, no postMessage.
let eventSubscriptions: readonly string[] = [];

// Create batch coordinator with render callback
const batchCoordinator = createTextBatchCoordinator(
  textRenderSlave,
  (batch) => void executeRender(batch)
);

/**
 * Send capabilities message to master.
 *
 * Also initializes the shared WebGLPostProcessor against a slave-owned
 * OffscreenCanvas when WebGL2 is available. The canvas is initialized small
 * (1×1) and resized per-effect via setResolution / per-projection in the
 * projection module — the size at init time doesn't matter.
 *
 * If GL2 context creation fails after the probe reported success (rare race),
 * `hasWebGL2` is forced false so the dispatch falls back through no-effect.
 */
function sendCapabilities(): void {
  const capabilities = probeCapabilities();
  hasWebGL2 = capabilities.webgl2;

  if (hasWebGL2) {
    const buddyCanvas = new OffscreenCanvas(1, 1);
    const buddy = initWebGLBuddy(buddyCanvas);
    if (!buddy) {
      hasWebGL2 = false;
    } else {
      // Compile + cache the projection program against the same shared GL
      // context so projection layers can sample effect-output handles
      // directly without a CPU readback. Failure here disables projection
      // for this slave but does not affect non-projection layers.
      initProjection();
    }
  }

  const msg: CapabilitiesMessage = {
    type: 'capabilities',
    offscreenCanvas: capabilities.offscreenCanvas,
    webgl2: hasWebGL2,
  };
  self.postMessage(msg);
}

/**
 * Send ready message to master.
 */
function sendReady(): void {
  const msg: ReadyMessage = {
    type: 'ready',
  };
  self.postMessage(msg);
}

/**
 * Send result message to master.
 * @param segments - Rendered segments to transfer
 */
function sendResult(segments: RenderSegment[]): void {
  const msg: ResultMessage = {
    type: 'result',
    segments,
  };

  // Transfer ownership of all bitmaps to avoid copying
  const transferables = segments.map((s) => s.bitmap);
  self.postMessage(msg, transferables);
}

/**
 * Emit a debug snapshot of an intermediate canvas/bitmap to the master.
 * No-op when debugMode is false. Creates a fresh ImageBitmap copy via
 * createImageBitmap so the source canvas/handle stays usable for the
 * pipeline; the bitmap is transferred to the master.
 */
async function emitPimcoEvent(
  stage: 'render' | 'render-part',
  pimcoId: string,
  source: ImageBitmap | OffscreenCanvas | HTMLCanvasElement,
  part?: string,
  meta?: Record<string, unknown>
): Promise<void> {
  // Per-pattern gate: build the topic this event would carry, then check
  // whether any active subscription pattern would match it. If not, no work
  // is done — no createImageBitmap, no postMessage. This keeps the cost
  // exactly bounded by what subscribers actually asked for.
  const topic = buildEventTopic(stage, pimcoId, part);
  if (!topicHasSubscriber(topic, eventSubscriptions)) {
    return;
  }
  try {
    const bitmap = await createImageBitmap(source);
    const msg: PimcoEventMessage = {
      type: 'pimco-event',
      stage,
      pimcoId,
      bitmap,
      ...(part !== undefined && { part }),
      ...(meta !== undefined && { meta }),
    };
    self.postMessage(msg, [bitmap]);
  } catch (err) {
    // Lifecycle emission failure must not break the render — log and continue.
    console.warn(`[text-slave] emitPimcoEvent failed for ${topic}`, err);
  }
}

/**
 * Send error message to master.
 * @param error - Error to send
 */
function sendError(error: unknown): void {
  const wrapped = wrapError(error);
  const msg: ErrorMessage = {
    type: 'error',
    message: wrapped.message,
    code: wrapped.code,
    context: wrapped.context,
  };
  self.postMessage(msg);
}

/**
 * Handle asset data message from Asset Manager.
 * @param message - Asset data message
 */
function handleAssetData(message: AssetManagerToSlaveMessage): void {
  if (!isAssetDataMessage(message)) {
    return;
  }

  if (message.assetType === 'image' && message.data instanceof ImageBitmap) {
    textRenderSlave.registerAsset(message.id, message.data);
    batchCoordinator.handleAssetReceived();
  } else if (message.assetType === 'font' && message.data instanceof ArrayBuffer) {
    const family = message.fontFamily;
    if (family === undefined) {
      console.warn(`Font asset ${String(message.id)} missing fontFamily; ignoring`);
      return;
    }
    // The FontFace.load resolution is what flips `isFontLoaded`. Wait for
    // that before notifying the coordinator so the gate matches.
    void textRenderSlave
      .registerFont(message.id, family, message.data, message.fontDescriptors)
      .then(() => {
        batchCoordinator.handleAssetReceived();
      });
  } else if (message.assetType === 'mesh' && message.data instanceof ArrayBuffer) {
    textRenderSlave.registerMesh(message.id, message.data);
    batchCoordinator.handleAssetReceived();
  }
}

/**
 * Handle init message - probe capabilities and report ready.
 */
function handleInit(): void {
  sendCapabilities();
  sendReady();
}

/**
 * Predicate: does this layer route through `processNoEffectLayer` for its
 * final render? True when:
 *   - `mask.effect` is undefined / not one of the GPU-converted cases
 *     handled by the switch in `applyEffect`, OR
 *   - WebGL2 is unavailable (every GPU case falls back to no-effect).
 *
 * Used by `renderTextLayer` to pick the rasterization variant: no-effect
 * needs an alpha-encoded mask for Canvas2D `destination-in`, GPU effects
 * need the white-on-black-OPAQUE mask their shaders sample from `.r`.
 *
 * Keep the case list synchronized with the switch in `applyEffect` — the
 * comment above that switch flags the dependency.
 */
function routesToNoEffect(
  layer: TextLayerDescriptor,
  webgl2Available: boolean
): boolean {
  if (!webgl2Available) {
    return true;
  }
  const effect = layer.maskData.effect;
  switch (effect) {
    case 'engraving':
    case 'hotstamp':
    case 'metal':
    case 'embroidery':
    case 'foil':
    case 'painted':
    case 'shadow':
    case 'normal':
      return false;
    default:
      return true;
  }
}

/**
 * Apply effect to a rasterized text mask based on the effect type.
 */
async function applyEffect(
  layer: TextLayerDescriptor,
  rasterizedMask: AnyCanvas,
  textHeight: number,
  width: number,
  height: number
): Promise<AnyCanvas | null> {
  const effect = layer.maskData.effect;

  // Resolve the effect texture. For text layers there is no separate "main
  // image" — `layer.image` IS the texture used by effects (brushed metal,
  // embroidery thread, painted base, etc.), matching legacy `sub.image`
  // semantics. The optional `texture` field overrides when explicitly set.
  // Both fields can resolve to -1 if the URL previously failed to load, so
  // guard against negative IDs.
  const textureId = layer.assetIds.texture ?? layer.assetIds.image;
  let texture: ImageBitmap | undefined;
  if (textureId >= 0) {
    const asset = textRenderSlave.getAsset(textureId);
    if (asset instanceof ImageBitmap) {
      texture = asset;
    }
  }

  // Route to appropriate effect handler.
  //
  // Each GPU effect's case falls back to no-effect when WebGL2 isn't
  // available (the GPU pipelines are required for the effect-specific
  // shaders). The default branch — unknown / unspecified effect names —
  // routes to no-effect directly.
  //
  // The `routesToNoEffect` helper above is the predicate the rasterization
  // step at `renderTextLayer` uses to choose between mask formats. THE
  // SWITCH BELOW AND THAT HELPER MUST AGREE: if you add a new GPU case
  // here, also add it to the switch in `routesToNoEffect`, otherwise the
  // new effect will receive an alpha-encoded mask and silently break.
  switch (effect) {
    case 'engraving':
      if (!hasWebGL2) {
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processEngravingEffectLayer(
        layer,
        width,
        height,
        rasterizedMask,
        textHeight,
        buildDebugHooksForLayer(layer.id)
      );

    case 'hotstamp':
      if (!hasWebGL2) {
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processHotstampEffectLayer(layer, width, height, rasterizedMask, textHeight);

    case 'metal':
      if (!hasWebGL2) {
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processMetalEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'embroidery':
      if (!hasWebGL2) {
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processEmbroideryEffectLayer(
        layer,
        width,
        height,
        rasterizedMask,
        textHeight,
        texture,
        buildDebugHooksForLayer(layer.id)
      );

    case 'foil':
      if (!hasWebGL2) {
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processFoilEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'painted':
      if (!hasWebGL2) {
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processPaintedEffectLayer(
        layer,
        width,
        height,
        rasterizedMask,
        textHeight,
        texture
      );

    case 'shadow':
      if (!hasWebGL2) {
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processShadowEffectLayer(layer, width, height, rasterizedMask);

    case 'normal':
      if (!hasWebGL2) {
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processNormalEffectLayer(layer, width, height, rasterizedMask, texture);

    default:
      return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
  }
}

/**
 * Parallel to `applyEffect`, but requests handle-mode output from each GPU
 * effect so the result is a `GPUTextureHandle` on the shared GL context that
 * the projection module can sample directly — no GPU→CPU readback between
 * effect and projection.
 *
 * Returns null when the effect cannot run in handle mode (WebGL2 missing, or
 * the effect routes to no-effect / unknown). Caller should fall back to the
 * canvas-mode `applyEffect` path.
 */
async function applyEffectAsHandle(
  layer: TextLayerDescriptor,
  rasterizedMask: AnyCanvas,
  textHeight: number,
  width: number,
  height: number
): Promise<GPUTextureHandle | null> {
  if (!hasWebGL2) {
    return null;
  }

  const effect = layer.maskData.effect;
  const textureId = layer.assetIds.texture ?? layer.assetIds.image;
  let texture: ImageBitmap | undefined;
  if (textureId >= 0) {
    const asset = textRenderSlave.getAsset(textureId);
    if (asset instanceof ImageBitmap) {
      texture = asset;
    }
  }

  switch (effect) {
    case 'engraving':
      return processEngravingEffectLayer(
        layer,
        width,
        height,
        rasterizedMask,
        textHeight,
        buildDebugHooksForLayer(layer.id),
        { kind: 'handle' }
      );
    case 'hotstamp':
      return processHotstampEffectLayer(layer, width, height, rasterizedMask, textHeight, {
        kind: 'handle',
      });
    case 'metal':
      return processMetalEffectLayer(layer, width, height, rasterizedMask, textHeight, texture, {
        kind: 'handle',
      });
    case 'embroidery':
      return processEmbroideryEffectLayer(
        layer,
        width,
        height,
        rasterizedMask,
        textHeight,
        texture,
        buildDebugHooksForLayer(layer.id),
        { kind: 'handle' }
      );
    case 'foil':
      return processFoilEffectLayer(layer, width, height, rasterizedMask, textHeight, texture, {
        kind: 'handle',
      });
    case 'painted':
      return processPaintedEffectLayer(layer, width, height, rasterizedMask, textHeight, texture, {
        kind: 'handle',
      });
    case 'shadow':
      return processShadowEffectLayer(layer, width, height, rasterizedMask, { kind: 'handle' });
    case 'normal':
      return processNormalEffectLayer(layer, width, height, rasterizedMask, texture, {
        kind: 'handle',
      });
    default: {
      // No-effect / unknown effect. The no-effect path is intentionally pure
      // Canvas2D so it can run on devices without WebGL2 — but when WebGL2 IS
      // available AND `mask.projection` is set, we still want the layer to
      // pass through the GPU projection draw. We're inside `applyEffectAsHandle`
      // which is only called from the willProject branch, so getting here
      // means the caller wants a handle. Run the Canvas2D pipeline as usual,
      // then upload the resulting canvas to a chain-internal FBO so projection
      // can sample it like any effect-output handle. Without this promotion
      // the willProject branch dropped projection silently and the layer
      // rendered flat.
      const canvas = processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      if (!canvas) return null;
      const buddy = myWebGLBuddy();
      if (!buddy) return null;
      return uploadCanvasToHandle(buddy, canvas, canvas.width, canvas.height);
    }
  }
}

/**
 * Build the debug hooks bundle handed to GPU effects so they can emit
 * pipeline intermediates as `pimcoRenderPart:{layerId}:{part}` events. Both
 * hook methods are gated by `topicHasSubscriber`, so when nobody's listening,
 * `wantsPart` returns false and the effect skips the materialize-as-canvas
 * step entirely.
 */
function buildDebugHooksForLayer(layerId: string): {
  wantsPart(part: string): boolean;
  emitPart(part: string, canvas: AnyCanvas, meta?: Record<string, unknown>): Promise<void>;
} {
  return {
    wantsPart(part) {
      const topic = buildEventTopic('render-part', layerId, part);
      return topicHasSubscriber(topic, eventSubscriptions);
    },
    async emitPart(part, canvas, meta) {
      await emitPimcoEvent('render-part', layerId, canvas, part, meta);
    },
  };
}

/**
 * Render a single text layer with full pipeline.
 */
async function renderTextLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  index: number
): Promise<{
  bitmap: ImageBitmap;
  index: number;
  compositemode: string;
  compositealpha: number;
} | null> {
  if (textRenderSlave.isAborted()) {
    return null;
  }

  const maskData = layer.maskData;

  // Fonts are gated by the batch coordinator (requiredFontIds + isFontLoaded).
  // By the time we get here, every font this batch needs is already in
  // `self.fonts` under its real family name; the rasterizer's `ctx.font`
  // string will pick it up.

  // Rasterize text. For layers that will route through
  // `processNoEffectLayer` (unknown / unspecified effect, or WebGL2 missing
  // and falling back to no-effect), use the alpha-encoded variant so
  // Canvas2D `destination-in` can gate the result. GPU-effect layers keep
  // the default white-on-black-OPAQUE format their shaders expect.
  const transparentBackground = routesToNoEffect(layer, hasWebGL2);
  const rasterized = textRenderSlave.rasterizeText(maskData, width, height, {
    transparentBackground,
  });

  // Lifecycle event: rasterized text mask (format depends on the route —
  // see the rasterizer's transparentBackground option). Subscribers to
  // `pimcoRenderPart:{id}:text` (or matching wildcard) receive a copy of
  // this canvas as an ImageBitmap.
  await emitPimcoEvent('render-part', layer.id, rasterized.canvas, 'text', {
    width: rasterized.width,
    height: rasterized.height,
    textWidth: rasterized.measurement.width,
    textHeight: rasterized.measurement.height,
    maskFormat: transparentBackground ? 'alpha-encoded' : 'white-on-black-opaque',
  });

  if (textRenderSlave.isAborted()) {
    return null;
  }

  // Step 3 + 4: effect + transform-or-projection.
  //
  // Projection (mask.projection set, mesh asset available, WebGL2 supported)
  // takes precedence over 2D transform per plan.md "mutually exclusive". In
  // that path we ask each effect for its terminal compose result as a
  // GPUTextureHandle so the projection program can sample it directly on
  // the shared GL — no GPU→CPU readback. Otherwise the canvas path runs
  // unchanged (effect → optional 2D transform → centered draw).
  const projection = maskData.projection;
  const meshAssetId = layer.assetIds.mesh;
  const willProject =
    projection !== undefined &&
    meshAssetId !== undefined &&
    meshAssetId >= 0 &&
    hasWebGL2 &&
    textRenderSlave.hasMesh(meshAssetId);

  // Step 4 prep: output canvas (full slave dims).
  const outputCanvas = createCanvas(width, height);
  const outputCtx = getContext2D(outputCanvas);
  if (!outputCtx) {
    throw new Error('Failed to create output context');
  }

  const alignment: TextAlignment = maskData.type?.alignment ?? 'center';

  if (willProject) {
    const handle = await applyEffectAsHandle(
      layer,
      rasterized.canvas,
      rasterized.measurement.height,
      width,
      height
    );
    if (textRenderSlave.isAborted()) {
      return null;
    }
    const meshBuffer = textRenderSlave.getMesh(meshAssetId);
    if (handle && meshBuffer) {
      try {
        applyProjection(outputCtx, handle, meshAssetId, meshBuffer, projection, width, height);
      } catch (err) {
        // Projection failure shouldn't break rendering — log and fall through
        // to a non-projection canvas-path render so the layer still appears.
        console.warn(`Projection failed for layer ${layer.id}, falling back:`, err);
        const fallback = await applyEffect(
          layer,
          rasterized.canvas,
          rasterized.measurement.height,
          width,
          height
        );
        if (fallback) outputCtx.drawImage(fallback, 0, 0);
      }
    } else {
      // Effect couldn't produce a handle (e.g. unknown effect), or the mesh
      // wasn't ready. Fall back through the canvas path so the layer still
      // renders flat (best effort).
      const fallback = await applyEffect(
        layer,
        rasterized.canvas,
        rasterized.measurement.height,
        width,
        height
      );
      if (fallback) outputCtx.drawImage(fallback, 0, 0);
    }
  } else {
    // Canvas path — original behavior preserved verbatim.
    const effectCanvas = await applyEffect(
      layer,
      rasterized.canvas,
      rasterized.measurement.height,
      width,
      height
    );
    if (!effectCanvas) {
      console.warn(`Effect application failed for layer ${layer.id}`);
      return null;
    }
    if (textRenderSlave.isAborted()) {
      return null;
    }
    if (hasActiveTransform(maskData.transform)) {
      // Pass the rasterized text width for alignment offset calculation
      // This is critical because effectCanvas is full-sized but alignment offset
      // should be based on the original text width
      applyTransformAndDraw(
        outputCtx,
        effectCanvas,
        maskData.transform,
        width,
        height,
        alignment,
        rasterized.width
      );
    } else {
      outputCtx.drawImage(effectCanvas, 0, 0);
    }
  }

  // Step 5: Apply post-mask if present
  const postmaskId = layer.assetIds.postmask;
  if (postmaskId !== undefined) {
    const postMask = textRenderSlave.getAsset(postmaskId);
    if (postMask instanceof ImageBitmap) {
      outputCtx.globalCompositeOperation = 'destination-in';
      outputCtx.globalAlpha = 1.0;
      outputCtx.drawImage(postMask, 0, 0, width, height);
      outputCtx.globalCompositeOperation = 'source-over';
    }
  }

  const bitmap = await canvasToImageBitmap(outputCanvas);

  // Lifecycle event: full isolated bitmap for this layer (after effect,
  // transform, and post-mask). Subscribers to `pimcoRender:{id}` (or matching
  // wildcard) receive a copy as an ImageBitmap. We snapshot from outputCanvas
  // rather than the just-created `bitmap` because the bitmap is about to be
  // transferred via the result message.
  await emitPimcoEvent('render', layer.id, outputCanvas, undefined, { width, height });

  return {
    bitmap,
    index,
    compositemode: layer.compositemode,
    compositealpha: layer.compositealpha,
  };
}

/**
 * Store pending indices for the current batch (PendingBatch doesn't include them).
 */
let pendingIndices: number[] = [];

/**
 * Execute rendering when batch and assets are ready.
 * Called by batchCoordinator when a batch is ready to render.
 * @param batch - Pending batch with layers, dimensions, and required asset IDs
 */
async function executeRender(batch: PendingBatch<TextLayerDescriptor>): Promise<void> {
  const { layers, width, height } = batch;
  const indices = pendingIndices;

  try {
    const results: RenderSegment[] = [];

    for (let i = 0; i < layers.length; i++) {
      if (textRenderSlave.isAborted()) {
        break;
      }

      // Use original index from indices array for correct composition ordering
      const originalIndex = indices[i] ?? i;
      const result = await renderTextLayer(layers[i], width, height, originalIndex);
      if (result) {
        // Text slaves don't batch layers, so each layer is its own segment
        // with orderIndex set to the original layer index
        results.push({
          bitmap: result.bitmap,
          compositemode: result.compositemode as RenderSegment['compositemode'],
          compositealpha: result.compositealpha,
          orderIndex: originalIndex,
        });
      }
    }

    if (textRenderSlave.isAborted()) {
      return;
    }

    sendResult(results);
  } catch (error) {
    if (!textRenderSlave.isAborted()) {
      sendError(error);
    }
  }
}

/**
 * Handle batch message - delegate to coordinator.
 * @param layers - Text layer descriptors to render
 * @param indices - Original layer indices for ordering
 * @param width - Canvas width
 * @param height - Canvas height
 * @param subscriptions - Active pimco lifecycle subscription patterns from the
 *                        master. Stored for the duration of this batch and
 *                        consulted by emitPimcoEvent() per emission point.
 */
function handleBatch(
  layers: TextLayerDescriptor[],
  indices: number[],
  width: number,
  height: number,
  subscriptions: readonly string[],
  requiredFontIds: number[] | undefined,
  requiredMeshIds: number[] | undefined
): void {
  textRenderSlave.resetAbort();
  eventSubscriptions = subscriptions;
  // Store indices separately since PendingBatch doesn't include them
  pendingIndices = indices;
  // Combine font + mesh IDs into the extra-asset-IDs gate the coordinator
  // unions on top of the layer-derived image asset IDs.
  const extraIds: number[] = [];
  if (requiredFontIds) extraIds.push(...requiredFontIds);
  if (requiredMeshIds) extraIds.push(...requiredMeshIds);
  batchCoordinator.handleBatch(layers, width, height, extraIds);
}

/**
 * Handle abort message - cancel current rendering.
 */
function handleAbort(): void {
  textRenderSlave.abort();
  batchCoordinator.clear();
}

/**
 * Handle incoming messages from the Master.
 */
self.onmessage = (event: MessageEvent<MasterToSlaveMessage>) => {
  const message = event.data;

  const ports = event.ports as readonly (MessagePort | undefined)[];
  if (ports.length > 0 && ports[0]) {
    assetPort = ports[0];
    assetPort.onmessage = (assetEvent: MessageEvent<AssetManagerToSlaveMessage>) => {
      handleAssetData(assetEvent.data);
    };
  }

  try {
    if (isInitMessage(message)) {
      handleInit();
    } else if (isBatchMessage(message)) {
      // The batch message contains layers, but for text slaves these should be TextLayerDescriptors
      // The master is responsible for routing the correct layer type to the correct slave
      handleBatch(
        message.layers as unknown as TextLayerDescriptor[],
        message.indices,
        message.width,
        message.height,
        message.eventSubscriptions ?? [],
        message.requiredFontIds,
        message.requiredMeshIds
      );
    } else if (isAbortMessage(message)) {
      handleAbort();
    }
  } catch (error) {
    sendError(error);
  }
};

self.onerror = (event: string | Event) => {
  if (typeof event === 'string') {
    sendError(new Error(event));
  } else if (event instanceof ErrorEvent) {
    sendError(new Error(event.message || 'Unknown worker error'));
  }
};

self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  sendError(event.reason);
};

function cleanup(): void {
  textRenderSlave.destroy();
  batchCoordinator.clear();
  if (assetPort) {
    assetPort.onmessage = null;
    assetPort.close();
    assetPort = null;
  }
}

if (typeof self.onbeforeunload !== 'undefined') {
  self.onbeforeunload = cleanup;
}
