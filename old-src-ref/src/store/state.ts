import {
  Attributes,
  ConfiguratorObject,
  ConfiguratorRestriction,
  ConfiguratorView,
  LeatherGuideInfo,
  LeatherInfo,
  Light3DReference,
  Model,
  Option,
  Options,
  PageTemplate,
  ProductImageComponentBase,
  ProductImageContributer,
  Products,
  ProductStageHijackParameters,
  SeriesInfo,
  SpecialPopupInfo,
  StandardPopupInfo,
} from "@/types";
import utils from "@/utils";
import { starters } from "./initialize";
import params from "@/params";

// Define state in this function to make TYPE-ing alot easier
const state = (function () {
  // Can be used to easily access any ConfiguratorObject if you have it's ID
  const objectIDMap: { [key: string]: ConfiguratorObject } = {};
  const currentProduct: string = starters.product as string;
  const products: Products = [];
  const currentAttribute: number = starters.step;
  const options: Options = [];
  const attributes: Attributes = [];
  const leathers: Array<LeatherInfo> = [];
  const agreedTerms: { [key: string]: boolean } = {};
  const models: Array<Model> = [];
  const series: Array<SeriesInfo> = [];
  const restrictions: {
    [key: string]: ConfiguratorRestriction | Array<ConfiguratorRestriction>;
  } = {};
  const configuratorPage: "start" | "colorplay" | "patterns" | "build" = starters.page as any;
  const configuratorMode: "series" | "blank" | "color" | "edgex" | "edgex-landing" | "" = starters.mode as any;
  // The ability to add to cart can be globally disabled from anywhere using this property
  const globalAddToCartState: boolean = true;

  // RANDOS (anything random that needs 2 be managed atta global level)
  const tippedLeatherGuide: boolean = starters.lgWasTipped; // Indicates if the leatherguide presentation has happened
  const attrTransitionWait: number = 200; // The time for transition between attributes
  const attrTransitionBusy: boolean = false; // Globally indicates if the attr transition is in progress

  // This object keeps track of all the selections and
  // its structure must be maintained to reflect all
  // products, attributes and their options
  const selectedOptions: {
    [key: string]: {
      selections: any;
      model: string;
      series?: string;
      cloneMeta?: {
        [key: string]: Array<{ key: string; value: any; ref: boolean }>[];
      };
    };
  } = {};

  // Data for the InformationOverlay
  const informationOverlayPages: Array<PageTemplate> = [];
  const leatherGuideInfo: LeatherGuideInfo | null = null;
  const leatherProps: { [key: string]: string } = {};
  const leatherGuideLeathers: Array<{ leather: string; bucket: string }> = [];

  // Data for the InformationOverlay
  const renderCompletionOverlay: boolean = false;
  const showIncompleted: boolean = false;

  // Data for the ProductCheckoutOverlay
  const renderCheckoutOverlay: boolean = false;

  // Keep track of the window height even when safari does it's wacky thing
  const windowHeight: number = window.innerHeight;
  const windowWidth: number = window.innerWidth;

  // Data for the standard popup
  const standardPopupInfo: StandardPopupInfo | null = null as any;
  const indexedPopups: Set<string> = new Set(starters.indexedPopups);
  // Data for the special popup
  const specialPopupInfo: SpecialPopupInfo | null = null as any;
  // Data for the size changer popup
  const sizeChangePopup: boolean | string = false;
  // Switch screen for going edgex
  const goEdgeXPopup: boolean = false;
  // Switch screen for going calssic from edgex
  const goClassicPopup: boolean = false;

  // The share session ID
  const sessionID: string = "";

  // Use this to force the price to update on a regular basis in case something gets stuck
  const priceEnforcer = false;

  // Data for the product images
  const productView = starters.frame as ConfiguratorView;
  // List all the product image components retrieved from the database
  const pimcos: Array<ProductImageComponentBase> = [];
  // List all the data objects that contribute to each product image component
  const productImageContributions: {
    [key: string]: Array<
      ProductImageContributer & {
        ["x-data"]: { attributes: { id: string; disabled?: boolean }[] };
      }
    >;
  } = {};
  // Toggle this to force update the pimco getter
  const pimcoUpdater = false;
  // A place to store and pimco contributers that are built by the app instead of defined in the data
  const generatedProductImageContributions: {
    [key: string]: Array<ProductImageContributer>;
  } = {};
  const productImageDataURL = "";
  // Store the misc color play info here
  const colorPlayInfo: any = {};
  // Track which option have applied a certain application if they are only supposed to do it once
  const optionApplicationTracker = starters.optionApplicationTracker;
  // Have a state where the product image can be rendered for capturing the image
  const expandProductStage: boolean = starters.startExpandProductStage as boolean;
  // Get what browser and operating system the user is running on
  const userBrowser: string = utils.detectBrowser();
  const OS: string | null = utils.getOS();

  // Data that pre-configurator pages uses to display stuff
  const preConfigData: { [key: string]: any } = {};

  const stageHijacker = null as ProductStageHijackParameters | null;
  const stageHijackerPath = null as string[] | null;

  const toggleRender = true;

  // Track branches that need to stay in sync
  const branchSync: Array<{
    branch: string;
    sync: string[];
    twoway?: boolean;
  }> = [];
  const branchSyncEnabled = false;

  const wasmLoaded = false;
  const wasmUnavailable = false;

  const supportsAvif = false;

  const editorPimcoOption: { onClose: Function; option: Option } | Option | null = null as any;

  const showControls3DTutorial = false;

  const hideHeader = params.getBool("hideHeader");

  const inStudioMode = false;
  const displayStudioControls = false;
  const studioPoses: Array<{ euler: [number, number, number]; name: string }> = [];
  const studioLighting: Array<Light3DReference & { name: string }> | null = null as any;

  const existingAssets: Array<string> = [];
  return {
    products,
    selectedOptions,
    attributes,
    currentProduct,
    currentAttribute,
    options,
    objectIDMap,
    tippedLeatherGuide,
    attrTransitionWait,
    attrTransitionBusy,
    informationOverlayPages,
    leatherGuideInfo,
    leathers,
    leatherProps,
    windowHeight,
    windowWidth,
    renderCompletionOverlay,
    renderCheckoutOverlay,
    agreedTerms,
    restrictions,
    models,
    configuratorPage,
    configuratorMode,
    series,
    standardPopupInfo,
    indexedPopups,
    specialPopupInfo,
    sizeChangePopup,
    leatherGuideLeathers,
    sessionID,
    globalAddToCartState,
    priceEnforcer,
    productView,
    productImageContributions,
    pimcos,
    pimcoUpdater,
    productImageDataURL,
    generatedProductImageContributions,
    colorPlayInfo,
    optionApplicationTracker,
    expandProductStage,
    showIncompleted,
    userBrowser,
    OS,
    preConfigData,
    stageHijacker,
    stageHijackerPath,
    branchSync,
    branchSyncEnabled,
    goClassicPopup,
    goEdgeXPopup,
    wasmLoaded,
    wasmUnavailable,
    editorPimcoOption,
    toggleRender,
    showControls3DTutorial,
    hideHeader,
    inStudioMode,
    displayStudioControls,
    studioPoses,
    studioLighting,
    supportsAvif,
    existingAssets,
  };
})();

export type State = typeof state;

export default state;
