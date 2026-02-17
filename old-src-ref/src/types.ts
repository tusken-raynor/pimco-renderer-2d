/* Please visit 'types-docs.txt' for documentation for each type. */

import { NumericalFormulaMethodNames } from "./formulas";

/* PRODUCTS */

export type Product = {
  id: string;
  type: "Product";
  name: string;
  comment?: string;
  wooid: string | number; // WooCommerce ID from nokona backend
  models: Array<string>; // List of model ids. Models are used to render and load different assets/options while still using the same product
  /**
   * @deprecated This property should not be used. Discard from object
   */
  primaryclass: string; // Defines the main class used for filtering on the model selection menu
  baseprice?: number; // Used as fallback when proper WooCommerce price data cannot be queried
  modes: ["blank", "color"?, "series"?]; // Defines available customiztion modes. "blank" = standard custom builder, "series" = design with series base, "color" = design from selected colorplay base
  /**
   * @deprecated This property should not be used. Discard from object
   */
  colorplayids?: [string, string]; // Some sort of colorplay id references that never got used
  series?: Array<string>; //List of series ids. Special series objects can be defined, and are used as a design template instead of designing from scratch.
  startpage: {
    template: "glove-landing" | "belt-landing" | "bat-landing"; // Component name for the landing page
    data: object | string; // Data to be passed in as props to the component
    rtemplate: "glove-patterns" | "belt-sizes"; // Template name for the model/size selection menu
  }; // Define the landing page content for the product
  frames: number | Array<[number, number, number]>; // For 2D, defines the number of frames/angles of product renderings. For 3D, defines the actual view keyframes as Euler angles
  frameorder?: Array<number>; // Used to reorder the frames' sequence away from default: 0, 1, 2, etc...
  sessionposes3d?: Array<[number, number, number]>; // For 3D, the keyframes as Euler angles which are used to pose and render the product overview and session images. If left undefined, `frames` property is used instead
  dimensions: [number, number] | "fill"; // Defines the dimensions of the product images rendering canvas. For 3D, "fill" may be used so that the 3D viewport fills all available space
  mobilewidth?: number; // Define what size is considered a mobile screen size by the product. Likely used to query lower LOD images for 2D rendering as a memory optimization
  aspectratio?: number; // For 3D, defines the ideal aspect ratio the product should be rendered at in "fill" mode, so it knows what FOV to use for what screen sizes
  interface?: "default" | "arrows" | "front-back" | "dots" | "none"; // Defines the user interface style for cycling through the different product frames
  fonts?: Array<string>; // List of font families to be used in the product
  startover?: "default" | "editor"; // Defines the behavior when starting over the product customization. Default returns the user to the landing page; Editor takes the user to the first step, resetting all their selections
  shareview?: number; // Defines what frame/view/angle is used when generating the the share image used for OpenGraph media
  regionmap?: boolean; // Indicates if the product will use a region map. When active, a region buffer is generated in an offscreen canvas and is used to send users to the associated steps when they click on parts of the rendered product image. Further setup is required in PIMCO objects to activate functionality. Currently only works on staticly masked components of product imagery.
  rendercontext?: "2D" | "THREE";
  materialsize?: [number, number]; // For 3D, defines the render output size of the material used on the 3D model
  background?:
    | string
    | {
        color?: string;
        image?: string;
        repeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
        position?: string;
        size?: string;
      }; // Defines the background properties for the product rendering stage. This background is also used in the final session/overview renderings
  unitprice?: boolean; // If true, displays a price per unit using whatever quantity value is available
  unitpricelabel?: string; // If unitprice is true, this label is used when displaying the price per unit
  unittotallabel?: string; // If unitprice is true, this label is used when displaying the total of all units
  extrawoo?: Array<string>; // List of WooCommerce IDs of products that should be suggested as add-ons or accessories to the main product
  defaultquantity?: number; // Defines the default quantity of the product when first added to cart
  cartmethod?: "new" | "legacy"; // Defines the method used to add the product to cart. "new" = use the new cart system that supports multiple products at once; "legacy" = use the old system that only supports one product at a time or does archaic splitting server-side
  doctitle?: string; // Custom document title to display in the browser tab when this product is active
};
export type Products = Array<Product>;

/* MODELS */

