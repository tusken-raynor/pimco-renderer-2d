/**
 * RenderMaster Module.
 *
 * The RenderMaster is the orchestrator of the multi-threaded rendering pipeline.
 * It coordinates Web Workers (Asset Manager, Standard Slaves) to process layers
 * and produce a final composited ImageBitmap.
 *
 * Responsibilities:
 * - Spawn and manage Web Workers
 * - Perform capability detection
 * - Maintain URL-to-numeric-ID asset mapping
 * - Classify layers (standard vs text)
 * - Distribute work to slaves
 * - Collect and compose final output
 * - Handle abort-on-reentry (cancel in-progress render when new render requested)
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
} from '../types';
import {
  isReadyMessage,
  isCapabilitiesMessage,
  isResultMessage,
  isErrorMessage,
  isFetchCompleteMessage,
  isDistributeCompleteMessage,
} from '../types';
import { isStandardLayerMask, isTextLayerMask } from '../types/pimco';
import { classifyLayers, type ClassificationResult } from './layer-classifier';
import { probeCapabilities, probeCapabilitiesForContext } from './capability-probe';
import { MasterCompositor, type ComposedLayer, closeSegments } from './master-compositor';
import { RenderError, AbortError, WorkerError, wrapError } from '../errors';

// Worker URLs - Vite handles the bundling
import AssetManagerWorkerUrl from '../../workers/asset-manager.worker.ts?worker&url';
import RenderSlaveWorkerUrl from '../../workers/render-slave.worker.ts?worker&url';
import TextRenderSlaveWorkerUrl from '../../workers/text-render-slave.worker.ts?worker&url';

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
}

/**
 * Slave type identifier.
 */
type SlaveType = 'standard' | 'text';

/**
 * Internal slave state tracking.
 */
interface SlaveState {
  /** Worker instance */
  worker: Worker;
  /** Unique slave ID */
  id: number;
  /** Slave type (standard or text) */
  type: SlaveType;
  /** Whether slave has reported ready */
  ready: boolean;
  /** Reported capabilities */
  capabilities: CapabilitiesMessage | null;
  /** MessageChannel for Asset Manager communication */
  assetChannel: MessageChannel;
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

  /** Master compositor for final composition */
  private compositor: MasterCompositor;

  /** Asset ID mapping */
  private assetMapping: AssetMapping;

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

    // Detect capabilities immediately
    this.capabilities = probeCapabilities();

