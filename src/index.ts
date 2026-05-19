/**
 * pimco-renderer-2d — public entry point.
 *
 * Browser-only library. Spawns Web Workers from `./workers/*.worker.js`
 * via `new URL(..., import.meta.url)`, which modern bundlers
 * (Vite, Webpack 5, Rollup, esbuild, Parcel) resolve automatically when
 * importing from `node_modules/pimco-renderer-2d/dist/`.
 */

export {
  RenderMaster,
  parseFontFamilyList,
  type RenderMasterOptions,
  type PimcoLayerEvent,
  type PimcoLayerEventListener,
} from './js/renderer';

export type {
  // PIMCO domain types
  BlendMode,
  CanvasCompositeOperation,
  ImagePlacementTransform,
  ImagePlacementDefinition,
  PimcoMaskSubstitutionTransformation,
  PimcoMaskSubstitutionProjection,
  PimcoMaskSubstitutionTypeDefinition,
  PimcoMaskSubstitutionEffect,
  PimcoMaskSubstitutionCompiled,
  ProductImageComponent,
  FontFaceDescriptor,
  FontFamilyDescription,
  // Capability/scenario
  FallbackScenario,
  CapabilityResult,
} from './js/types';

export {
  AppError,
  ValidationError,
  NotFoundError,
  RenderError,
  AssetLoadError,
  WorkerError,
  AbortError,
  CapabilityError,
  isAppError,
  isValidationError,
  isNotFoundError,
  isRenderError,
  isAssetLoadError,
  isWorkerError,
  isAbortError,
  isCapabilityError,
  type ErrorContext,
} from './js/errors';
