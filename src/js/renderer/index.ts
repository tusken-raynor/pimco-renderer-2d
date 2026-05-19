/**
 * RenderMaster Module.
 *
 * The RenderMaster is the orchestrator of the multi-threaded rendering pipeline.
 * It coordinates Web Workers (Asset Manager, Standard Slaves, Text Slaves) to process layers
 * and produce a final composited ImageBitmap.
 *
 * Responsibilities:
 * - Spawn and manage Web Workers or virtual slaves based on capability detection
 * - Perform capability detection and determine fallback scenario (A-F)
 * - Maintain URL-to-numeric-ID asset mapping
 * - Classify layers (standard vs text)
 * - Distribute work to slaves
 * - Collect and compose final output
 * - Handle abort-on-reentry (cancel in-progress render when new render requested)
 *
 * Fallback Scenarios:
 * - A: Main thread master, workers for both slave types (OffscreenCanvas + WebGL2)
 * - B: Main thread master, workers for standard, virtual for text (OffscreenCanvas, no WebGL2)
 * - C: Main thread master, virtual for both (no OffscreenCanvas)
 * - D: Worker master, workers for both (OffscreenCanvas + WebGL2)
 * - E: Worker master, workers for standard, virtual for text (OffscreenCanvas, no WebGL2)
 * - F: Worker master, virtual for both, software compositor (no OffscreenCanvas)
 */

import type {
  ProductImageComponent,
  RenderSegment,
  LayerDescriptor,
  TextLayerDescriptor,
  AssetRequest,
  AssetDelivery,
  FallbackScenario,
  CapabilitiesMessage,
  ErrorMessage,
  SlaveToMasterMessage,
  AssetManagerToMasterMessage,
  PimcoMaskSubstitutionCompiled,
  FontFamilyDescription,
  FontFaceDescriptor,
  FontFaceDeliveryDescriptors,
} from '../types';
import {
  isReadyMessage,
  isCapabilitiesMessage,
  isResultMessage,
  isErrorMessage,
  isPimcoEventMessage,
  isFetchCompleteMessage,
  isDistributeCompleteMessage,
} from '../types';
import { isStandardLayerMask, isTextLayerMask } from '../types/pimco';
import { classifyLayers, type ClassificationResult } from './layer-classifier';
import { probeCapabilities } from './capability-probe';
import { buildEventTopic, matchEventTopic } from './event-topics';
import { MasterCompositor, type ComposedLayer, closeSegments } from './master-compositor';
import { SoftwareCompositor } from './software-compositor';
import { RenderError, AbortError, WorkerError, wrapError } from '../errors';
import { VirtualStandardSlave, VirtualTextSlave } from '../virtual-slaves';
import { destroyWebGLBuddy } from '../effects';

// Worker URLs — `?worker&url` is the Vite-native pattern for getting a worker
// chunk URL during dev/Vite-build. For the tsup library build, `tsup.config.ts`
// installs an esbuild plugin that rewrites this query to
// `new URL('./workers/<name>.worker.js', import.meta.url)`, resolving against
// the published `dist/PimcoRenderer.js` at runtime. Either way, the value here
// is a URL string / URL object that `new Worker(...)` accepts.
import AssetManagerWorkerUrl from '../../workers/asset-manager.worker.ts?worker&url';
import RenderSlaveWorkerUrl from '../../workers/render-slave.worker.ts?worker&url';
import TextRenderSlaveWorkerUrl from '../../workers/text-render-slave.worker.ts?worker&url';

/**
 * Lifecycle event payload dispatched to subscribers of `pimcoRender:*` and
 * `pimcoRenderPart:*:*` topics.
 *
 * The bitmap was created in the slave via createImageBitmap (a copy) and
 * transferred to the master, so listeners may draw it freely; the original
 * pipeline state is unaffected. Listeners are responsible for calling
 * `bitmap.close()` when done if memory matters.
 */
export interface PimcoLayerEvent {
  /** The pimco layer's id. */
  pimcoId: string;
  /** Snapshot bitmap. */
  bitmap: ImageBitmap;
  /**
   * Sub-part name when this is a `pimcoRenderPart` event (e.g. 'text',
   * 'engraving-emboss'). Absent for `pimcoRender` (full-layer) events.
   */
  part?: string;
  /** Free-form metadata supplied by the slave (e.g. dimensions, params). */
  meta?: Record<string, unknown>;
}

/**
 * Listener callback invoked once per matched event.
 */
export type PimcoLayerEventListener = (event: PimcoLayerEvent) => void;

/**
 * Options for RenderMaster initialization.
 */
export interface RenderMasterOptions {
  /** Default output width */
  width?: number;
  /** Default output height */
  height?: number;
  /** Number of standard render slaves (default: navigator.hardwareConcurrency or 4) */
  slaveCount?: number;
  /** Number of text render slaves (default: 2) */
  textSlaveCount?: number;
  /** Optional MessagePort for when master runs in worker (scenarios D-F) */
  mainThreadPort?: MessagePort;
  /**
   * Override the auto-detected fallback scenario (A–F). The probed
   * `offscreenCanvas` / `webgl2` flags are still recorded for reporting, but
   * slave spawning + composition routing follow the forced scenario.
   *
   * Intended for development / testing the virtual-slave paths on browsers
   * where capability detection naturally always lands in scenario A. Use the
   * dev app's "Scenario" dropdown to flip between configurations.
   *
   * Forcing 'D'–'F' from a main-thread context is currently not supported
   * (those require the master to run in a worker); the override falls back
   * to the probed scenario in that case with a console warning.
   */
  forceScenario?: FallbackScenario;
}

/**
 * Slave type identifier.
 */
type SlaveType = 'standard' | 'text';

/**
 * Common slave interface to abstract workers and virtual slaves.
 */
interface SlaveInstance {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<SlaveToMasterMessage>) => void) | null;
  onerror: ((event: ErrorEvent | Event) => void) | null;
  terminate(): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SlaveToMasterMessage>) => void
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<SlaveToMasterMessage>) => void
  ): void;
}

/**
 * Internal slave state tracking.
 * Supports both real workers and virtual slaves.
 */
interface SlaveState {
  /** Worker or virtual slave instance */
  worker: SlaveInstance;
  /** Unique slave ID */
  id: number;
  /** Slave type (standard or text) */
  type: SlaveType;
  /** Whether this is a virtual slave (main thread) */
  isVirtual: boolean;
  /** Whether slave has reported ready */
  ready: boolean;
  /** Reported capabilities */
  capabilities: CapabilitiesMessage | null;
  /** MessageChannel for Asset Manager communication (not used for virtual slaves) */
  assetChannel: MessageChannel | null;
  /** Current render promise resolver */
  renderResolver: ((segments: RenderSegment[]) => void) | null;
  /** Current render promise rejecter */
  renderRejecter: ((error: Error) => void) | null;
}

/**
 * Asset ID mapping for URL-to-numeric-ID conversion.
 */
interface AssetMapping {
  /** Next available asset ID */
  nextId: number;
  /** URL to ID mapping */
  urlToId: Map<string, number>;
  /** ID to URL mapping (for debugging) */
  idToUrl: Map<number, string>;
}

/**
 * One face of a registered font family. Held by the master so each render
 * can resolve a `mask.type.fontfamily` CSS list to the asset IDs that need
 * shipping to the relevant text slaves.
 */