    // Start initialization
    this.initPromise = this.initialize();
  }

  /**
   * Initialize workers and wait for them to be ready.
   */
  private async initialize(): Promise<void> {
    // Spawn Asset Manager
    this.assetManager = new Worker(AssetManagerWorkerUrl, { type: 'module' });

    // Handle Asset Manager messages
    this.assetManager.onmessage = (event: MessageEvent<AssetManagerToMasterMessage>) => {
      this.handleAssetManagerMessage(event.data);
    };

    this.assetManager.onerror = (event: ErrorEvent) => {
      console.error('Asset Manager error:', event.message);
    };

    // Spawn slaves based on scenario
    const slaveCapabilities = probeCapabilitiesForContext('worker');

    // Standard slaves: scenarios A, B, D, E use workers
    const shouldUseStandardWorkers =
      slaveCapabilities.scenario === 'A' ||
      slaveCapabilities.scenario === 'B' ||
      slaveCapabilities.scenario === 'D' ||
      slaveCapabilities.scenario === 'E';

    // Text slaves: scenarios A and D use workers (require WebGL2)
    // Scenarios B and E fall back to virtual text slaves (implemented in Phase 4)
    const shouldUseTextWorkers =
      slaveCapabilities.scenario === 'A' || slaveCapabilities.scenario === 'D';

    const initPromises: Promise<void>[] = [];

    if (shouldUseStandardWorkers) {
      initPromises.push(this.spawnSlaves());
    }
    // In scenarios C and F, virtual slaves would be used (implemented in Phase 4)

    if (shouldUseTextWorkers) {
      initPromises.push(this.spawnTextSlaves());
    }
    // In scenarios B, C, E, F, virtual text slaves would be used (implemented in Phase 4)

    await Promise.all(initPromises);
  }

  /**
   * Spawn standard render slaves.
   */
  private async spawnSlaves(): Promise<void> {
    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.slaveCount; i++) {
      const slaveId = this.nextSlaveId++;
      const worker = new Worker(RenderSlaveWorkerUrl, { type: 'module' });
      const assetChannel = new MessageChannel();

      const slaveState: SlaveState = {
        worker,
        id: slaveId,
        type: 'standard',
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
   * Spawn text render slaves.
   */
  private async spawnTextSlaves(): Promise<void> {
    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.textSlaveCount; i++) {
      const slaveId = this.nextSlaveId++;
      const worker = new Worker(TextRenderSlaveWorkerUrl, { type: 'module' });
      const assetChannel = new MessageChannel();

      const slaveState: SlaveState = {
        worker,
        id: slaveId,
        type: 'text',
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
   * Handle message from Asset Manager.
   */
  private handleAssetManagerMessage(message: AssetManagerToMasterMessage): void {
    // Currently used for fetch-complete and distribute-complete
    // These are handled via awaited message patterns
    if (isErrorMessage(message as unknown)) {
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
   */
  private getAssetId(url: string): number {
    const existing = this.assetMapping.urlToId.get(url);
    if (existing !== undefined) {
      return existing;
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
   */
  private extractAssetRequests(layers: ProductImageComponent[]): AssetRequest[] {
    const requests: AssetRequest[] = [];
    const seen = new Set<string>();

    const addImageRequest = (url: string | undefined): void => {
      if (url && !seen.has(url)) {
        seen.add(url);
        requests.push({
          id: this.getAssetId(url),
          url,
          assetType: 'image',
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

    // Note: Font asset ID handling would be added when font URL extraction is implemented

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

    return new Promise<number[]>((resolve) => {
      const handler = (event: MessageEvent<AssetManagerToMasterMessage>): void => {
        if (isFetchCompleteMessage(event.data)) {
          assetManager.removeEventListener('message', handler);
          resolve(event.data.failed);
        }
      };

      assetManager.addEventListener('message', handler);
      assetManager.postMessage({ type: 'fetch', assets: requests });
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

    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent<AssetManagerToMasterMessage>): void => {
        if (isDistributeCompleteMessage(event.data)) {
          assetManager.removeEventListener('message', handler);
          resolve();
        }
      };

      assetManager.addEventListener('message', handler);
      assetManager.postMessage({ type: 'distribute', deliveries });
    });
  }

  /**
   * Distribute standard layers across available standard slaves.
   * Returns a map of slave ID to layer descriptors and original indices.
   */
  private distributeLayersToSlaves(
    classification: ClassificationResult
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

      const slaveData = distribution.get(slave.id);
      if (slaveData) {
        slaveData.descriptors.push(descriptor);
        slaveData.indices.push(layerInfo.index);
      }
    }

    return distribution;
  }

  /**
   * Distribute text layers across available text slaves.
   * Returns a map of slave ID to text layer descriptors and original indices.
   */
  private distributeTextLayersToSlaves(
    classification: ClassificationResult
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

      const slaveData = distribution.get(slave.id);
      if (slaveData) {
        slaveData.descriptors.push(descriptor);
        slaveData.indices.push(layerInfo.index);
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
   * Collect asset IDs needed by each text slave.
   */
  private collectTextSlaveAssetIds(
    distribution: Map<number, { descriptors: TextLayerDescriptor[]; indices: number[] }>
  ): Map<number, number[]> {
    const slaveAssets = new Map<number, number[]>();

    for (const [slaveId, { descriptors }] of distribution) {
      const assetIds = new Set<number>();

      for (const descriptor of descriptors) {
        assetIds.add(descriptor.assetIds.image);
        if (descriptor.assetIds.texture !== undefined) {
          assetIds.add(descriptor.assetIds.texture);
        }
        if (descriptor.assetIds.postmask !== undefined) {
          assetIds.add(descriptor.assetIds.postmask);
        }
        if (descriptor.assetIds.font !== undefined) {
          assetIds.add(descriptor.assetIds.font);
        }
      }

      slaveAssets.set(slaveId, Array.from(assetIds));
    }

    return slaveAssets;
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
      const failedUrls = failedAssets.map((id) => this.assetMapping.idToUrl.get(id) ?? String(id));
      console.warn('Some assets failed to load:', failedUrls);
    }

    // Check for abort
    if (abortController.signal.aborted) {
      throw new AbortError('Render aborted');
    }

    // Distribute layers to slaves
    const distribution = this.distributeLayersToSlaves(classification);
    const textDistribution = this.distributeTextLayersToSlaves(classification);

    // Collect asset IDs for each slave
    const slaveAssetIds = this.collectSlaveAssetIds(distribution);
    const textSlaveAssetIds = this.collectTextSlaveAssetIds(textDistribution);

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

      // Send batch to slave
      slave.worker.postMessage({
        type: 'batch',
        layers: slaveData.descriptors,
        width: renderWidth,
        height: renderHeight,
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

      // Send batch to text slave (text slaves expect TextLayerDescriptor array)
      textSlave.worker.postMessage({
        type: 'batch',
        layers: slaveData.descriptors,
        width: renderWidth,
        height: renderHeight,
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

      // Build composed layers with original indices
      const composedLayers: ComposedLayer[] = [];

      for (const { slaveId, segments, isTextSlave } of slaveResults) {
        // Get the correct assignments based on slave type
        const indices = isTextSlave
          ? (textSlaveAssignments.get(slaveId) ?? [])
          : (slaveAssignments.get(slaveId) ?? []);

        // Each segment corresponds to one or more original layers
        // Since we use batch segmentation, segments may be grouped
        // For now, we assign segments sequentially to original indices
        for (let i = 0; i < segments.length; i++) {
          const originalIndex = indices[i] ?? i;
          composedLayers.push({
            segment: segments[i],
            originalIndex,
          });
        }
      }

      // Compose final result
      const result = await this.compositor.composeOrdered(
        composedLayers,
        renderWidth,
        renderHeight
      );

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

    const requests: AssetRequest[] = urls.map((url) => ({
      id: this.getAssetId(url),
      url,
      assetType: 'image' as const,
    }));

    await this.fetchAssets(requests);
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

    // Terminate standard slaves
    for (const slave of this.slaves) {
      slave.assetChannel.port1.close();
      slave.assetChannel.port2.close();
      slave.worker.terminate();
    }
    this.slaves = [];

    // Terminate text slaves
    for (const textSlave of this.textSlaves) {
      textSlave.assetChannel.port1.close();
      textSlave.assetChannel.port2.close();
      textSlave.worker.terminate();
    }
    this.textSlaves = [];

    // Terminate Asset Manager
    if (this.assetManager) {
      this.assetManager.terminate();
      this.assetManager = null;
    }

    // Destroy compositor
    this.compositor.destroy();

    // Clear asset mapping
    this.assetMapping.urlToId.clear();
    this.assetMapping.idToUrl.clear();
  }
}

// Re-export sub-modules
export * from './capability-probe';
export * from './layer-classifier';
export * from './master-compositor';