export type Model = {
  id: string;
  type: "Model";
  name: string;
  nickname?: string; // Generally used instead of name when available
  comment?: string;
  info?: {
    content: string; // accepts HTML
  }; // Define the information content for the model that is used in the model selection screen
  inches?: string; // Metric used classification; used by gloves only
  baseprice?: number; // Used as fallback when proper WooCommerce price data cannot be queried
  classes: { [key: string]: string | Array<string> }; // Used on gloves, defines certain metric like What Sports, Field Positions, etc the glove work for
  preview: ImageData | string; // A full size preview image of the model
  thumbnail: ImageData | string; // A smaller size preview image of the model
  attributes: Array<string>; // List of attribute ids. Attributes define the main level customization steps for the model
  pimco?: {
    frames: Array<ProductImageFrame & { image: string }>; // Frames contain essential properties for pimcos, and the frame chosen to be integrated into the final pimco objects depends on the productView value
    colorref?: string; // Reference a product image component base to match colors with for this base Pimco layer
  }; // PIMCO stands for ProductIMageCOmponent. A ProductImageComponent is an object that has minimum required properties to define a render layer for the product image. This pimco object defines the base layer of the product rendering that will unconditionally lie underneath all the other layers
  pimcofiller?: PimcoFiller; // Define references to existing pimco data from options so that it appears in the product rendering that these options are always selected
  mesh3d?: Mesh3DReference; // For 3D, the base mesh file to be used as well as apply default properties
  lights3d?: Array<Light3DReference>; // For 3D, define the lighting setup of the 3D scene
  pimco3d?: Pimco3DMaterialDefinition; // For 3D, pimcos are defined as a way to render the 2D material textures. This pimco object defines the base layer of the material rendering that will unconditionally lie underneath all the other layers
  globaltransform3d?: FixedSizeArray<number, 16>; // For 3D, define the default transformation matrix that is applied to any mesh used in the scene
  imgname?: string; // Interpolated into asset URL string, this value is used to reference different sets of assets based on the model. This value will replace any $pattern$ placeholders found in asset URLs
  pair?: {
    /**
     * @deprecated // This field is deprecated and may be removed in future versions
     */
    construction?: string;
    /**
     * @deprecated // This field is deprecated and may be removed in future versions
     */
    origin?: string;
    edgex?: string;
    edge?: string;
    classic?: string;
  }; // Used to group related model for arbitrary relationships. Currently used on gloves to link related Standard, Edge Precision and EdgeX models for quick swap
  wcvalue: string; // Defines the WooCommerce Add-on option name
  alter?: ObjectAlteration | Array<ObjectAlteration>; // Defines alterations that are done to configurator option objects server-side before they are loaded on the client. This allows shared options to have unique tweaks based on the model
  /**
   * @ignore // Property is currently unused at the model level
   */
  dohijack?: boolean;
  background?:
    | string
    | {
        color?: string;
        image?: string;
        repeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
        position?: string;
        size?: string;
      }; // Defines the background properties for the product rendering stage. This background is also used in the final session/overview renderings
  restrict?: string | Array<string>; // Defines server-side option restrictions for shared option sets. This allows certain options to be removed based on the model
  frames?: number | Array<[number, number, number]>; // For 2D, defines the number of frames/angles of product renderings. For 3D, defines the actual view keyframes as Euler angles. This value will override the value set on the product
  frameorder?: Array<number>; // Used to reorder the frames' sequence away from default: 0, 1, 2, etc...  This value will override the value set on the product
  sessionposes3d?: Array<[number, number, number]>; // For 3D, the keyframes as Euler angles which are used to pose and render the product overview and session images. If left undefined, `frames` property is used instead. This value will override the value set on the product
  interface?: "default" | "arrows" | "front-back" | "dots" | "none"; // Defines the user interface style for cycling through the different product frames. This value will override the value set on the product
  camera?: {
    fov?: number | NumericalFormula; // If defined as a NumericalFormula, this will be used to calculate the field of view dynamically based on specified state values
    position?: [number, number, number];
  }; // For 3D, defines the camera properties used during rendering
  startover?: "default" | "editor"; // Defines the behavior when starting over the product customization. Default returns the user to the landing page; Editor takes the user to the first step, resetting all their selections. This value will override the value set on the product
  materialsize?: [number, number]; // For 3D, defines the render output size of the material used on the 3D model. This value will override the value set on the product
  unitprice?: boolean; // If true, displays a price per unit using whatever quantity value is available
  unitpricelabel?: string; // If unitprice is true, this label is used when displaying the price per unit
  unittotallabel?: string; // If unitprice is true, this label is used when displaying the total of all units
  defaultquantity?: number; // Defines the default quantity of the product when first added to cart
  imgfallbackglob?: string; // If defined, this glob pattern string is used as a fallback to query asset URLs if the main imgname pattern does not yield valid assets
  imgfallbackname?: string; // If defined, this value is used to replace any $pattern$ placeholders if the main imgname pattern does not yield valid assets
};

/* ATTRIBUTES */

