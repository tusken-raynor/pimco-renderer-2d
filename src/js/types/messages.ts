/**
 * Type definitions for inter-component message protocol.
 * All communication between Master, Slaves, and Asset Manager uses typed messages.
 */

import type {
  BlendMode,
  CanvasCompositeOperation,
  ImagePlacementDefinition,
  PimcoMaskSubstitutionCompiled,
} from './pimco';

// =============================================================================
// Master → Slave Messages
// =============================================================================

/**
 * Initialize message sent to slaves on startup.
 */
export interface InitMessage {
  type: 'init';
}

/**
 * Batch of layers to render.
 */
export interface BatchMessage {
  type: 'batch';
  /** Layers to render with asset IDs resolved */
  layers: LayerDescriptor[];
  /** Output canvas width */
  width: number;
  /** Output canvas height */
  height: number;
}

/**
 * Signal to abort current rendering operation.
 */
export interface AbortMessage {
  type: 'abort';
}

/**
 * Union type for all messages from Master to Slave.
 */
export type MasterToSlaveMessage = InitMessage | BatchMessage | AbortMessage;

// =============================================================================
// Slave → Master Messages
// =============================================================================

/**
 * Slave is ready to receive work.
 */
export interface ReadyMessage {
  type: 'ready';
}

/**
 * Slave's browser capability report.
 */
export interface CapabilitiesMessage {
  type: 'capabilities';
  /** Whether OffscreenCanvas is available */
  offscreenCanvas: boolean;
  /** Whether WebGL2 is available */
  webgl2: boolean;
}

/**
 * Render result containing segmented bitmaps.
 */
export interface ResultMessage {
  type: 'result';
  /** Array of rendered segments with composition metadata */
  segments: RenderSegment[];
}

/**
 * Error occurred during rendering.
 */
export interface ErrorMessage {
  type: 'error';
  /** Error description */
  message: string;
  /** Optional error code for categorization */
  code?: string;
  /** Optional additional context */
  context?: Record<string, unknown>;
}

/**
 * Union type for all messages from Slave to Master.
 */
export type SlaveToMasterMessage =
  | ReadyMessage
  | CapabilitiesMessage
  | ResultMessage
  | ErrorMessage;

// =============================================================================
// Master → Asset Manager Messages
// =============================================================================

/**
 * Request to fetch assets by URL.
 */
export interface FetchMessage {
  type: 'fetch';
  /** Assets to fetch */
  assets: AssetRequest[];
}

/**
 * Request to distribute loaded assets to slaves.
 */
export interface DistributeMessage {
  type: 'distribute';
  /** Delivery specifications */
  deliveries: AssetDelivery[];
}

/**
 * Request to preload assets for future use.
 */
export interface PreloadMessage {
  type: 'preload';
  /** Assets to preload */
  assets: AssetRequest[];
}

/**
 * Register a slave's MessagePort with the Asset Manager.
 */
export interface RegisterSlaveMessage {
  type: 'register-slave';
  /** Unique slave identifier */
  slaveId: number;
  /** MessagePort for direct communication */
  port: MessagePort;
}

/**
 * Union type for all messages from Master to Asset Manager.
 */
export type MasterToAssetManagerMessage =
  | FetchMessage
  | DistributeMessage
  | PreloadMessage
  | RegisterSlaveMessage;

// =============================================================================
// Asset Manager → Master Messages
// =============================================================================

/**
 * Fetch operation completed.
 */
export interface FetchCompleteMessage {
  type: 'fetch-complete';
  /** IDs of assets that failed to load */
  failed: number[];
}

/**
 * Distribution operation completed.
 */
export interface DistributeCompleteMessage {
  type: 'distribute-complete';
}

/**
 * Union type for all messages from Asset Manager to Master.
 */
export type AssetManagerToMasterMessage = FetchCompleteMessage | DistributeCompleteMessage;

// =============================================================================
// Asset Manager → Slave Messages
// =============================================================================

/**
 * Asset delivery to a slave.
 */
export interface AssetDataMessage {
  type: 'asset-data';
  /** Asset ID */
  id: number;
  /** Asset type */
  assetType: AssetType;
  /** Asset data (ImageBitmap for images, ArrayBuffer for fonts/meshes) */
  data: ImageBitmap | ArrayBuffer;
}

/**
 * Union type for all messages from Asset Manager to Slave.
 */
export type AssetManagerToSlaveMessage = AssetDataMessage;

// =============================================================================
// Supporting Types
// =============================================================================

/**
 * Asset types supported by the Asset Manager.
 */
export type AssetType = 'image' | 'font' | 'mesh';

/**
 * Request to load an asset.
 */
export interface AssetRequest {
  /** Unique numeric ID assigned by Master */
  id: number;
  /** URL to fetch */
  url: string;
  /** Type of asset */
  assetType: AssetType;
}

/**
 * Specification for delivering assets to a slave.
 */
export interface AssetDelivery {
  /** Target slave ID */
  slaveId: number;
  /** Asset IDs to deliver */
  assetIds: number[];
}

/**
 * Rendered segment with composition metadata.
 * Segments group layers that can be composed together efficiently.
 */
