/**
 * Type definitions for ProductImageComponent (PIMCO) and related types.
 * These types define the data structures used for 2D product image rendering.
 */

/**
 * Blend modes for intra-layer compositing.
 * Maps to CSS mix-blend-mode and canvas globalCompositeOperation.
 */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/**
 * Canvas composite operations for inter-layer compositing.
 */
export type CanvasCompositeOperation =
  | 'source-over'
  | 'source-in'
  | 'source-out'
  | 'source-atop'
  | 'destination-over'
  | 'destination-in'
  | 'destination-out'
  | 'destination-atop'
  | 'lighter'
  | 'copy'
  | 'xor'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/**
 * Fixed-size array type helper.
 */
export type FixedSizeArray<T, N extends number> = N extends 0
  ? never[]
  : {
      0: T;
      length: N;
    } & readonly T[];

/**
 * Individual transform operation for image placement.
 */
export type ImagePlacementTransform<T extends number | string = number | string> =
  | { type: 'rotate'; angle: T }
  | { type: 'scale'; x: T; y: T }
  | { type: 'translate'; x: T; y: T }
  | { type: 'skew'; x: T; y: T };

/**
 * Placement definition for positioning and transforming images.
 */
export interface ImagePlacementDefinition {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover' | 'fill';
  position?: [number, number];
  transform?: ImagePlacementTransform[] | FixedSizeArray<number, 6>;
}

/**
 * 2D transformation parameters for text/effect layers.
 */
export interface PimcoMaskSubstitutionTransformation {
  translation?: [number, number];
  rotation?: number;
  scale?: number | [number, number];
  breaker?: number;
}

/**
 * 3D mesh projection parameters for text layers.
 * Note: 3D projection is deferred to a future phase.
 */
export interface PimcoMaskSubstitutionProjection {
  mesh: string;
  transformation?: FixedSizeArray<number, 16>;
  camera: [number, number, number];
  type?: 'perspective' | 'orthographic';
  fov?: number;
  rect?: [number, number, number, number];
  uvorigin?: [number, number];
  uvauto?: 'x' | 'y';
  uvmeshratio?: number;
  identifier?: string;
}

/**
 * Typography definition for text layers.
 */
export interface PimcoMaskSubstitutionTypeDefinition {
  fontfamily?: string;
  fontweight?: number | string;
  letterspacing?: string;
  lineheight?: number;
  texttransform?: 'uppercase' | 'lowercase' | 'capitalize';
  widthscale?: number;
  maxwidth?: number;
  alignment?: 'center' | 'left' | 'right';
  heightscale?: number;
}

/**
 * Supported effect types for text layers.
 * Each effect has a specific shader pipeline.
 */
export type PimcoMaskSubstitutionEffect =
  | 'embroidery'
  | 'engraving'
  | 'metal'
  | 'painted'
  | 'hotstamp'
  | 'foil'
  | 'normal'
  | 'shadow';

/**
 * Compiled mask substitution data for text/effect layers.
 * This is the runtime-processed version of PimcoMaskSubstitution.
 */
export interface PimcoMaskSubstitutionCompiled {
  /** Text content to render */
  content?: string;
  /** 2D transformation parameters */
  transform?: PimcoMaskSubstitutionTransformation;
  /** Effect type to apply */
  effect?: PimcoMaskSubstitutionEffect;
  /** Additional effect-specific parameters */
  effectparams?: Record<string, unknown>;
  /** Typography settings */
  type?: PimcoMaskSubstitutionTypeDefinition;
  /** 3D mesh projection settings (deferred) */
  projection?: PimcoMaskSubstitutionProjection;
  /** Post-effect mask URL */
  postmask?: string;
}

/**
 * Core ProductImageComponent type representing a single render layer.
 * Layers are composited back-to-front based on the `order` field.
 */
export interface ProductImageComponent {
  /** Unique identifier for the layer */
  id: string;
  /** Human-readable name for the layer */
  name: string;
  /** Color mode: 'color' uses solid color/texture, 'image' uses the base image directly */
  mode: 'color' | 'image';
  /** Color value (hex string, array of hex strings, or keyed record) */
  color?: string | string[] | Record<string, string>;
  /** Texture URL for tiling */
  texture?: string;
  /** Index for selecting from color array/record */
  coloridx?: number | string;
  /** Intra-layer opacity (0-1) */
  alpha: number;
  /** Intra-layer blend mode */
  blend: BlendMode;
  /**
   * Mask definition:
   * - string URL = standard layer (uses image mask)
   * - PimcoMaskSubstitutionCompiled = text layer (uses effect pipeline)
   */
  mask: string | PimcoMaskSubstitutionCompiled;
  /** Base image URL */
  image: string;
  /** Layer z-order (ascending = back to front) */
  order?: number;
  /** Highlight layer 1 image URL */
  hlimage1?: string;
  /** Highlight layer 1 opacity */
  hlalpha1?: number;
  /** Highlight layer 1 blend mode */
  hlblend1?: BlendMode;
  /** Highlight layer 2 image URL */
  hlimage2?: string;
  /** Highlight layer 2 opacity */
  hlalpha2?: number;
  /** Highlight layer 2 blend mode */
  hlblend2?: BlendMode;
  /** Inter-layer composite operation (default: source-over) */
  compositemode?: CanvasCompositeOperation;
  /** Inter-layer composite opacity (default: 1.0) */
  compositealpha?: number;
  /** Image placement and transform definition */
  placement?: ImagePlacementDefinition;
}

/**
 * Type guard to check if a mask is a text layer (PimcoMaskSubstitutionCompiled).
 */
export function isTextLayerMask(
  mask: string | PimcoMaskSubstitutionCompiled
): mask is PimcoMaskSubstitutionCompiled {
  return typeof mask === 'object';
}

/**
 * Type guard to check if a mask is a standard layer (URL string).
 */
export function isStandardLayerMask(mask: string | PimcoMaskSubstitutionCompiled): mask is string {
  return typeof mask === 'string';
}
