import type { State } from "@/store/state";
import type {
  Product,
  Model,
  Attribute,
  Option,
  LeatherInfo,
  ProductImageComponentBase,
  SeriesInfo,
} from "@/types";

/**
 * Create a mock Product object
 */
export function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-gloves",
    type: "Product",
    name: "Gloves",
    models: ["model-alpha-s"],
    modes: ["blank", "series"],
    frames: 2,
    dimensions: [1350, 1350],
    baseprice: 599,
    startpage: {
      template: "glove-landing",
      data: {},
      rtemplate: "glove-patterns",
    },
    ...overrides,
  } as Product;
}

/**
 * Create a mock Model object
 */
export function createMockModel(overrides: Partial<Model> = {}): Model {
  return {
    id: "model-alpha-s",
    type: "Model",
    name: "Alpha S",
    nickname: "Alpha",
    inches: "11.5",
    classes: { sport: ["baseball"], position: ["infield"] },
    preview: "/images/preview.jpg",
    thumbnail: "/images/thumb.jpg",
    attributes: ["attr-leather", "attr-web", "attr-lacing"],
    wcvalue: "Alpha S 11.5",
    frames: 4,
    ...overrides,
  } as Model;
}

/**
 * Create a mock Attribute object
 */
export function createMockAttribute(overrides: Partial<Attribute> = {}): Attribute {
  return {
    id: "attr-leather",
    type: "Attribute",
    name: "Leather",
    nickname: "Leather Options",
    component: "ComplexSelector",
    attributes: ["sub-base", "sub-palm"],
    info: {
      title: "About Leather",
      body: "Choose your leather type and color.",
    },
    ...overrides,
  } as Attribute;
}

/**
 * Create a mock Option object
 */
export function createMockOption(overrides: Partial<Option> = {}): Option {
  return {
    id: "option-brown",
    type: "Option",
    name: "Brown",
    wcvalue: "brown",
    upcharge: 0,
    color: "#8B4513",
    ...overrides,
  } as Option;
}

/**
 * Create a mock LeatherInfo object
 */
export function createMockLeather(overrides: Partial<LeatherInfo> = {}): LeatherInfo {
  return {
    id: "leather-steerhide",
    type: "LeatherInfo",
    name: "Steerhide",
    description: "Premium steerhide leather",
    features: ["Durable", "Game-ready"],
    ...overrides,
  } as LeatherInfo;
}

/**
 * Create a mock SeriesInfo object
 */
export function createMockSeries(overrides: Partial<SeriesInfo> = {}): SeriesInfo {
  return {
    id: "series-classic",
    type: "SeriesInfo",
    name: "Classic Series",
    description: "Traditional design patterns",
    ...overrides,
  } as SeriesInfo;
}

/**
 * Create a mock ProductImageComponentBase (PIMCO)
 */
export function createMockPimco(
  overrides: Partial<ProductImageComponentBase> = {}
): ProductImageComponentBase {
  return {
    id: "pimco-palm-base",
    type: "ProductImageComponentBase",
    name: "Palm Base",
    views: [1, 2],
    order: 1,
    frames: [
      { image: "/images/palm-front.jpg", mask: "/images/palm-mask.png" },
      { image: "/images/palm-back.jpg", mask: "/images/palm-mask.png" },
    ],
    ...overrides,
  } as ProductImageComponentBase;
}

/**
 * Create a mock selectedOptions structure
 */
export function createMockSelectedOptions(
  productId: string = "gloves",
  modelId: string = "model-alpha-s"
) {
  return {
    [productId]: {
      model: modelId,
      series: "",
      selections: {},
      cloneMeta: {},
    },
  };
}

/**
 * Create a mock objectIDMap with common objects
 */
export function createMockObjectIDMap() {
  const product = createMockProduct();
  const model = createMockModel();
  const attribute = createMockAttribute();
  const option = createMockOption();

  return {
    [product.id]: product,
    [model.id]: model,
    [attribute.id]: attribute,
    [option.id]: option,
  };
}

/**
 * Create a minimal valid state for testing
 */
export function createMinimalState(overrides: Partial<State> = {}): Partial<State> {
  return {
    currentProduct: "gloves",
    currentAttribute: 0,
    products: [createMockProduct()],
    models: [createMockModel()],
    attributes: [createMockAttribute()],
    options: [createMockOption()],
    objectIDMap: createMockObjectIDMap(),
    selectedOptions: createMockSelectedOptions(),
    configuratorPage: "build",
    configuratorMode: "blank",
    productView: 0,
    pimcos: [],
    productImageContributions: {},
    restrictions: {},
    ...overrides,
  };
}

/**
 * Create state with selections already made
 */
export function createStateWithSelections(
  selections: Record<string, unknown>,
  productId: string = "gloves"
): Partial<State> {
  return createMinimalState({
    selectedOptions: {
      [productId]: {
        model: "model-alpha-s",
        series: "",
        selections,
        cloneMeta: {},
      },
    },
  });
}