export type BasicAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "BasicAttribute";
  comment?: string;
  component: string;
  info: {
    title: string;
    body: string;
  };
  hint?: string;
  options: Array<string>;
  default?: string;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  wcname?: string;
  disabled?: boolean;
};
export type ParallelAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "ParallelAttribute";
  comment?: string;
  component: string;
  info: {
    title: string;
    body: string;
  };
  hint?: string;
  regions: Array<string>;
  accessories: Array<string>;
  swatches: Array<string>;
  defaults?: {
    regions: string;
    accessories: string;
    swatches: string;
  };
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  wcname?: string;
  disabled?: boolean;
};
export type ComplexAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "ComplexAttribute";
  comment?: string;
  component: string;
  info?: {
    title: string;
    body: string;
  };
  hint?: string;
  attributes: Array<string>;
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  disabled?: boolean;
};
export type ComplexSubAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "ComplexSubAttribute";
  comment?: string;
  info?: {
    title: string;
    body: string;
  };
  options: {
    key: string;
    options: Array<string>;
    default?: string;
    required?: boolean;
    permanent?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcname?: string;
    wcscope?: string;
    store?: boolean | "value" | "interaction";
  };
  virtual?:
    | {
        wooid: string | number; // The WooCommerce ID associated with the virtual step. Virtual steps cannot be represented within a fixed set of add-ons, so they must be represented by a separate product
        min?: number; // The minimum number of virtual steps required
        max?: number; // The maximum number of virtual steps allowed
        addlabel?: string; // Default: '+add'. The label used for the "add" button to create additional virtual steps
        quantityfield?: string; // Used to specify which woocommerce name in the virtual branch represents quantity. If left undefined quantity will always be "1"
      }
    | false; // If defined, the sub-attribute gets templated and used to generate virtual steps
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  leatherguide?: boolean;
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  disabled?: boolean;
};
export type ColorAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "ColorAttribute";
  comment?: string;
  component: string;
  info: {
    title: string;
    body: string;
  };
  options: Array<string>;
  default?: string;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  wcname?: string;
  disabled?: boolean;
};
export type GrandAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "GrandAttribute";
  comment?: string;
  component: string;
  info?: StandardPopupInfo;
  hint?: string;
  attributes: Array<string>;
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  disabled?: boolean;
};
export type GrandSubAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "GrandSubAttribute";
  comment?: string;
  info?: StandardPopupInfo;
  subtitle?: string;
  emptylabel?: string;
  attributes?: Array<string>;
  options?: {
    key: string;
    options: Array<string>;
    default?: string;
    required?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcname?: string;
    wcscope?: string;
    store?: boolean | "value" | "interaction";
  };
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  disabled?: boolean;
  hidden?: boolean;
};
export type GrandAddonAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "GrandAddonAttribute";
  comment?: string;
  info?: StandardPopupInfo;
  image?: ImageData | string;
  options: {
    key: string;
    options: Array<string>;
    default?: string;
    required?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcname?: string;
    wcscope?: string;
    wcproduct?: string;
    store?: boolean | "value" | "interaction";
  };
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  disabled?: boolean;
};
export type GenericAttribute<D extends object> = {
  id: string;
  name: string;
  nickname?: string;
  type: "GenericAttribute";
  comment?: string;
  component: "generic-selector";
  info?: StandardPopupInfo;
  hint?: string;
  generic: D;
  attributes: string[];
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  disabled?: boolean;
};
export type GenericSubAttribute = {
  id: string;
  name: string;
  nickname?: string;
  type: "GenericSubAttribute";
  comment?: string;
  info?: StandardPopupInfo;
  template: string;
  genericmeta?: Record<string, any>;
  options: {
    key: string;
    options: string[];
    default?: string;
    required?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcname?: string;
    wcscope?: string;
    wcproduct?: string;
    store?: boolean | "value" | "interaction";
  };
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  notify?: StandardPopupInfo;
  hijack?: ProductStageHijackParameters;
  viewset?: ConfiguratorViewSet;
  wcname?: string;
  disabled?: boolean;
};
export type Attribute =
  | BasicAttribute
  | ParallelAttribute
  | ComplexAttribute
  | ComplexSubAttribute
  | ColorAttribute
  | GrandAttribute
  | GrandSubAttribute
  | GrandAddonAttribute
  | GenericAttribute<{ template: string }>
  | GenericSubAttribute;
export type Attributes = Array<Attribute>;

/* OPTIONS */