export interface RenderSegment {
  /** Rendered bitmap for this segment */
  bitmap: ImageBitmap;
  /** Composite operation for this segment */
  compositemode: CanvasCompositeOperation;
  /** Composite opacity for this segment (0-1) */
  compositealpha: number;
}

/**
 * Layer descriptor with asset IDs resolved (used in worker communication).
 * This is the internal representation passed to slaves.
 */
export interface LayerDescriptor {
  /** Layer identifier */
  id: string;
  /** Asset IDs for various image resources */
  assetIds: {
    /** Base image asset ID */
    image: number;
    /** Mask image asset ID (standard layers only) */
    mask?: number;
    /** Texture asset ID */
    texture?: number;
    /** Highlight 1 image asset ID */
    hlimage1?: number;
    /** Highlight 2 image asset ID */
    hlimage2?: number;
  };
  /** Color mode */
  mode: 'color' | 'image';
  /** Color value (resolved to single string for rendering) */
  color?: string;
  /** Intra-layer opacity */
  alpha: number;
  /** Intra-layer blend mode */
  blend: BlendMode;
  /** Highlight 1 opacity */
  hlalpha1?: number;
  /** Highlight 1 blend mode */
  hlblend1?: BlendMode;
  /** Highlight 2 opacity */
  hlalpha2?: number;
  /** Highlight 2 blend mode */
  hlblend2?: BlendMode;
  /** Inter-layer composite operation */
  compositemode: CanvasCompositeOperation;
  /** Inter-layer composite opacity */
  compositealpha: number;
  /** Image placement definition */
  placement?: ImagePlacementDefinition;
  /** Text layer mask data (only for text layers) */
  maskData?: PimcoMaskSubstitutionCompiled;
}

/**
 * Browser capability detection result.
 */
export interface CapabilityResult {
  /** Whether OffscreenCanvas is available */
  offscreenCanvas: boolean;
  /** Whether WebGL2 is available */
  webgl2: boolean;
  /** Determined fallback scenario (A-F) */
  scenario: FallbackScenario;
}

/**
 * Fallback scenarios based on browser capabilities.
 * - A: Main thread master, workers for both slave types
 * - B: Main thread master, workers for standard, virtual for text
 * - C: Main thread master, virtual for both
 * - D: Worker master, workers for both
 * - E: Worker master, workers for standard, virtual for text
 * - F: Worker master, virtual for both, software compositor
 */
export type FallbackScenario = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for InitMessage.
 */
export function isInitMessage(msg: unknown): msg is InitMessage {
  return isMessageOfType(msg, 'init');
}

/**
 * Type guard for BatchMessage.
 */
export function isBatchMessage(msg: unknown): msg is BatchMessage {
  return isMessageOfType(msg, 'batch');
}

/**
 * Type guard for AbortMessage.
 */
export function isAbortMessage(msg: unknown): msg is AbortMessage {
  return isMessageOfType(msg, 'abort');
}

/**
 * Type guard for ReadyMessage.
 */
export function isReadyMessage(msg: unknown): msg is ReadyMessage {
  return isMessageOfType(msg, 'ready');
}

/**
 * Type guard for CapabilitiesMessage.
 */
export function isCapabilitiesMessage(msg: unknown): msg is CapabilitiesMessage {
  return isMessageOfType(msg, 'capabilities');
}

/**
 * Type guard for ResultMessage.
 */
export function isResultMessage(msg: unknown): msg is ResultMessage {
  return isMessageOfType(msg, 'result');
}

/**
 * Type guard for ErrorMessage.
 */
export function isErrorMessage(msg: unknown): msg is ErrorMessage {
  return isMessageOfType(msg, 'error');
}

/**
 * Type guard for FetchMessage.
 */
export function isFetchMessage(msg: unknown): msg is FetchMessage {
  return isMessageOfType(msg, 'fetch');
}

/**
 * Type guard for DistributeMessage.
 */
export function isDistributeMessage(msg: unknown): msg is DistributeMessage {
  return isMessageOfType(msg, 'distribute');
}

/**
 * Type guard for PreloadMessage.
 */
export function isPreloadMessage(msg: unknown): msg is PreloadMessage {
  return isMessageOfType(msg, 'preload');
}

/**
 * Type guard for RegisterSlaveMessage.
 */
export function isRegisterSlaveMessage(msg: unknown): msg is RegisterSlaveMessage {
  return isMessageOfType(msg, 'register-slave');
}

/**
 * Type guard for FetchCompleteMessage.
 */
export function isFetchCompleteMessage(msg: unknown): msg is FetchCompleteMessage {
  return isMessageOfType(msg, 'fetch-complete');
}

/**
 * Type guard for DistributeCompleteMessage.
 */
export function isDistributeCompleteMessage(msg: unknown): msg is DistributeCompleteMessage {
  return isMessageOfType(msg, 'distribute-complete');
}

/**
 * Type guard for AssetDataMessage.
 */
export function isAssetDataMessage(msg: unknown): msg is AssetDataMessage {
  return isMessageOfType(msg, 'asset-data');
}

/**
 * Helper function to check message type field.
 */
function isMessageOfType(msg: unknown, type: string): boolean {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    (msg as { type: string }).type === type
  );
}