interface FontFaceEntry {
  assetId: number;
  url: string;
  descriptors: FontFaceDeliveryDescriptors;
}

/**
 * Parse a CSS-style font family list (e.g. `"Helvetica", "Arial", sans-serif`)
 * into an ordered list of trimmed family names. Generic families are kept in
 * place — the resolver picks the first family that has been registered, so a
 * generic that happens to appear before a registered family will still defer
 * to it as long as a generic isn't itself registered.
 */
export function parseFontFamilyList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((token) => token.trim().replace(/^["']|["']$/g, '').trim())
    .filter((token) => token.length > 0);
}

/**
 * Emit a single console warning if any two faces in this batch share the
 * same (weight, style) pair. The browser uses last-added wins, which is
 * deterministic but usually a sign the caller made a mistake.
 */
function seenWeightStylePairsWarning(
  family: string,
  faces: readonly FontFaceDescriptor[]
): void {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const f of faces) {
    const key = `${String(f.weight ?? '400')}/${f.style ?? 'normal'}`;
    if (seen.has(key)) {
      dups.push(key);
    } else {
      seen.add(key);
    }
  }
  if (dups.length > 0) {
    console.warn(
      `loadFontFamily('${family}'): duplicate weight/style face(s): ${dups.join(', ')} (last-added wins)`
    );
  }
}

/**
 * Pending render state.
 */
interface PendingRender {
  /** Layers being rendered */
  layers: ProductImageComponent[];
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Classification result */
  classification: ClassificationResult;
  /** Collected results from slaves (keyed by slave ID) */
  results: Map<number, RenderSegment[]>;
  /** Layers assigned to each standard slave (for tracking) */
  slaveAssignments: Map<number, number[]>;
  /** Layers assigned to each text slave (for tracking) */
  textSlaveAssignments: Map<number, number[]>;
  /** Promise resolver */
  resolve: (bitmap: ImageBitmap) => void;
  /** Promise rejecter */
  reject: (error: Error) => void;
  /** Abort controller */
  abortController: AbortController;
}

/**
 * RenderMaster class - orchestrates the multi-threaded rendering pipeline.
 */
export class RenderMaster {
  /** Asset Manager worker */
  private assetManager: Worker | null = null;

  /** Standard render slaves */
  private slaves: SlaveState[] = [];

  /** Text render slaves */
  private textSlaves: SlaveState[] = [];

  /** Master compositor for final composition (scenarios A-E) */
  private compositor: MasterCompositor;

  /** Software compositor for Scenario F */
  private softwareCompositor: SoftwareCompositor | null = null;

  /** Asset ID mapping */
  private assetMapping: AssetMapping;

  /**
   * Registered font families, snapshot-visible to in-flight renders. Each
   * call to `loadFontFamily()` adds entries here only after every face has
   * been fetched into the asset manager — that prevents a face's asset ID
   * from being shipped to a slave before the bytes exist.
   */
  private fontFamilies = new Map<string, FontFaceEntry[]>();

  /** Current pending render */
  private pendingRender: PendingRender | null = null;

  /** Detected capabilities */
  private capabilities: { offscreenCanvas: boolean; webgl2: boolean; scenario: FallbackScenario };

  /** Default dimensions */
  private defaultWidth: number;
  private defaultHeight: number;

  /** Configuration */
  private slaveCount: number;
  private textSlaveCount: number;

  /** Initialization promise */
  private initPromise: Promise<void> | null = null;

  /** Destroyed flag */
  private destroyed = false;

  /** Next slave ID counter */
  private nextSlaveId = 1;

  /**
   * Counter for asset-manager request correlation IDs. The master can have
   * multiple concurrent fetch / distribute calls in flight (e.g. parallel
   * `loadFontFamily` calls). Each request gets a unique ID via this counter,
   * and the response handler only resolves when the response's `requestId`
   * matches — without correlation, the first-arriving response would
   * resolve every waiting handler regardless of which actual fetch
   * completed, causing distribute to race ahead of in-flight fetches and
   * fail with "Asset N not in cache" warnings.
   */
  private nextAssetRequestId = 1;

  /**
   * Active topic subscriptions for pimco lifecycle events. Each topic is the
   * subscription string the caller passed to `on()` — possibly containing `*`
   * wildcards. When the map is non-empty, the master signals slaves (via
   * BatchMessage.emitLifecycle) to emit PimcoEventMessages; arrived events
   * have a topic constructed from their stage/pimcoId/part fields and are
   * dispatched to every subscriber whose pattern matches that topic.
   */
  private eventSubscribers = new Map<string, Set<PimcoLayerEventListener>>();

  constructor(options: RenderMasterOptions = {}) {
    this.defaultWidth = options.width ?? 1024;
    this.defaultHeight = options.height ?? 1024;
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    this.slaveCount = options.slaveCount ?? Math.min(hardwareConcurrency, 8);
    // Text slaves default to 2 - text rendering with effects is more intensive
    this.textSlaveCount = options.textSlaveCount ?? 2;

    this.compositor = new MasterCompositor();
    this.assetMapping = {
      nextId: 1,
      urlToId: new Map(),
      idToUrl: new Map(),
    };

    // Detect capabilities immediately. When `forceScenario` overrides the
    // probed scenario (used by the dev app to exercise virtual-slave paths),
    // we keep the probed offscreenCanvas/webgl2 flags so anything that gates
    // on them still behaves correctly — only the spawn/routing decision
    // follows the forced scenario.
    const probed = probeCapabilities();
    if (options.forceScenario && probed.scenario !== options.forceScenario) {
      const main = options.forceScenario === 'A' || options.forceScenario === 'B' || options.forceScenario === 'C';
      const probedIsMain = probed.scenario === 'A' || probed.scenario === 'B' || probed.scenario === 'C';
      if (main !== probedIsMain) {
        console.warn(
          `forceScenario=${options.forceScenario} crosses the main-thread/worker boundary ` +
            `(probed=${probed.scenario}); ignoring override.`
        );
        this.capabilities = probed;
      } else {
        this.capabilities = { ...probed, scenario: options.forceScenario };
      }
    } else {
      this.capabilities = probed;
    }

    // Start initialization
    this.initPromise = this.initialize();
  }

  /**
   * Initialize workers and wait for them to be ready.
   *
   * Spawns the appropriate combination of workers and virtual slaves
   * based on the detected fallback scenario:
   * - A: Workers for standard + text
   * - B: Workers for standard, virtual for text
   * - C: Virtual for both
   * - D: Workers for standard + text
   * - E: Workers for standard, virtual for text
   * - F: Virtual for both, software compositor
   */
  private async initialize(): Promise<void> {
    const scenario = this.capabilities.scenario;

    // Initialize software compositor for Scenario F
    if (scenario === 'F') {
      this.softwareCompositor = new SoftwareCompositor();
    }

    // Spawn Asset Manager (always needed)
    this.assetManager = new Worker(AssetManagerWorkerUrl, { type: 'module' });

    // Handle Asset Manager messages
    this.assetManager.onmessage = (event: MessageEvent<AssetManagerToMasterMessage>) => {
      this.handleAssetManagerMessage(event.data);
    };

    this.assetManager.onerror = (event: ErrorEvent) => {
      console.error('Asset Manager error:', event.message);
    };

    const initPromises: Promise<void>[] = [];

    // Determine which slave types to use based on scenario
    // Standard slaves: A, B, D, E use workers; C, F use virtual
    const useStandardWorkers =
      scenario === 'A' || scenario === 'B' || scenario === 'D' || scenario === 'E';

    // Text slaves: A, D use workers; B, C, E, F use virtual
    const useTextWorkers = scenario === 'A' || scenario === 'D';

    // Spawn standard slaves
    if (useStandardWorkers) {
      initPromises.push(this.spawnSlaves());
    } else {
      // Scenarios C and F: use virtual standard slaves
      initPromises.push(this.spawnVirtualStandardSlaves());
    }

    // Spawn text slaves
    if (useTextWorkers) {
      initPromises.push(this.spawnTextSlaves());
    } else {
      // Scenarios B, C, E, F: use virtual text slaves
      initPromises.push(this.spawnVirtualTextSlaves());
    }

    await Promise.all(initPromises);
  }

  /**
   * Spawn standard render slaves (real workers).
   */
  private async spawnSlaves(): Promise<void> {
    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.slaveCount; i++) {
      const slaveId = this.nextSlaveId++;
      const worker = new Worker(RenderSlaveWorkerUrl, { type: 'module' });
      const assetChannel = new MessageChannel();

      const slaveState: SlaveState = {
        worker: worker as SlaveInstance,
        id: slaveId,
        type: 'standard',
        isVirtual: false,
        ready: false,
        capabilities: null,
        assetChannel,
        renderResolver: null,
        renderRejecter: null,
      };

      // Create ready promise
      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new WorkerError('Slave initialization timeout', slaveId));
        }, 10000);

        worker.onmessage = (event: MessageEvent<SlaveToMasterMessage>) => {
          this.handleSlaveMessage(slaveState, event.data);

          if (isReadyMessage(event.data)) {
            slaveState.ready = true;
            clearTimeout(timeout);
            resolve();
          }
        };

        worker.onerror = (event: ErrorEvent) => {
          clearTimeout(timeout);
          reject(new WorkerError(event.message || 'Slave worker error', slaveId));
        };
      });

      readyPromises.push(readyPromise);
      this.slaves.push(slaveState);

      // Register slave with Asset Manager
      if (this.assetManager) {
        this.assetManager.postMessage(
          {
            type: 'register-slave',
            slaveId,
            port: assetChannel.port1,
          },
          [assetChannel.port1]
        );
      }

      // Send init message with asset port
      worker.postMessage({ type: 'init' }, [assetChannel.port2]);
    }

    // Wait for all slaves to be ready
    await Promise.all(readyPromises);
  }

  /**
   * Spawn virtual standard slaves (main-thread fallback for scenarios C and F).
   */
  private async spawnVirtualStandardSlaves(): Promise<void> {
    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.slaveCount; i++) {
      const slaveId = this.nextSlaveId++;
      const virtualSlave = new VirtualStandardSlave({ deferMessages: true });
      const assetChannel = new MessageChannel();

      const slaveState: SlaveState = {
        worker: virtualSlave,
        id: slaveId,
        type: 'standard',
        isVirtual: true,
        ready: false,
        capabilities: null,
        assetChannel,
        renderResolver: null,
        renderRejecter: null,
      };

      // Create ready promise
      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new WorkerError('Virtual slave initialization timeout', slaveId));
        }, 10000);

        virtualSlave.onmessage = (event: MessageEvent<SlaveToMasterMessage>) => {
          this.handleSlaveMessage(slaveState, event.data);

          if (isReadyMessage(event.data)) {
            slaveState.ready = true;
            clearTimeout(timeout);
            resolve();
          }
        };

        virtualSlave.onerror = (event: ErrorEvent | Event) => {
          clearTimeout(timeout);
          const message = event instanceof ErrorEvent ? event.message : 'Virtual slave error';
          reject(new WorkerError(message, slaveId));
        };
      });

      readyPromises.push(readyPromise);
      this.slaves.push(slaveState);

      // Register virtual slave with Asset Manager
      if (this.assetManager) {
        this.assetManager.postMessage(
          {
            type: 'register-slave',
            slaveId,
            port: assetChannel.port1,
          },
          [assetChannel.port1]
        );
      }

      // Send init message with asset port
      virtualSlave.postMessage({ type: 'init' }, [assetChannel.port2]);
    }

    // Wait for all virtual slaves to be ready
    await Promise.all(readyPromises);
  }

  /**
   * Spawn text render slaves (real workers).
   */
  private async spawnTextSlaves(): Promise<void> {
    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.textSlaveCount; i++) {
      const slaveId = this.nextSlaveId++;
      const worker = new Worker(TextRenderSlaveWorkerUrl, { type: 'module' });
      const assetChannel = new MessageChannel();

      const slaveState: SlaveState = {
        worker: worker as SlaveInstance,
        id: slaveId,
        type: 'text',
        isVirtual: false,
        ready: false,
        capabilities: null,
        assetChannel,
        renderResolver: null,
        renderRejecter: null,
      };

      // Create ready promise
      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new WorkerError('Text slave initialization timeout', slaveId));
        }, 10000);

        worker.onmessage = (event: MessageEvent<SlaveToMasterMessage>) => {
          this.handleSlaveMessage(slaveState, event.data);

          if (isReadyMessage(event.data)) {
            slaveState.ready = true;
            clearTimeout(timeout);
            resolve();
          }
        };

        worker.onerror = (event: ErrorEvent) => {
          clearTimeout(timeout);
          reject(new WorkerError(event.message || 'Text slave worker error', slaveId));
        };
      });

      readyPromises.push(readyPromise);
      this.textSlaves.push(slaveState);

      // Register text slave with Asset Manager
      if (this.assetManager) {
        this.assetManager.postMessage(
          {
            type: 'register-slave',
            slaveId,
            port: assetChannel.port1,
          },
          [assetChannel.port1]
        );
      }

      // Send init message with asset port
      worker.postMessage({ type: 'init' }, [assetChannel.port2]);
    }

    // Wait for all text slaves to be ready
    await Promise.all(readyPromises);
  }

  /**
   * Spawn virtual text slaves (main-thread fallback for scenarios B, C, E, F).
   */
  private async spawnVirtualTextSlaves(): Promise<void> {
    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.textSlaveCount; i++) {
      const slaveId = this.nextSlaveId++;
      const virtualSlave = new VirtualTextSlave({ deferMessages: true });
      const assetChannel = new MessageChannel();

      const slaveState: SlaveState = {
        worker: virtualSlave,
        id: slaveId,
        type: 'text',
        isVirtual: true,
        ready: false,
        capabilities: null,
        assetChannel,
        renderResolver: null,
        renderRejecter: null,
      };

      // Create ready promise
      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new WorkerError('Virtual text slave initialization timeout', slaveId));
        }, 10000);

        virtualSlave.onmessage = (event: MessageEvent<SlaveToMasterMessage>) => {
          this.handleSlaveMessage(slaveState, event.data);

          if (isReadyMessage(event.data)) {
            slaveState.ready = true;
            clearTimeout(timeout);
            resolve();
          }
        };

        virtualSlave.onerror = (event: ErrorEvent | Event) => {
          clearTimeout(timeout);
          const message = event instanceof ErrorEvent ? event.message : 'Virtual text slave error';
          reject(new WorkerError(message, slaveId));
        };
      });

      readyPromises.push(readyPromise);
      this.textSlaves.push(slaveState);

      // Register virtual text slave with Asset Manager
      if (this.assetManager) {
        this.assetManager.postMessage(
          {
            type: 'register-slave',
            slaveId,
            port: assetChannel.port1,
          },
          [assetChannel.port1]
        );
      }

      // Send init message with asset port
      virtualSlave.postMessage({ type: 'init' }, [assetChannel.port2]);
    }

    // Wait for all virtual text slaves to be ready
    await Promise.all(readyPromises);
  }

  /**
   * Handle message from Asset Manager.
   */
  private handleAssetManagerMessage(message: AssetManagerToMasterMessage): void {
    // Currently used for fetch-complete and distribute-complete
    // These are handled via awaited message patterns
    if (isErrorMessage(message)) {
      const errorMsg = message as unknown as ErrorMessage;
      console.error('Asset Manager error:', errorMsg.message);
    }
  }

  /**
   * Handle message from a slave.
   */
  private handleSlaveMessage(slave: SlaveState, message: SlaveToMasterMessage): void {
    if (isCapabilitiesMessage(message)) {
      slave.capabilities = message;
      return;
    }

    if (isResultMessage(message)) {
      // Store results and check if render is complete
      if (this.pendingRender && slave.renderResolver) {
        slave.renderResolver(message.segments);
        slave.renderResolver = null;
        slave.renderRejecter = null;
      }
      return;
    }

    if (isErrorMessage(message)) {
      if (slave.renderRejecter) {
        slave.renderRejecter(new RenderError(message.message, 'slave-render', undefined, {}));
        slave.renderResolver = null;
        slave.renderRejecter = null;
      }
      return;
    }

    if (isPimcoEventMessage(message)) {
      const topic = buildEventTopic(message.stage, message.pimcoId, message.part);
      const payload: PimcoLayerEvent = {
        pimcoId: message.pimcoId,
        bitmap: message.bitmap,
        ...(message.part !== undefined && { part: message.part }),
        ...(message.meta !== undefined && { meta: message.meta }),
      };
      this.dispatchPimcoEvent(topic, payload);
      return;
    }
  }

  /**
   * Subscribe to pimco lifecycle events. Returns an unsubscribe function.
   *
   * Topic format:
   *   - `pimcoRender:{pimcoId}` — emitted once per layer with its final
   *     isolated bitmap (after effect, transform, and post-mask).
   *   - `pimcoRenderPart:{pimcoId}:{partName}` — emitted per intermediate
   *     stage. `partName` is effect-specific (e.g. `text` for the rasterized
   *     text mask; later effects add their own part names).
   *
   * `*` matches any single segment, so e.g. `pimcoRenderPart:*:text` fires
   * for every layer's rasterized-text snapshot. Topic segments are split by
   * `:`; segment counts must match exactly (no multi-segment wildcards).
   *
   * Listeners are invoked synchronously per arrived event. A throwing
   * listener is caught and logged; it does not affect other listeners or the
   * render itself.
   *
   * Bitmap lifetime: the `event.bitmap` field is owned by the master and is
   * closed after all matching listeners have run synchronously. Listeners
   * should draw / read from it synchronously inside the handler. If a
   * listener needs to retain the bitmap asynchronously, it must clone it
   * synchronously inside the handler via `createImageBitmap(event.bitmap)` —
   * the resulting promise's bitmap is independent of the master's copy.
   * Listeners must NOT call `event.bitmap.close()` themselves.
   */
  on(eventName: string, listener: PimcoLayerEventListener): () => void {
    let listeners = this.eventSubscribers.get(eventName);
    if (!listeners) {
      listeners = new Set();
      this.eventSubscribers.set(eventName, listeners);
    }
    listeners.add(listener);
    return () => {
      const set = this.eventSubscribers.get(eventName);
      if (!set) {
        return;
      }
      set.delete(listener);
      if (set.size === 0) {
        this.eventSubscribers.delete(eventName);
      }
    };
  }

  /**
   * Snapshot of the currently-registered subscription patterns. Sent to slaves
   * with each BatchMessage so they can gate per-emission via topicHasSubscriber.
   * Returned as a plain string[] for cheap structured-clone transfer.
   */
  private activeSubscriptionPatterns(): string[] {
    return Array.from(this.eventSubscribers.keys());
  }

  private dispatchPimcoEvent(topic: string, payload: PimcoLayerEvent): void {
    for (const [pattern, listeners] of this.eventSubscribers) {
      if (!matchEventTopic(pattern, topic)) {
        continue;
      }
      for (const listener of listeners) {
        try {
          listener(payload);
        } catch (err) {
          console.error(`[RenderMaster] subscriber for "${pattern}" threw:`, err);
        }
      }
    }
    // The bitmap was created in the slave via createImageBitmap and transferred
    // here. After all sync listeners have used it, release it so the GPU
    // texture can be reclaimed. Listeners that need async retention must
    // clone via createImageBitmap synchronously inside their handler.
    payload.bitmap.close();
  }

  /**
   * Ensure initialization is complete before operations.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.destroyed) {
      throw new RenderError('RenderMaster has been destroyed');
    }
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Get or create an asset ID for a URL.
   * Returns -1 for URLs that have previously failed to load (stored as -1 in urlToId).
   */
  private getAssetId(url: string): number {
    const existing = this.assetMapping.urlToId.get(url);
    if (existing !== undefined) {
      return existing; // Returns -1 for failed URLs, positive ID for successful ones
    }

    const id = this.assetMapping.nextId++;
    this.assetMapping.urlToId.set(url, id);
    this.assetMapping.idToUrl.set(id, url);
    return id;
  }

  /**
   * Resolve color value to a single string.
   */
  private resolveColor(
    color: string | string[] | Record<string, string> | undefined,
    colorIdx?: number | string
  ): string | undefined {
    if (color === undefined) {
      return undefined;
    }

    if (typeof color === 'string') {
      return color;
    }

    if (Array.isArray(color)) {
      const idx = typeof colorIdx === 'number' ? colorIdx : 0;
      return color[idx] ?? color[0];
    }

    // Record type
    const key = String(colorIdx ?? Object.keys(color)[0]);
    return color[key] ?? Object.values(color)[0];
  }

  /**
   * Extract all asset URLs from layers and create fetch requests.
   * Skips URLs that have previously failed to load (ID of -1 in urlToId map).
   */
  private extractAssetRequests(layers: ProductImageComponent[]): AssetRequest[] {
    const requests: AssetRequest[] = [];
    const seen = new Set<string>();

    const addImageRequest = (url: string | undefined): void => {
      if (url && !seen.has(url)) {
        seen.add(url);
        // Skip URLs already in the asset map (previously fetched or known failed)
        if (this.assetMapping.urlToId.has(url)) {
          return;
        }
        const id = this.getAssetId(url);
        requests.push({
          id,
          url,
          assetType: 'image',
        });
      }
    };

    const addMeshRequest = (url: string | undefined): void => {
      if (url && !seen.has(url)) {
        seen.add(url);
        if (this.assetMapping.urlToId.has(url)) {
          return;
        }
        const id = this.getAssetId(url);
        requests.push({
          id,
          url,
          assetType: 'mesh',
        });
      }
    };

    for (const layer of layers) {
      addImageRequest(layer.image);

      // Handle mask based on layer type
      if (isStandardLayerMask(layer.mask)) {
        // Standard layer: mask is a URL
        addImageRequest(layer.mask);
      } else if (isTextLayerMask(layer.mask)) {
        // Text layer: extract postmask URL if present
        addImageRequest(layer.mask.postmask);
        // And the projection mesh URL if the layer projects onto a 3D surface.
        addMeshRequest(layer.mask.projection?.mesh);
      }

      addImageRequest(layer.texture);
      addImageRequest(layer.hlimage1);
      addImageRequest(layer.hlimage2);
    }

    return requests;
  }

  /**
   * Convert a ProductImageComponent to a LayerDescriptor for slave communication.
   */
  private layerToDescriptor(layer: ProductImageComponent): LayerDescriptor {
    const assetIds: LayerDescriptor['assetIds'] = {
      image: this.getAssetId(layer.image),
    };

    // Add mask asset ID only for standard layers
    if (isStandardLayerMask(layer.mask)) {
      assetIds.mask = this.getAssetId(layer.mask);
    }

    if (layer.texture) {
      assetIds.texture = this.getAssetId(layer.texture);
    }

    if (layer.hlimage1) {
      assetIds.hlimage1 = this.getAssetId(layer.hlimage1);
    }

    if (layer.hlimage2) {
      assetIds.hlimage2 = this.getAssetId(layer.hlimage2);
    }

    const descriptor: LayerDescriptor = {
      id: layer.id,
      assetIds,
      mode: layer.mode,
      alpha: layer.alpha,
      blend: layer.blend,
      compositemode: layer.compositemode ?? 'source-over',
      compositealpha: layer.compositealpha ?? 1.0,
    };

    // Add optional fields
    const color = this.resolveColor(layer.color, layer.coloridx);
    if (color !== undefined) {
      descriptor.color = color;
    }

    if (layer.hlalpha1 !== undefined) {
      descriptor.hlalpha1 = layer.hlalpha1;
    }

    if (layer.hlblend1 !== undefined) {
      descriptor.hlblend1 = layer.hlblend1;
    }

    if (layer.hlalpha2 !== undefined) {
      descriptor.hlalpha2 = layer.hlalpha2;
    }

    if (layer.hlblend2 !== undefined) {
      descriptor.hlblend2 = layer.hlblend2;
    }

    if (layer.placement !== undefined) {
      descriptor.placement = layer.placement;
    }

    return descriptor;
  }

  /**
   * Convert a ProductImageComponent with text mask to a TextLayerDescriptor.
   *
   * @param layer - The layer to convert (must have PimcoMaskSubstitutionCompiled mask)
   * @param maskData - The already-extracted mask data
   * @returns TextLayerDescriptor for text slave communication
   */
  private textLayerToDescriptor(
    layer: ProductImageComponent,
    maskData: PimcoMaskSubstitutionCompiled
  ): TextLayerDescriptor {
    const assetIds: TextLayerDescriptor['assetIds'] = {
      image: this.getAssetId(layer.image),
    };

    // Add optional asset IDs
    if (layer.texture) {
      assetIds.texture = this.getAssetId(layer.texture);
    }

    if (maskData.postmask) {
      assetIds.postmask = this.getAssetId(maskData.postmask);
    }

    if (maskData.projection?.mesh) {
      assetIds.mesh = this.getAssetId(maskData.projection.mesh);
    }

    const descriptor: TextLayerDescriptor = {
      id: layer.id,
      assetIds,
      mode: layer.mode,
      alpha: layer.alpha,
      blend: layer.blend,
      compositemode: layer.compositemode ?? 'source-over',
      compositealpha: layer.compositealpha ?? 1.0,
      maskData,
    };

    // Add optional color field
    const color = this.resolveColor(layer.color, layer.coloridx);
    if (color !== undefined) {
      descriptor.color = color;
    }

    return descriptor;
  }

  /**
   * Send fetch request to Asset Manager and wait for completion.
   */
  private async fetchAssets(requests: AssetRequest[]): Promise<number[]> {
    const assetManager = this.assetManager;
    if (!assetManager || requests.length === 0) {
      return [];
    }

    const requestId = this.nextAssetRequestId++;

    return new Promise<number[]>((resolve) => {
      const handler = (event: MessageEvent<AssetManagerToMasterMessage>): void => {
        // Only resolve when the response's requestId matches OUR request.
        // Without this correlation, concurrent fetch calls would all resolve
        // on the first fetch-complete to arrive — even though most of their
        // fetches are still in flight.
        if (isFetchCompleteMessage(event.data) && event.data.requestId === requestId) {
          assetManager.removeEventListener('message', handler);
          resolve(event.data.failed);
        }
      };

      assetManager.addEventListener('message', handler);
      assetManager.postMessage({ type: 'fetch', requestId, assets: requests });
    });
  }

  /**
   * Send distribute request to Asset Manager and wait for completion.
   */
  private async distributeAssets(deliveries: AssetDelivery[]): Promise<void> {
    const assetManager = this.assetManager;
    if (!assetManager || deliveries.length === 0) {
      return;
    }

    const requestId = this.nextAssetRequestId++;

    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent<AssetManagerToMasterMessage>): void => {
        // Match by requestId — same rationale as fetchAssets above.
        if (
          isDistributeCompleteMessage(event.data) &&
          event.data.requestId === requestId
        ) {
          assetManager.removeEventListener('message', handler);
          resolve();
        }
      };

      assetManager.addEventListener('message', handler);
      assetManager.postMessage({ type: 'distribute', requestId, deliveries });
    });
  }

  /**
   * Build a map from original pimco layer index to approved order index.
   * The approved order index is the position in classification.all, which
   * represents the continuous z-order of all layers that will be rendered.
   * This ensures that skipped/failed layers don't create gaps in the index sequence.
   */
  private buildOrderIndexMap(classification: ClassificationResult): Map<number, number> {
    const orderIndexMap = new Map<number, number>();
    for (let i = 0; i < classification.all.length; i++) {
      // Map original pimco index -> position in approved layer list
      orderIndexMap.set(classification.all[i].index, i);
    }
    return orderIndexMap;
  }

  /**
   * Distribute standard layers across available standard slaves.
   * Returns a map of slave ID to layer descriptors and order indices.
   */
  private distributeLayersToSlaves(
    classification: ClassificationResult,
    orderIndexMap: Map<number, number>
  ): Map<number, { descriptors: LayerDescriptor[]; indices: number[] }> {
    const distribution = new Map<number, { descriptors: LayerDescriptor[]; indices: number[] }>();

    // Initialize distribution for all standard slaves
    for (const slave of this.slaves) {
      distribution.set(slave.id, { descriptors: [], indices: [] });
    }

    // Distribute standard layers round-robin
    const standardLayers = classification.standard;
    for (let i = 0; i < standardLayers.length; i++) {
      const slaveIdx = i % this.slaves.length;
      const slave = this.slaves[slaveIdx];
      const layerInfo = standardLayers[i];
      const descriptor = this.layerToDescriptor(layerInfo.layer);

      // Use order index (position in approved list) not raw pimco index
      const orderIndex = orderIndexMap.get(layerInfo.index) ?? i;

      const slaveData = distribution.get(slave.id);
      if (slaveData) {
        slaveData.descriptors.push(descriptor);
        slaveData.indices.push(orderIndex);
      }
    }

    return distribution;
  }

  /**
   * Distribute text layers across available text slaves.
   * Returns a map of slave ID to text layer descriptors and order indices.
   */
  private distributeTextLayersToSlaves(
    classification: ClassificationResult,
    orderIndexMap: Map<number, number>
  ): Map<number, { descriptors: TextLayerDescriptor[]; indices: number[] }> {
    const distribution = new Map<
      number,
      { descriptors: TextLayerDescriptor[]; indices: number[] }
    >();

    // If no text slaves available, return empty distribution
    if (this.textSlaves.length === 0) {
      return distribution;
    }

    // Initialize distribution for all text slaves
    for (const slave of this.textSlaves) {
      distribution.set(slave.id, { descriptors: [], indices: [] });
    }

    // Distribute text layers round-robin
    const textLayers = classification.text;
    for (let i = 0; i < textLayers.length; i++) {
      const slaveIdx = i % this.textSlaves.length;
      const slave = this.textSlaves[slaveIdx];
      const layerInfo = textLayers[i];

      // Text layers have maskData in the classification result
      const maskData = layerInfo.maskData;
      if (!maskData) {
        console.warn(`Text layer ${layerInfo.layer.id} missing maskData, skipping`);
        continue;
      }

      const descriptor = this.textLayerToDescriptor(layerInfo.layer, maskData);

      // Use order index (position in approved list) not raw pimco index
      const orderIndex = orderIndexMap.get(layerInfo.index) ?? i;

      const slaveData = distribution.get(slave.id);
      if (slaveData) {
        slaveData.descriptors.push(descriptor);
        slaveData.indices.push(orderIndex);
      }
    }

    return distribution;
  }

  /**
   * Collect asset IDs needed by each standard slave.
   */
  private collectSlaveAssetIds(
    distribution: Map<number, { descriptors: LayerDescriptor[]; indices: number[] }>
  ): Map<number, number[]> {
    const slaveAssets = new Map<number, number[]>();

    for (const [slaveId, { descriptors }] of distribution) {
      const assetIds = new Set<number>();

      for (const descriptor of descriptors) {
        assetIds.add(descriptor.assetIds.image);
        if (descriptor.assetIds.mask !== undefined) {
          assetIds.add(descriptor.assetIds.mask);
        }
        if (descriptor.assetIds.texture !== undefined) {
          assetIds.add(descriptor.assetIds.texture);
        }
        if (descriptor.assetIds.hlimage1 !== undefined) {
          assetIds.add(descriptor.assetIds.hlimage1);
        }
        if (descriptor.assetIds.hlimage2 !== undefined) {
          assetIds.add(descriptor.assetIds.hlimage2);
        }
      }

      slaveAssets.set(slaveId, Array.from(assetIds));
    }

    return slaveAssets;
  }

  /**
   * Collect asset IDs needed by each text slave. Includes image-typed
   * assets directly referenced by the layer descriptors PLUS any font face
   * asset IDs resolved from each layer's `fontfamily` against the registry,
   * PLUS any projection mesh asset IDs. Returns the per-slave full asset list
   * and parallel per-slave font/mesh ID lists — the font and mesh subsets are
   * sent on the BatchMessage as `requiredFontIds` / `requiredMeshIds` so the
   * slave's batch coordinator gates on font load + mesh parse completion.
   */
  private collectTextSlaveAssetIds(
    distribution: Map<number, { descriptors: TextLayerDescriptor[]; indices: number[] }>
  ): {
    slaveAssets: Map<number, number[]>;
    slaveFontIds: Map<number, number[]>;
    slaveMeshIds: Map<number, number[]>;
  } {
    const slaveAssets = new Map<number, number[]>();
    const slaveFontIds = new Map<number, number[]>();
    const slaveMeshIds = new Map<number, number[]>();

    for (const [slaveId, { descriptors }] of distribution) {
      const assetIds = new Set<number>();
      const fontIds = new Set<number>();
      const meshIds = new Set<number>();

      for (const descriptor of descriptors) {
        assetIds.add(descriptor.assetIds.image);
        if (descriptor.assetIds.texture !== undefined) {
          assetIds.add(descriptor.assetIds.texture);
        }
        if (descriptor.assetIds.postmask !== undefined) {
          assetIds.add(descriptor.assetIds.postmask);
        }
        if (descriptor.assetIds.mesh !== undefined && descriptor.assetIds.mesh >= 0) {
          assetIds.add(descriptor.assetIds.mesh);
          meshIds.add(descriptor.assetIds.mesh);
        }

        const resolved = this.resolveFamilyFaceIds(descriptor.maskData.type?.fontfamily);
        for (const id of resolved) {
          if (id >= 0) {
            assetIds.add(id);
            fontIds.add(id);
          }
        }
      }

      slaveAssets.set(slaveId, Array.from(assetIds));
      slaveFontIds.set(slaveId, Array.from(fontIds));
      slaveMeshIds.set(slaveId, Array.from(meshIds));
    }

    return { slaveAssets, slaveFontIds, slaveMeshIds };
  }

  /**
   * Render layers to produce a composited ImageBitmap.
   * Automatically aborts any in-progress render.
   *
   * @param layers - Array of ProductImageComponent layers (sorted by order)
   * @param width - Output width (default: constructor width or 1024)
   * @param height - Output height (default: constructor height or 1024)
   * @returns Promise resolving to the composited ImageBitmap
   */
  async render(
    layers: ProductImageComponent[],
    width?: number,
    height?: number
  ): Promise<ImageBitmap> {
    await this.ensureInitialized();

    const renderWidth = width ?? this.defaultWidth;
    const renderHeight = height ?? this.defaultHeight;

    // Abort any in-progress render
    if (this.pendingRender) {
      this.abortCurrentRender();
    }

    // Create abort controller for this render
    const abortController = new AbortController();

    // Classify layers
    const classification = classifyLayers(layers);

    // Handle empty layers
    if (classification.total === 0) {
      // Return empty bitmap
      return this.compositor.compose([], renderWidth, renderHeight);
    }

    // Extract and fetch assets
    const assetRequests = this.extractAssetRequests(layers);
    const failedAssets = await this.fetchAssets(assetRequests);

    if (failedAssets.length > 0) {
      const failedUrlsList = failedAssets.map((id) => this.assetMapping.idToUrl.get(id) ?? String(id));
      console.warn('Some assets failed to load:', failedUrlsList);

      // Mark these URLs as failed by setting their ID to -1 in urlToId map
      // This prevents re-requesting on subsequent renders
      for (const id of failedAssets) {
        const url = this.assetMapping.idToUrl.get(id);
        if (url) {
          this.assetMapping.urlToId.set(url, -1);
        }
      }
    }

    // Check for abort
    if (abortController.signal.aborted) {
      throw new AbortError('Render aborted');
    }

    // Build order index map for continuous z-order indices
    const orderIndexMap = this.buildOrderIndexMap(classification);

    // Distribute layers to slaves
    const distribution = this.distributeLayersToSlaves(classification, orderIndexMap);
    const textDistribution = this.distributeTextLayersToSlaves(classification, orderIndexMap);

    // Collect asset IDs for each slave
    const slaveAssetIds = this.collectSlaveAssetIds(distribution);
    const {
      slaveAssets: textSlaveAssetIds,
      slaveFontIds: textSlaveFontIds,
      slaveMeshIds: textSlaveMeshIds,
    } = this.collectTextSlaveAssetIds(textDistribution);

    // Distribute assets to all slaves (standard and text)
    const deliveries: AssetDelivery[] = [];
    for (const [slaveId, assetIds] of slaveAssetIds) {
      if (assetIds.length > 0) {
        deliveries.push({ slaveId, assetIds });
      }
    }
    for (const [slaveId, assetIds] of textSlaveAssetIds) {
      if (assetIds.length > 0) {
        deliveries.push({ slaveId, assetIds });
      }
    }
    await this.distributeAssets(deliveries);

    // Check for abort again (signal may be aborted during await above)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (abortController.signal.aborted) {
      throw new AbortError('Render aborted');
    }

    // Create pending render state
    const slaveAssignments = new Map<number, number[]>();
    for (const [slaveId, { indices }] of distribution) {
      slaveAssignments.set(slaveId, indices);
    }

    const textSlaveAssignments = new Map<number, number[]>();
    for (const [slaveId, { indices }] of textDistribution) {
      textSlaveAssignments.set(slaveId, indices);
    }

    // Set up pending render state
    this.pendingRender = {
      layers,
      width: renderWidth,
      height: renderHeight,
      classification,
      results: new Map(),
      slaveAssignments,
      textSlaveAssignments,
      resolve: () => {
        /* Will be set below */
      },
      reject: () => {
        /* Will be set below */
      },
      abortController,
    };

    // Send batch messages to standard slaves
    const slavePromises: Promise<{
      slaveId: number;
      segments: RenderSegment[];
      isTextSlave: boolean;
    }>[] = [];

    for (const slave of this.slaves) {
      const slaveData = distribution.get(slave.id);
      if (!slaveData || slaveData.descriptors.length === 0) {
        continue;
      }

      const slavePromise = new Promise<{
        slaveId: number;
        segments: RenderSegment[];
        isTextSlave: boolean;
      }>((resolve, reject) => {
        slave.renderResolver = (segments) => {
          resolve({ slaveId: slave.id, segments, isTextSlave: false });
        };
        slave.renderRejecter = reject;
      });

      slavePromises.push(slavePromise);

      // Send batch to slave with original indices for ordering. The active
      // event subscription patterns travel with each batch so the slave can
      // gate per-emission (skip the createImageBitmap when nothing matches).
      slave.worker.postMessage({
        type: 'batch',
        layers: slaveData.descriptors,
        indices: slaveData.indices,
        width: renderWidth,
        height: renderHeight,
        eventSubscriptions: this.activeSubscriptionPatterns(),
      });
    }

    // Send batch messages to text slaves
    for (const textSlave of this.textSlaves) {
      const slaveData = textDistribution.get(textSlave.id);
      if (!slaveData || slaveData.descriptors.length === 0) {
        continue;
      }

      const slavePromise = new Promise<{
        slaveId: number;
        segments: RenderSegment[];
        isTextSlave: boolean;
      }>((resolve, reject) => {
        textSlave.renderResolver = (segments) => {
          resolve({ slaveId: textSlave.id, segments, isTextSlave: true });
        };
        textSlave.renderRejecter = reject;
      });

      slavePromises.push(slavePromise);

      // Send batch to text slave (text slaves expect TextLayerDescriptor array).
      // Patterns sent each batch — see the standard-slave dispatch above.
      // requiredFontIds gates the slave's batch coordinator on FontFace.load
      // resolution so layout uses real font metrics, not the fallback face.
      // requiredMeshIds gates on parsed mesh availability for projection layers.
      const fontIds = textSlaveFontIds.get(textSlave.id) ?? [];
      const meshIds = textSlaveMeshIds.get(textSlave.id) ?? [];
      textSlave.worker.postMessage({
        type: 'batch',
        layers: slaveData.descriptors,
        indices: slaveData.indices,
        width: renderWidth,
        height: renderHeight,
        eventSubscriptions: this.activeSubscriptionPatterns(),
        requiredFontIds: fontIds,
        requiredMeshIds: meshIds,
      });
    }

    // Handle case where no slaves have work (should not happen for non-empty layers)
    if (slavePromises.length === 0) {
      this.pendingRender = null;
      return this.compositor.compose([], renderWidth, renderHeight);
    }

    try {
      // Wait for all slaves to complete
      const slaveResults = await Promise.all(slavePromises);

      // Check for abort (signal may be aborted during await, pendingRender may be cleared)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (abortController.signal.aborted || !this.pendingRender) {
        // Clean up received segments
        for (const result of slaveResults) {
          closeSegments(result.segments);
        }
        throw new AbortError('Render aborted');
      }

      // Build composed layers with original indices from segments
      const composedLayers: ComposedLayer[] = [];

      for (const { segments } of slaveResults) {
        // Each segment carries its orderIndex - the highest original layer index
        // in the segment. This correctly handles batch segmentation where multiple
        // layers may be combined into one segment.
        for (const segment of segments) {
          composedLayers.push({
            segment,
            originalIndex: segment.orderIndex,
          });
        }
      }

      // Compose final result - use software compositor for Scenario F
      let result: ImageBitmap;
      if (this.capabilities.scenario === 'F' && this.softwareCompositor) {
        // Sort layers by original index for software composition
        const sorted = [...composedLayers].sort((a, b) => a.originalIndex - b.originalIndex);
        const segments = sorted.map((l) => l.segment);
        result = await this.softwareCompositor.compose(segments, renderWidth, renderHeight);
      } else {
        result = await this.compositor.composeOrdered(composedLayers, renderWidth, renderHeight);
      }

      // Clean up segment bitmaps after composition
      for (const layer of composedLayers) {
        try {
          layer.segment.bitmap.close();
        } catch {
          // Ignore
        }
      }

      this.pendingRender.resolve(result);
      this.pendingRender = null;

      return result;
    } catch (error) {
      if (this.pendingRender) {
        this.pendingRender.reject(wrapError(error));
        this.pendingRender = null;
      }
      throw wrapError(error);
    }
  }

  /**
   * Abort the current in-progress render.
   */
  private abortCurrentRender(): void {
    if (!this.pendingRender) {
      return;
    }

    // Signal abort
    this.pendingRender.abortController.abort();

    // Send abort message to all standard slaves
    for (const slave of this.slaves) {
      slave.worker.postMessage({ type: 'abort' });
      // Clear pending render state for this slave
      if (slave.renderRejecter) {
        slave.renderRejecter(new AbortError('Render aborted'));
        slave.renderResolver = null;
        slave.renderRejecter = null;
      }
    }

    // Send abort message to all text slaves
    for (const textSlave of this.textSlaves) {
      textSlave.worker.postMessage({ type: 'abort' });
      // Clear pending render state for this slave
      if (textSlave.renderRejecter) {
        textSlave.renderRejecter(new AbortError('Render aborted'));
        textSlave.renderResolver = null;
        textSlave.renderRejecter = null;
      }
    }

    // Reject the pending promise
    this.pendingRender.reject(new AbortError('Render aborted due to new render request'));
    this.pendingRender = null;
  }

  /**
   * Preload assets for faster subsequent renders.
   *
   * @param urls - Array of asset URLs to preload
   */
  async preload(urls: string[]): Promise<void> {
    await this.ensureInitialized();

    const requests: AssetRequest[] = [];
    for (const url of urls) {
      // Skip URLs already in the asset map (previously fetched or known failed)
      if (this.assetMapping.urlToId.has(url)) {
        continue;
      }
      requests.push({
        id: this.getAssetId(url),
        url,
        assetType: 'image' as const,
      });
    }

    if (requests.length > 0) {
      await this.fetchAssets(requests);
    }
  }

  /**
   * Register a font family with the renderer. Each face is fetched as its
   * own asset; the asset manager indexes them by family + descriptors and
   * ships them to text slaves on every render's distribute step. The
   * promise resolves once every face has been fetched into the asset
   * manager's cache (or marked failed). After it resolves, the family is
   * visible to subsequent `render()` calls; the in-flight render does not
   * pick up newly registered families.
   *
   * Calling with a family name that's already registered appends faces
   * (useful for adding a new weight after the fact).
   */
  async loadFontFamily(description: FontFamilyDescription): Promise<void> {
    await this.ensureInitialized();

    const family = description.family.trim();
    if (family.length === 0) {
      throw new RenderError('FontFamilyDescription.family must be a non-empty string');
    }

    if (description.faces.length === 0) {
      console.warn(`loadFontFamily('${family}'): no faces provided`);
      return;
    }

    // Warn (don't reject) on duplicate weight×style within this batch.
    seenWeightStylePairsWarning(family, description.faces);

    const requests: AssetRequest[] = [];
    const pendingEntries: { entry: FontFaceEntry; existingId?: number }[] = [];

    for (const face of description.faces) {
      const descriptors: FontFaceDeliveryDescriptors = {};
      if (face.weight !== undefined) {descriptors.weight = face.weight;}
      if (face.style !== undefined) {descriptors.style = face.style;}
      if (face.stretch !== undefined) {descriptors.stretch = face.stretch;}
      if (face.unicodeRange !== undefined) {descriptors.unicodeRange = face.unicodeRange;}

      const existingId = this.assetMapping.urlToId.get(face.url);
      if (existingId === -1) {
        // Previously failed; skip.
        console.warn(
          `loadFontFamily('${family}'): URL previously failed, skipping: ${face.url}`
        );
        continue;
      }

      const id = this.getAssetId(face.url);
      const entry: FontFaceEntry = { assetId: id, url: face.url, descriptors };

      if (existingId === undefined) {
        // First time we've seen this URL — actually fetch it.
        const req: AssetRequest = {
          id,
          url: face.url,
          assetType: 'font',
          fontFamily: family,
        };
        if (Object.keys(descriptors).length > 0) {
          req.fontDescriptors = descriptors;
        }
        requests.push(req);
      }

      pendingEntries.push({ entry });
    }

    if (requests.length > 0) {
      const failed = await this.fetchAssets(requests);
      if (failed.length > 0) {
        const failedUrls = failed.map((id) => this.assetMapping.idToUrl.get(id) ?? String(id));
        console.warn(`loadFontFamily('${family}'): face(s) failed to load:`, failedUrls);
        for (const id of failed) {
          const url = this.assetMapping.idToUrl.get(id);
          if (url) {
            this.assetMapping.urlToId.set(url, -1);
          }
        }
      }
    }

    // Commit successfully-fetched faces to the visible registry. Faces whose
    // ID is now -1 (failed) are excluded — render-time resolution checks the
    // urlToId map for -1 and treats as not-registered.
    const faces = this.fontFamilies.get(family) ?? [];
    for (const { entry } of pendingEntries) {
      const currentId = this.assetMapping.urlToId.get(entry.url);
      if (currentId === undefined || currentId === -1) {
        continue;
      }
      faces.push(entry);
    }
    if (faces.length > 0) {
      this.fontFamilies.set(family, faces);
    }
  }

  /**
   * Resolve a `mask.type.fontfamily` CSS list to the set of font asset IDs
   * the slave needs to have loaded before rasterizing this layer. Walks the
   * list in order and returns every face of the first family found in
   * `fontFamilies`. Returns an empty array if none of the listed families
   * are registered (the slave will fall back to system fonts).
   */
  private resolveFamilyFaceIds(fontfamily: string | undefined): number[] {
    const candidates = parseFontFamilyList(fontfamily);
    for (const name of candidates) {
      const faces = this.fontFamilies.get(name);
      if (faces && faces.length > 0) {
        return faces.map((f) => f.assetId);
      }
    }
    return [];
  }

  /**
   * Get the detected fallback scenario.
   */
  getScenario(): FallbackScenario {
    return this.capabilities.scenario;
  }

  /**
   * Get detected capabilities.
   */
  getCapabilities(): { offscreenCanvas: boolean; webgl2: boolean; scenario: FallbackScenario } {
    return { ...this.capabilities };
  }

  /**
   * Get the number of active standard slaves.
   */
  getSlaveCount(): number {
    return this.slaves.length;
  }

  /**
   * Get the number of active text slaves.
   */
  getTextSlaveCount(): number {
    return this.textSlaves.length;
  }

  /**
   * Destroy all workers and release resources.
   *
   * This method performs comprehensive cleanup:
   * - Aborts any in-progress renders
   * - Terminates all worker threads and virtual slaves
   * - Closes all MessageChannel ports
   * - Releases compositor resources
   * - Cleans up WebGL resources (if used)
   * - Clears asset mapping caches
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    // Abort any pending render
    if (this.pendingRender) {
      this.pendingRender.abortController.abort();
      this.pendingRender.reject(new AbortError('RenderMaster destroyed'));
      this.pendingRender = null;
    }

    // Terminate standard slaves (workers or virtual)
    for (const slave of this.slaves) {
      if (slave.assetChannel) {
        slave.assetChannel.port1.close();
        slave.assetChannel.port2.close();
      }
      slave.worker.terminate();
    }
    this.slaves = [];

    // Terminate text slaves (workers or virtual)
    for (const textSlave of this.textSlaves) {
      if (textSlave.assetChannel) {
        textSlave.assetChannel.port1.close();
        textSlave.assetChannel.port2.close();
      }
      textSlave.worker.terminate();
    }
    this.textSlaves = [];

    // Terminate Asset Manager
    if (this.assetManager) {
      this.assetManager.terminate();
      this.assetManager = null;
    }

    // Destroy compositors
    this.compositor.destroy();
    if (this.softwareCompositor) {
      this.softwareCompositor.destroy();
      this.softwareCompositor = null;
    }

    // Clean up WebGL PostProcessor singleton if running in main thread
    // (Virtual slaves use the main thread WebGL context)
    destroyWebGLBuddy();

    // Clear asset mapping
    this.assetMapping.urlToId.clear();
    this.assetMapping.idToUrl.clear();
  }
}

// Re-export sub-modules
export * from './capability-probe';
export * from './layer-classifier';
export * from './master-compositor';
export * from './software-compositor';