export type BasicOption = {
  id: string;
  type: "BasicOption";
  name: string;
  nickname?: string;
  comment?: string;
  info: string;
  upcharge?: number;
  graphic: string;
  posttitle?: string;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ColorOption = {
  id: string;
  type: "ColorOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  color: string | null;
  posttitle?: string;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ComplexLabelOption<
  S extends "default" | "bucket" | "dark" | "thick" | "radio" = "default" | "bucket" | "dark" | "thick" | "radio"
> = {
  id: string;
  type: "ComplexLabelOption";
  subtype?: S;
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  pricepoint?: "$" | "$$" | "$$$" | "$$$$" | "$$$$$" | "hide";
  suboptions?: ComplexSubOptionData;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ComplexSwatchOption = {
  id: string;
  type: "ComplexSwatchOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  swatch: string | ImageData;
  swatchtype: "image" | "color";
  label?: string;
  shadow?: boolean;
  shrink?: boolean;
  backdrop?: {
    image: ImageData | string;
    blend?: BlendMode;
  };
  suboptions?: ComplexSubOptionData;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ComplexChromaOption = {
  id: string;
  type: "ComplexChromaOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  swatch: string;
  swatchtype: "color" | "empty";
  label?: string;
  shadow?: boolean;
  backdrop?: {
    image: ImageData | string;
    blend?: BlendMode;
  };
  suboptions?: ComplexSubOptionData;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ComplexSwatchLabelOption = {
  id: string;
  type: "ComplexSwatchLabelOption";
  name: string;
  nickname?: string;
};
export type ComplexImageOption = {
  id: string;
  type: "ComplexImageOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  image: string | ImageData;
  suboptions?: ComplexSubOptionData;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ParallelRegionOption = {
  id: string;
  type: "ParallelRegionOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ParallelAccessoryOption = {
  id: string;
  type: "ParallelAccessoryOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  image: string;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ParallelSwatchOption = {
  id: string;
  type: "ParallelSwatchOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  swatch: string | ImageData;
  swatchtype: "image" | "color";
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ComplexLeatherOption = {
  id: string;
  type: "ComplexLeatherOption";
  name: string;
  nickname?: string;
  comment?: string;
  usenickname?: boolean;
  prefix?: string;
  info?: string;
  upcharge?: number;
  suboptions: {
    key: string;
    options: Array<string>;
    default?: string;
    required?: boolean;
    permanent?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcscope?: string;
    contain?: boolean;
    store?: boolean | "value" | "interaction";
  };
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ComplexColorsOption<T extends "source" | "comrade" = "source" | "comrade"> = {
  id: string;
  type: "ComplexColorsOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;

  upcharge?: number;
  icon?: string | ImageData;
  suboptions: {
    key: string;
    options: Array<string>;
    default?: string;
    required?: boolean;
    permanent?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcscope?: string;
    contain?: boolean;
    store?: boolean | "value" | "interaction";
  };
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;

  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
} & (T extends "source"
  ? {
      comrades: Array<string>;
    }
  : { source: string });
export type ComplexTextOption = {
  id: string;
  type: "ComplexTextOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  text?: string;
  pattern?: string;
  width?: string | number;
  /**
   * @deprecated This property should not be used. Discard from object
   */
  temppimco?: PimcoContribution;
  placeholder?: string;
  default?: string;
  maxlength?: number | string;
  message?: string;
  font?: string | PimcoMaskSubstitutionTypeDefintion;
  suboptions?: ComplexSubOptionData;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type ComplexTypeOption = {
  id: string;
  type: "ComplexTypeOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  text?: string;
  /**
   * @deprecated This property should not be used. Discard from object
   */
  temppimco?: PimcoContribution;
  placeholder?: string;
  default?: string;
  maxlength?: number | string;
  required?: boolean;
  interupt?: boolean;
  texttype?: "number" | "uppercase" | "alpha" | "default" | "none" | ("number" | "uppercase" | "alpha" | "default")[];
  suboptions?: ComplexSubOptionData;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
  wclength?: {
    ranges: string[];
    wcname: string;
    wcvalue: string;
  };
  textwcname?: string;
};
export type ComplexInitialsOption = {
  id: string;
  type: "ComplexInitialsOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;

  upcharge?: number;
  graphic: string | ImageData;
  mode: "numeric" | "alphanumeric";
  text?: string;
  /**
   * @deprecated This property should not be used. Discard from object
   */
  temppimco?: PimcoContribution;
  placeholder?: string;
  default?: string;
  maxlength?: number | string;
  suboptions?: ComplexSubOptionData;
  pimcodata?: {
    regionmap:
      | Array<{
          [pimco: string]: string;
        }>
      | {
          [pimco: string]: string;
        };
    framenames: Array<string | null>;
    imagepath: string;
  };
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;

  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
  textwcname?: string;
};
export type ComplexUploaderOption = {
  id: string;
  type: "ComplexUploaderOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  text?: string;
  nonelabel?: string;
  popup?: {
    title: string;
    message?: string;
    validation?: string;
  };
  suboptions?: ComplexSubOptionData;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
  textwcname?: string;
};
export type ComplexCompoundOption = {
  id: string;
  type: "ComplexCompoundOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  text?: string;
  choices: Array<{ label: string; key: string } | string>;
  openlabel?: string;
  nonelabel?: string;
  sumlength?: number;
  qtyinterlock?: boolean;
  formula: CompoundFormula[];
  message?: string;
  suboptions?: ComplexSubOptionData;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
  textwcname?: string;
} & ({ products: CompoundProductDefinition[] } | { procedural: CompoundProceduralProductsDefinition });
export type ComplexDropdownOption = {
  id: string;
  type: "ComplexDropdownOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  suboptions?: ComplexSubOptionData;
  choices: Array<{ label: string; value: string } | string>;
  default?: string;
  emptylabel?: string;
  customproperty?: {
    target: string;
    value?: string;
    format?: string;
  };
  previewformat?: string;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: "$value$";
  wcmod?: string;
};
export type ComplexToggleOption = {
  id: string;
  type: "ComplexToggleOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  suboptions?: ComplexSubOptionData;
  boolean: boolean;
  counterpart?: string;
  hidename?: boolean;
  label?: string;
  first?: boolean;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo | OptionGalleryPageTemplate;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: "$value$";
  wcmod?: string;
};
export type GrandLabelOption = {
  id: string;
  type: "GrandLabelOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandWideOption = {
  id: string;
  type: "GrandWideOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  image?: ImageData | string;
  atcheckout?: string;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandAddonOption = {
  id: string;
  type: "GrandAddonOption";
  name: string;
  nickname?: string;
  comment?: string;
  boolean?: boolean;
  info?: string;
  upcharge: number;
  hideupcharge?: boolean;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandBlockOption = {
  id: string;
  type: "GrandBlockOption";
  name: string;
  nickname?: string;
  comment?: string;
  boolean?: boolean;
  info?: string;
  upcharge: number;
  hideupcharge?: boolean;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandWideAddonOption = {
  id: string;
  type: "GrandWideAddonOption";
  name: string;
  nickname?: string;
  comment?: string;
  boolean?: boolean;
  info?: string;
  upcharge: number;
  hideupcharge?: boolean;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandVariableOption = {
  id: string;
  type: "GrandVariableOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;

  upcharge?: number;
  suboptions?: {
    key: string;
    options: Array<string>;
    default?: string;
    required?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcscope?: string;
    store?: boolean | "value" | "interaction";
  };
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandGratuityOption = {
  id: string;
  type: "GrandGratuityOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  noteprompt?: string;
  text?: string;
  textwcname?: string;
  suboptions?: {
    key: string;
    options: Array<string>;
    default?: string;
    required?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcscope?: string;
    store?: boolean | "value" | "interaction";
  };
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandMeterOption = {
  id: string;
  type: "GrandMeterOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge: number | string;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandHiddenOption = {
  id: string;
  type: "GrandHiddenOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandTileOption = {
  id: string;
  type: "GrandTileOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge: number | string;
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GrandClonerOption = {
  id: string;
  type: "GrandClonerOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge: number | string;
  prompt?: string;
  addlabel?: string;
  mutations: OrderCloneMutation[];
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type GenericOption = {
  id: string;
  type: "GenericOption";
  name: string;
  nickname?: string;
  comment?: string;
  info?: string;
  upcharge?: number;
  genericmeta?: any;
  suboptions?: {
    key: string;
    options: Array<string>;
    default?: string;
    required?: boolean;
    ignore?: boolean;
    persist?: boolean;
    pimcocontributer?: boolean;
    wcscope?: string;
    store?: boolean | "value" | "interaction";
  };
  dohijack?: boolean;
  restrict?: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  notify?: StandardPopupInfo;
  viewset?: ConfiguratorViewSet;
  apply?: OptionApplication | Array<OptionApplication>;
  pimco?: PimcoContribution;
  pimco3d?: Record<string, Pimco3DMaterialDefinition>;
  meshes3d?: Array<Mesh3DReference | Mesh3DVariables>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
};
export type Option =
  | BasicOption
  | ParallelSwatchOption
  | ParallelRegionOption
  | ParallelAccessoryOption
  | ComplexOption
  | ColorOption
  | GrandOption
  | GenericOption;
export type ComplexOption =
  | ComplexLabelOption
  | ComplexImageOption
  | ComplexSwatchOption
  | ComplexChromaOption
  | ComplexLeatherOption
  | ComplexColorsOption
  | ComplexTextOption
  | ComplexInitialsOption
  | ComplexTypeOption
  | ComplexSwatchLabelOption
  | ComplexUploaderOption
  | ComplexCompoundOption
  | ComplexDropdownOption
  | ComplexToggleOption;
export type GrandOption =
  | GrandWideOption
  | GrandLabelOption
  | GrandAddonOption
  | GrandGratuityOption
  | GrandMeterOption
  | GrandBlockOption
  | GrandWideAddonOption
  | GrandHiddenOption
  | GrandVariableOption
  | GrandTileOption
  | GrandClonerOption;
export type Options = Array<Option>;

export type ComplexSubOptionData = {
  key: string;
  options: Array<string>;
  default?: string;
  required?: boolean;
  permanent?: boolean;
  ignore?: boolean;
  persist?: boolean;
  pimcocontributer?: boolean;
  wcscope?: string;
  contain?: boolean;
  store?: boolean | "value" | "interaction";
};

// Product Tax Definitions

export type LeatherInfo = {
  id: string;
  type: "Leather";
  name: string;
  comment?: string;
  category: string;
  icon: ImageData | string;
  fullicon: ImageData | string;
  highlights: Array<string>;
  description: string;
  pricepoint?: "$" | "$$" | "$$$" | "$$$$" | "$$$$$";
  breakin: 1 | 2 | 3 | 4;
  weight: 1 | 2 | 3 | 4;
  images: Array<{ thumbnail: ImageData | string; full: ImageData | string }>;
  properties: Array<boolean | number | string>;
};
export type SeriesInfo = {
  id: string;
  type: "Series";
  name: string;
  comment?: string;
  upcharge?: number;
  thumbnail: ImageData | string;
  preview: SpinImageData | ImageData | string;
  models: Array<string>;
  leathers: Array<string>;
  breakin?: 1 | 2 | 3 | 4;
  pimcofiller?: PimcoFiller;
  weight?: 1 | 2 | 3 | 4;
  alter?: ObjectAlteration | Array<ObjectAlteration>;
  dohijack?: boolean;
  restrict?: string | Array<string>;
  disabled?: boolean;
  enable?: ConfiguratorEnabling | ConfiguratorEnabling[];
  wcvalue?: string;
  wcmod?: string;
  wcnote?: {
    value: string;
    addon: string;
  };
};
// The product images need defined regions
export type ProductImageComponentBase = {
  id: string;
  type: "ProductImageComponentBase";
  name: string;
  comment?: string;
  regiontag?: string;
  product?: string | string[];
};

// Generic Configurator Object
// Keep me updated!
export type ConfiguratorObject =
  | Product
  | Model
  | Attribute
  | Option
  | LeatherInfo
  | SeriesInfo
  | ProductImageComponentBase;

// Define types for information API
export type OptionsPageTemplate = {
  id?: string;
  name: string;
  title?: string;
  component: "OptionsInfoPage";
  info: {
    title: string;
    body: string;
  };
  options: Array<Option>;
};
export type LeatherGuidePageTemplate = {
  id?: string;
  name: string;
  title?: string;
  component: "LeatherGuidePage";
  info: {
    title: string;
    body: string;
  };
  leathers?: Array<string>;
  buckets?: Array<string>;
};
export type LeatherDetailsPageTemplate = LeatherInfo & {
  title?: string;
  component: "LeatherDetailsPage";
};
export type LeatherComparePageTemplate = {
  id?: string;
  name: string;
  title?: string;
  component: "LeatherGuidePage";
  leathers: Array<ComplexLeatherOption | string>;
};
export type OptionGalleryPageTemplate = {
  id: string;
  title?: string;
  component: "OptionGalleryPage";
  name: string;
  index?: string;
  comment?: string;
  description: string;
  images: Array<{ thumbnail: ImageData | string; full: ImageData | string }>;
};

export type PageTemplate =
  | OptionsPageTemplate
  | LeatherGuidePageTemplate
  | LeatherDetailsPageTemplate
  | LeatherComparePageTemplate
  | OptionGalleryPageTemplate;

// Other Definitions
export type ImageData = {
  src: string;
  srcset?: ImageDataSrcset;
  sizes?: ImageDataSizes;
  alt?: string;
  lazyload?: boolean;
  width?: number;
  height?: number;
};
export type ImageDataSrcset = string | { [query: string]: string };
export type ImageDataSizes = string | { [query: string]: string };
export type VideoSource = {
  src: string;
  type?: string;
};
export type VideoSize = {
  sources?: Array<VideoSource | string>;
  source?: VideoSource | string;
  poster?: string;
  width?: number;
  height?: number;
};
export type VideoData = {
  sizes: VideoDataSizes;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  poster?: string;
  width?: number;
  height?: number;
};
export type VideoDataSizes = {
  [size: number]: VideoSize | VideoSource | string;
  default: VideoSize | VideoSource | string;
};
export type LeatherGuideInfo = {
  name: string;
  info: { title: string; body: string };
  series: Array<string>;
};
export type ConfiguratorRestriction =
  | {
      id: string | string[];
      path: Array<string>;
      extrarules?: ApplicationCondition | ApplicationCondition[];
    }
  | string;
export type ConfiguratorEnabling =
  | {
      id: string | string[];
      path?: string[];
      extrarules?: ApplicationCondition | ApplicationCondition[];
    }
  | string;
export type StandardPopupInfo = {
  title: string;
  content?: string;
  image?: ImageData | string;
  index?: string;
  delay?: number;
};
export type SpecialPopupInfo = {
  title: string;
  message?: string;
  mode?:
    | "confirm"
    | "share"
    | "colorplay"
    | "startover"
    | "fnp_email-default"
    | "fnp_thankyou-default"
    | "fnp_bat-construction"
    | "fnp_upload-file"
    | "fnp_size-run";
  confirm?: {
    callback: Function;
    label?: string;
  };
  cancel?: {
    callback?: Function;
    label?: string;
    hide?: boolean;
  };
  payload?: any;
};
export type OptionApplication = {
  option: string | "default" | "random" | null;
  path: Array<string> | string;
  force?: boolean;
  asinteraction?: boolean;
  once?: boolean;
  id?: string;
  filter?: string[];
  condition?: ApplicationCondition | ApplicationCondition[];
  delay?: number;
};
export type ApplicationCondition = {
  branch: string;
  value: string | string[] | null;
  comparison: "VALUE IS" | "VALUE IS NOT" | "VALUE IN" | "VALUE NOT IN";
};
export type ObjectAlteration = {
  id: string | Array<string>;
  path?: string | Array<string>;
  command: "assign" | "remove" | "default" | "insert" | "restrict" | "extract";
  value?: any;
  parameter?: any;
  condition: {
    value: any;
    property: "model" | "series";
    operation: "equals" | "notequals";
  };
  comment?: string;
};
export type AlterationDesignation = {
  id: string;
  parent: string;
  position?: number;
};
export type SpinImageData = {
  count: number;
  filescheme: string;
  spin?: number;
};
export type ProductImageComponent = {
  id: string;
  name: string;
  mode: "color" | "image";
  color?: string | string[] | { [idx: string]: string };
  texture?: string;
  coloridx?: number | string;
  alpha: number;
  blend: BlendMode;
  mask: string | PimcoMaskSubstitutionCompiled;
  image: string;
  order?: number;
  hlimage1?: string;
  hlalpha1?: number;
  hlblend1?: BlendMode;
  hlimage2?: string;
  hlalpha2?: number;
  hlblend2?: BlendMode;
  eindex?: number;
  regionid?: number;
  compositemode?: CanvasCompositeOperation;
  placement?: ImagePlacementDefinition;
};
export type ProductImageContributer = {
  frames?: Array<ProductImageFrame | null>;
  mode?: "color" | "image";
  color?: string | string[] | { [idx: string]: string };
  texture?: string;
  coloridx?: number | string;
  alpha?: number;
  blend?: BlendMode;
  hlalpha1?: number;
  hlblend1?: BlendMode;
  hlalpha2?: number;
  hlblend2?: BlendMode;
  altbaseimage?: string;
  altmaskimage?: string;
  althlimage?: string;
  allowedregiontags?: Array<string>;
  priority?: number;
  cascade?: boolean | "hollow";
  comment?: string;
  cancel?: true;
  eindex?: number;
  filler?: boolean;
  regionspec?: boolean | string | string[];
  compositemode?: CanvasCompositeOperation;
};
export type ProductImageFrame = {
  mask?: string | PimcoMaskSubstitution;
  image?: string;
  order?: number;
  hlimage1?: string;
  hlimage2?: string;
  texture?: string;
  placement?: ImagePlacementDefinition;
};
export type PimcoContribution = {
  [key: string]: ProductImageContributer;
};
export type PimcoMaskSubstitution = {
  content?: string;
  transform?:
    | {
        [pattern: string]: PimcoMaskSubstitutionTransformation;
      }
    | PimcoMaskSubstitutionTransformation;
  displace?: PimcoMaskSubstitutionDisplacement;
  effect?: PimcoMaskSubstitutionEffect;
  effectparams?: Record<string, any>;
  type?:
    | {
        [pattern: string]: PimcoMaskSubstitutionTypeDefintion;
      }
    | PimcoMaskSubstitutionTypeDefintion;
  projection?: PimcoMaskSubstitutionProjection;
  postmask?: string;
};
export type PimcoMaskSubstitutionCompiled = {
  content?: string;
  transform?: PimcoMaskSubstitutionTransformation;
  displace?: PimcoMaskSubstitutionDisplacement;
  effect?: PimcoMaskSubstitutionEffect;
  effectparams?: Record<string, any>;
  type?: PimcoMaskSubstitutionTypeDefintion;
  projection?: PimcoMaskSubstitutionProjection;
  postmask?: string;
};
export type PimcoMaskSubstitutionTransformation = {
  translation?: [number, number];
  rotation?: number;
  scale?: number | [number, number];
  breaker?: number;
};
export type PimcoMaskSubstitutionDisplacement = {
  map: string;
  scalex?: number;
  scaley?: number;
};
export type PimcoMaskSubstitutionProjection = {
  mesh: string;
  transformation?: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
  camera: [number, number, number];
  type?: "perspective" | "orthographic";
  fov?: number;
  rect?: [number, number, number, number];
  uvorigin?: [number, number];
  uvauto?: "x" | "y";
  uvmeshratio?: number;
  identifier?: string;
};
export type PimcoMaskSubstitutionTypeDefintion = {
  fontfamily?: string;
  fontweight?: number | string;
  letterspacing?: string;
  lineheight?: number;
  texttransform?: "uppercase" | "lowercase" | "capitalize";
  widthscale?: number;
  maxwidth?: number;
  alignment?: "center" | "left" | "right";
  heightscale?: number;
  path?: {
    data: string;
    viewbox: [number, number, number, number];
    width: number | string;
    height: number | string;
    baseline?: "alphabetic" | "middle" | "central" | "hanging";
  };
};
export type PimcoMaskSubstitutionEffect =
  | "embroidery"
  | "engraving"
  | "metal"
  | "painted"
  | "hotstamp"
  | "foil"
  | "normal";
export type PimcoFiller = Array<
  | {
      option: string | Array<string>; // ID or IDs of options to reference
      pimco: string | Array<string>; // ID or IDs pimco data objects on the option(s)
      priority?: number; // Define the priority this data gets used in the final pimco object
    }
  | string
>; // Use this object to reference existing pimco data so that certain selections appear baked into the rendering
export type ProductImageMaterial3DComponent = Partial<
  Omit<Omit<ProductImageComponent & { priority?: number }, "id">, "name">
>;
export type Pimco3DMaterialDefinition = {
  albedo?: ProductImageMaterial3DComponent;
  normal?: ProductImageMaterial3DComponent;
  orm?: ProductImageMaterial3DComponent;
  emissive?: ProductImageMaterial3DComponent;
  env?: ProductImageMaterial3DComponent;
};
export type Pimco3DMaterialCollection = {
  albedo?: ProductImageMaterial3DComponent[];
  normal?: ProductImageMaterial3DComponent[];
  orm?: ProductImageMaterial3DComponent[];
  emissive?: ProductImageMaterial3DComponent[];
  env?: Array<ProductImageMaterial3DComponent>;
};
export type DefaultSetDesignation = {
  id: string;
  parent: string;
};
export type ConfiguratorView = [number, number, number] | number;
export type ConfiguratorViewSet =
  | Array<{
      view: ConfiguratorView;
      extrarules?: ApplicationCondition | ApplicationCondition[];
    }>
  | ConfiguratorView;

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";
export type CanvasCompositeOperation =
  | "source-over"
  | "source-in"
  | "source-out"
  | "source-atop"
  | "destination-over"
  | "destination-in"
  | "destination-out"
  | "destination-atop"
  | "lighter"
  | "copy"
  | "xor"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export type WoocommerceReview = {
  id: number;
  author: string;
  date: string;
  content: string;
  rating: number;
};
export type OrderCloneMutation =
  | {
      branch: string;
      type: "options";
      source: "selection";
      label: string;
      shortlabel?: string;
      info?: StandardPopupInfo;
      options: string[];
    }
  | {
      branch: string;
      type: "text";
      source: "selection";
      label: string;
      shortlabel?: string;
      info?: StandardPopupInfo;
      pattern?: string | TextMutationConditionalPattern | Array<string | TextMutationConditionalPattern>;
    }
  | {
      wcname: string;
      type: "text";
      source: "meta";
      label: string;
      shortlabel?: string;
      info?: StandardPopupInfo;
      pattern?: string | TextMutationConditionalPattern | Array<string | TextMutationConditionalPattern>;
    };
export type TextMutationConditionalPattern = {
  branch: string;
  option: string;
  pattern: string;
};
export type ContentDataFileRef = {
  fileref: true;
  filename: string;
};
export type ProductStageHijackParameters = {
  images: {
    [size: number]: {
      src: string;
      width: number;
      height: number;
      overtext?: { x: number; y: number; value: string[] };
    };
    default?: {
      src: string;
      width: number;
      height: number;
      overtext?: {
        x: number;
        y: number;
        angle?: number;
        max?: number;
        fontsize?: number;
        value: string[];
      };
    };
  };
  text?:
    | string
    | {
        content: string;
        position: "above" | "below";
      };
};
export interface ConfiguratorObjectModifier {
  type: "ConfiguratorObjectModifier";
  object: string | string[];
  path: string[];
  mod: any;
  create: boolean;
  parameter: string;
  operator:
    | "IS"
    | "IS NOT"
    | "LESS THAN"
    | "GREATER THAN"
    | "LESS THAN OR EQUAL"
    | "GREATER THAN OR EQUAL"
    | "IN"
    | "NOT IN";
  value: string | number | boolean;
}

export type Mesh3DReference =
  | string
  | {
      path: string;
      transformation: FixedSizeArray<number, 16>;
    };
export type Mesh3DVariables = {
  type: "Mesh3DVariables";
  variables: Record<string, string | number>;
  priority?: number;
};

export interface Light3DReference {
  type: "DirectionalLight" | "AmbientLight" | "PointLight" | "HemisphereLight";
  color: number;
  intensity: number;
  position?: FixedSizeArray<number, 3>;
  target?: FixedSizeArray<number, 3>;
  shadowing?: boolean;
  color2?: number;
}

export type ParseableTemplate<T = any> = {
  return: T;
  count: number;
  variables: Record<string, any>;
};

export interface CompoundProductDefinition {
  key: string;
  wooid: string;
  woovariation?: string;
  addons?: Record<string, string>;
}

export type CompoundProceduralProductsDefinition = ParseableTemplate<CompoundProductDefinition>;

export type CompoundFormula =
  | {
      type: "regexp";
      pattern: string;
      flags?: string;
      fallback?: any;
    }
  | {
      type: "method";
      name: string;
      args?: any[];
      fallback?: any;
    }
  | {
      type: "fixed";
      name: "remap";
      args?: any[];
      fallback?: any;
    };

export type ImagePlacementDefinition = {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  fit?: "contain" | "cover" | "fill";
  position?: [number, number];
  transform?: ImagePlacementTransform[] | FixedSizeArray<number, 6>;
};

export type ImagePlacementTransform<T extends number | string = number | string> =
  | { type: "rotate"; angle: T }
  | { type: "scale"; x: T; y: T }
  | { type: "translate"; x: T; y: T }
  | { type: "skew"; x: T; y: T };

export type FixedSizeArray<T, N extends number> = N extends 0
  ? never[]
  : {
      0: T;
      length: N;
    } & ReadonlyArray<T>;

export type NumericalFormula = {
  params?: Record<string, any>;
  methods: Array<{
    name: NumericalFormulaMethodNames;
    args?: Array<string | number>;
  }>;
};

export type MaterialTextureName = "albedo" | "normal" | "orm" | "emissive" | "env";

export type MaterialComponentName = "albedo" | "normal" | "roughness" | "metallic" | "ao" | "emissive" | "env";
