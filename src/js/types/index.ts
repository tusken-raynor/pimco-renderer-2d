/**
 * Type definitions barrel file.
 * Re-exports all types from the types module.
 */

// PIMCO types (ProductImageComponent and related)
export type {
  BlendMode,
  CanvasCompositeOperation,
  FixedSizeArray,
  ImagePlacementTransform,
  ImagePlacementDefinition,
  PimcoMaskSubstitutionTransformation,
  PimcoMaskSubstitutionProjection,
  PimcoMaskSubstitutionTypeDefinition,
  PimcoMaskSubstitutionEffect,
  PimcoMaskSubstitutionCompiled,
  ProductImageComponent,
} from './pimco';

export { isTextLayerMask, isStandardLayerMask } from './pimco';

// Message types (worker communication)
export type {
  // Master → Slave
  InitMessage,
  BatchMessage,
  AbortMessage,
  MasterToSlaveMessage,
  // Slave → Master
  ReadyMessage,
  CapabilitiesMessage,
  ResultMessage,
  ErrorMessage,
  SlaveToMasterMessage,
  // Master → Asset Manager
  FetchMessage,
  DistributeMessage,
  PreloadMessage,
  RegisterSlaveMessage,
  MasterToAssetManagerMessage,
  // Asset Manager → Master
  FetchCompleteMessage,
  DistributeCompleteMessage,
  AssetManagerToMasterMessage,
  // Asset Manager → Slave
  AssetDataMessage,
  AssetManagerToSlaveMessage,
  // Supporting types
  AssetType,
  AssetRequest,
  AssetDelivery,
  RenderSegment,
  LayerDescriptor,
  CapabilityResult,
  FallbackScenario,
} from './messages';

export {
  // Type guards
  isInitMessage,
  isBatchMessage,
  isAbortMessage,
  isReadyMessage,
  isCapabilitiesMessage,
  isResultMessage,
  isErrorMessage,
  isFetchMessage,
  isDistributeMessage,
  isPreloadMessage,
  isRegisterSlaveMessage,
  isFetchCompleteMessage,
  isDistributeCompleteMessage,
  isAssetDataMessage,
} from './messages';
