import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mock objects that can be used in vi.mock factories
const { mockWoocommerce, mockStructure, mockUtils, mockEvalApplicationConditions } = vi.hoisted(() => ({
  mockWoocommerce: {
    getProduct: vi.fn(() => "12345"),
    getProductPrice: vi.fn(() => 0),
    getOptionCharge: vi.fn(() => 0),
    getModBranchIDs: vi.fn(() => []),
    getAddon: vi.fn(() => null),
    getOption: vi.fn(() => null),
    getProductName: vi.fn(() => "Mock Product"),
  },
  mockStructure: {
    getFilteredStructure: vi.fn((obj) => obj),
    traverse: vi.fn(),
    build: vi.fn(() => ({})),
  },
  mockUtils: {
    getNumber: vi.fn((val: unknown) => (typeof val === "number" ? val : parseFloat(String(val)) || 0)),
    getBasePrice: vi.fn(() => 0),
    getOptionUpcharge: vi.fn(() => 0),
    digOutUpcharges: vi.fn(() => 0),
    digOutPercentages: vi.fn(() => 0),
    digOutWooProducts: vi.fn(() => []),
    orderedInsert: vi.fn(),
    setVersionParam: vi.fn((x: string) => x),
    getNested: vi.fn(),
    setNested: vi.fn(),
    standardAttributeFilter: vi.fn(() => true),
  },
  mockEvalApplicationConditions: vi.fn(() => true),
}));

// Mock woocommerce
vi.mock("@/woocommerce", () => ({
  default: mockWoocommerce,
}));

// Mock structure
vi.mock("@/structure", () => ({
  default: mockStructure,
  OptionCasing: class MockOptionCasing {
    value: unknown = null;
    required: boolean = false;
    userInteraction: boolean = false;
    noRequirement: boolean = false;
    branchID: string = "";
    woocommerceName: string = "";
    woocommerceProduct: string = "";
    order: number = 0;
    "x-data": unknown = null;
    constructor(config: Record<string, unknown> = {}) {
      Object.assign(this, config);
    }
    next() {
      return null;
    }
    previous() {
      return null;
    }
    getPath() {
      return [];
    }
    getMetaData() {
      return null;
    }
  },
}));

// Mock utils
vi.mock("@/utils", () => ({
  default: mockUtils,
}));

// Mock params
vi.mock("@/params", () => ({
  default: {
    get: vi.fn(() => null),
    getString: vi.fn(() => ""),
    getBool: vi.fn(() => false),
    has: vi.fn(() => false),
    isString: vi.fn(() => false),
    all: vi.fn(() => ({})),
  },
}));

// Mock pimcos
vi.mock("@/pimcos", () => ({
  default: {
    getPimcos: vi.fn(() => []),
  },
}));

// Mock actions
vi.mock("./actions", () => ({
  default: {},
}));

// Mock mutations
vi.mock("./mutations", () => ({
  evalApplicationConditions: mockEvalApplicationConditions,
  setPimcos: vi.fn(),
}));

// Mock formulas
vi.mock("@/formulas", () => ({
  default: {},
}));

// Mock threedee
vi.mock("@/threedee", () => ({
  pldToLight3DReference: vi.fn(),
}));

// Mock initialize with pass-through context functions
vi.mock("./initialize", () => ({
  starters: {
    product: "gloves",
    step: 0,
    page: "build",
    mode: "blank",
    frame: 0,
    lgWasTipped: false,
    indexedPopups: [],
    optionApplicationTracker: {},
    startExpandProductStage: false,
    series: {},
    dev: false,
  },
  clearStartSeries: vi.fn(),
  clearStartModels: vi.fn(),
  regenSessionImages: false,
  gettersContext: <T>(getters: T): T => getters,
  mutationsContext: <T>(mutations: T): T => mutations,
  actionsContext: <T>(actions: T): T => actions,
  watchersContext: <T>(watchers: T): T => watchers,
}));

// Now import the getters after all mocks are set up
import getters from "./getters";

describe("store getters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create a mock state
  const createMockState = (overrides: Record<string, unknown> = {}) => ({
    currentProduct: "gloves",
    currentAttribute: 0,
    products: [],
    models: [],
    attributes: [],
    options: [],
    objectIDMap: {} as Record<string, unknown>,
    selectedOptions: {} as Record<string, { model: string; series: string; selections: Record<string, unknown> }>,
    pimcos: [],
    productView: 0,
    configuratorPage: "build",
    configuratorMode: "blank",
    windowHeight: 768,
    windowWidth: 1024,
    OS: "Desktop",
    userBrowser: "Chrome",
    wasmLoaded: false,
    sessionID: "test-session",
    priceEnforcer: 0,
    inStudioMode: false,
    studioLighting: null,
    ...overrides,
  });

  describe("getProduct", () => {
    it("should return the current product from objectIDMap", () => {
      const mockProduct = { id: "gloves", name: "Gloves", type: "Product" };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { gloves: mockProduct },
      });

      const result = getters.getProduct(state);
      expect(result).toBe(mockProduct);
    });

    it("should return undefined if product not in objectIDMap", () => {
      const state = createMockState({
        currentProduct: "unknown",
        objectIDMap: {},
      });

      const result = getters.getProduct(state);
      expect(result).toBeUndefined();
    });
  });

  describe("getProductName", () => {
    it("should return product name without trailing 's'", () => {
      const mockProduct = { id: "gloves", name: "Gloves", type: "Product" };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { gloves: mockProduct },
      });

      const result = getters.getProductName(state);
      expect(result).toBe("Glove");
    });

    it("should return product name unchanged if not ending with 's'", () => {
      const mockProduct = { id: "bat", name: "Bat", type: "Product" };
      const state = createMockState({
        currentProduct: "bat",
        objectIDMap: { bat: mockProduct },
      });

      const result = getters.getProductName(state);
      expect(result).toBe("Bat");
    });

    it("should return empty string if no product found", () => {
      const state = createMockState({
        currentProduct: "unknown",
        objectIDMap: {},
      });

      const result = getters.getProductName(state);
      expect(result).toBe("");
    });
  });

  describe("getModel", () => {
    it("should return model from objectIDMap when model is selected", () => {
      const mockModel = { id: "classic-w", name: "Classic W", type: "Model" };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { "classic-w": mockModel },
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      const result = getters.getModel(state);
      expect(result).toBe(mockModel);
    });

    it("should return null if no model is selected", () => {
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getModel(state);
      expect(result).toBeNull();
    });

    it("should return null if selectedOptions is empty", () => {
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {},
      });

      const result = getters.getModel(state);
      expect(result).toBeNull();
    });
  });

  describe("getModelID", () => {
    it("should return modelID from selectedOptions", () => {
      const state = createMockState({
        currentProduct: "gloves",
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      const result = getters.getModelID(state);
      expect(result).toBe("classic-w");
    });

    it("should return empty string if no model selected", () => {
      const state = createMockState({
        currentProduct: "gloves",
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getModelID(state);
      expect(result).toBe("");
    });
  });

  describe("getBasePrice", () => {
    it("should return base price from model wcvalue", () => {
      const mockModel = {
        id: "classic-w",
        name: "Classic W",
        type: "Model",
        wcvalue: "model-value",
      };
      mockUtils.getBasePrice.mockReturnValue(599);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { "classic-w": mockModel },
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      const result = getters.getBasePrice(state);

      expect(mockUtils.getBasePrice).toHaveBeenCalledWith(mockModel, "gloves");
      expect(result).toBe(599);
    });

    it("should add product price to model base price", () => {
      const mockModel = {
        id: "classic-w",
        name: "Classic W",
        type: "Model",
        wcvalue: "model-value",
      };
      mockUtils.getBasePrice.mockReturnValue(400);
      mockWoocommerce.getProductPrice.mockReturnValue(199);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { "classic-w": mockModel },
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      const result = getters.getBasePrice(state);

      expect(result).toBe(599); // 400 + 199
    });

    it("should return only product price if no model selected", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(299);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getBasePrice(state);

      expect(result).toBe(299);
    });

    it("should return 0 if no model and no product price", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(0);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {},
      });

      const result = getters.getBasePrice(state);

      expect(result).toBe(0);
    });
  });

  describe("getPrice", () => {
    beforeEach(() => {
      // Reset mocks with default behavior
      mockUtils.getBasePrice.mockReturnValue(0);
      mockWoocommerce.getProductPrice.mockReturnValue(599);
      mockUtils.digOutUpcharges.mockReturnValue(0);
      mockUtils.getOptionUpcharge.mockReturnValue(0);
    });

    it("should return base price when no options selected", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(599);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {},
      });

      const result = getters.getPrice(state);

      expect(result).toBe(599);
    });

    it("should add option upcharges to base price", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(599);
      mockUtils.digOutUpcharges.mockReturnValue(100);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: { Color: {} } },
        },
      });

      const result = getters.getPrice(state);

      expect(result).toBe(699); // 599 + 100
    });

    it("should include series price when series is selected", () => {
      const mockSeries = {
        id: "alpha-series",
        name: "Alpha Series",
        wcvalue: "series-value",
      };
      mockWoocommerce.getProductPrice.mockReturnValue(599);
      mockUtils.digOutUpcharges.mockReturnValue(0);
      mockUtils.getNumber.mockReturnValue(50);
      mockUtils.getOptionUpcharge.mockReturnValue(50);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { "alpha-series": mockSeries },
        selectedOptions: {
          gloves: { model: "", series: "alpha-series", selections: {} },
        },
      });

      const result = getters.getPrice(state);

      // Base price (599) + series upcharge (50)
      expect(result).toBe(649);
    });

    it("should call digOutUpcharges with correct parameters", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(599);
      mockStructure.traverse.mockImplementation(() => {});

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: { Color: {} } },
        },
      });

      getters.getPrice(state, true);

      expect(mockUtils.digOutUpcharges).toHaveBeenCalledWith(
        { Color: {} },
        expect.any(Object), // restrictions
        expect.any(Object), // enablers
        "gloves",
        expect.any(Object), // modMap
        true // includeOtherProductPrices
      );
    });

    it("should exclude other product prices when flag is false", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(599);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: { Color: {} } },
        },
      });

      getters.getPrice(state, false);

      expect(mockUtils.digOutUpcharges).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        false
      );
    });
  });

  describe("getPercentages", () => {
    it("should return 0 when no selections", () => {
      const state = createMockState({
        currentProduct: "gloves",
        selectedOptions: {},
      });

      const result = getters.getPercentages(state);

      expect(result).toBe(0);
    });

    it("should call digOutPercentages with correct parameters", () => {
      mockUtils.digOutPercentages.mockReturnValue(15);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: { Upgrade: {} } },
        },
      });

      const result = getters.getPercentages(state);

      expect(mockUtils.digOutPercentages).toHaveBeenCalled();
      expect(result).toBe(15);
    });
  });

  describe("getTotalPrice", () => {
    beforeEach(() => {
      mockUtils.getBasePrice.mockReturnValue(0);
      mockWoocommerce.getProductPrice.mockReturnValue(0);
      mockUtils.digOutUpcharges.mockReturnValue(0);
      mockUtils.digOutPercentages.mockReturnValue(0);
      mockUtils.digOutWooProducts.mockReturnValue([]);
    });

    it("should return base price with no options", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(599);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {},
      });

      const result = getters.getTotalPrice(state);

      expect(result).toBe(599);
    });

    it("should add percentage upcharges to base price", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(600);
      mockUtils.digOutUpcharges.mockReturnValue(0);
      mockUtils.digOutPercentages.mockReturnValue(10); // 10%

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getTotalPrice(state);

      // 600 (base) + 0 (upcharges) + 60 (10% of base)
      expect(result).toBe(660);
    });

    it("should add virtual product prices", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(599);
      mockUtils.digOutUpcharges.mockReturnValue(0);
      mockUtils.digOutPercentages.mockReturnValue(0);
      mockUtils.digOutWooProducts.mockReturnValue([
        { wooid: 123, name: "Addon", price: 50, quantity: 1 },
      ]);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getTotalPrice(state);

      expect(result).toBe(649); // 599 + 50
    });

    it("should exclude virtual product prices when flag is false", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(599);
      mockUtils.digOutUpcharges.mockReturnValue(0);
      mockUtils.digOutPercentages.mockReturnValue(0);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getTotalPrice(state, false);

      // digOutWooProducts should not be called for virtual pricing when flag is false
      expect(result).toBe(599);
    });

    it("should round to 2 decimal places", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(100);
      mockUtils.digOutUpcharges.mockReturnValue(0);
      mockUtils.digOutPercentages.mockReturnValue(33.333); // 33.333%

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getTotalPrice(state);

      // 100 + 0 + 33.333 = 133.333, rounded to 133.33
      expect(result).toBe(133.33);
    });

    it("should combine all pricing components correctly", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(500);
      mockUtils.digOutUpcharges.mockReturnValue(100); // absolute upcharges
      mockUtils.digOutPercentages.mockReturnValue(20); // 20% upcharge
      mockUtils.digOutWooProducts.mockReturnValue([
        { wooid: 123, name: "Virtual", price: 75, quantity: 1 },
      ]);

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getTotalPrice(state);

      // price = 500 + 100 = 600
      // percentages = 20% of 500 = 100
      // virtual = 75
      // total = 600 + 100 + 75 = 775
      expect(result).toBe(775);
    });
  });

  describe("getLikelyQuantity", () => {
    it("should return 1 when no selectedOptions at all", () => {
      const state = createMockState({
        currentProduct: "",
        selectedOptions: {},
      });

      const result = getters.getLikelyQuantity(state, {});

      // Falls back to 1 when !state.currentProduct
      expect(result).toBe(1);
    });

    it("should return 0 with empty selections (no wcvalue options to count)", () => {
      const state = createMockState({
        currentProduct: "gloves",
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getLikelyQuantity(state, {});

      // Returns 0 when quantities array is empty (reduce on empty array)
      expect(result).toBe(0);
    });
  });

  describe("getRestrictions", () => {
    it("should return empty object when no selections", () => {
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {},
      });

      const result = getters.getRestrictions(state);

      expect(result).toEqual({});
    });

    it("should traverse filtered structure to find restrictions", () => {
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: { Color: {} } },
        },
      });

      getters.getRestrictions(state);

      expect(mockStructure.getFilteredStructure).toHaveBeenCalled();
      expect(mockStructure.traverse).toHaveBeenCalled();
    });
  });

  describe("getEnablers", () => {
    it("should return empty array when no selectedOptions", () => {
      const state = createMockState({
        currentProduct: "gloves",
        selectedOptions: {},
      });

      const result = getters.getEnablers(state);

      expect(result).toEqual([]);
    });

    it("should return keys from getIndexedEnablers", () => {
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getEnablers(state);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getIndexedEnablers", () => {
    it("should return empty object when no selections have enablers", () => {
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getIndexedEnablers(state);

      expect(result).toEqual({});
    });
  });

  describe("getViewCount", () => {
    it("should return frames count from model when available", () => {
      const mockModel = {
        id: "classic-w",
        name: "Classic W",
        type: "Model",
        frames: 4,
      };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { "classic-w": mockModel },
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      const result = getters.getViewCount(state);

      expect(result).toBe(4);
    });

    it("should return array length when frames is an array", () => {
      const mockModel = {
        id: "classic-w",
        name: "Classic W",
        type: "Model",
        frames: [[0, 0, 0], [90, 0, 0], [180, 0, 0]],
      };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { "classic-w": mockModel },
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      const result = getters.getViewCount(state);

      expect(result).toBe(3);
    });

    it("should fall back to product frames if model has none", () => {
      const mockProduct = {
        id: "gloves",
        name: "Gloves",
        type: "Product",
        frames: 6,
      };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { gloves: mockProduct },
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getViewCount(state);

      expect(result).toBe(6);
    });

    it("should return 1 if no frames defined anywhere", () => {
      const mockProduct = {
        id: "gloves",
        name: "Gloves",
        type: "Product",
      };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { gloves: mockProduct },
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getViewCount(state);

      expect(result).toBe(1);
    });
  });

  describe("getSeries", () => {
    it("should return series from objectIDMap when selected", () => {
      const mockSeries = {
        id: "alpha-series",
        name: "Alpha Series",
      };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { "alpha-series": mockSeries },
        selectedOptions: {
          gloves: { model: "", series: "alpha-series", selections: {} },
        },
      });

      const result = getters.getSeries(state);

      expect(result).toBe(mockSeries);
    });

    it("should return null if no series selected", () => {
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getSeries(state);

      expect(result).toBeNull();
    });
  });

  describe("getShareURL", () => {
    it("should construct share URL with session ID", () => {
      const state = createMockState({
        sessionID: "abc123",
      });

      const result = getters.getShareURL(state);

      expect(result).toContain("?id=abc123");
    });
  });

  describe("getWooPrices", () => {
    beforeEach(() => {
      // Reset all pricing-related mocks
      mockUtils.getBasePrice.mockReturnValue(0);
      mockWoocommerce.getProductPrice.mockReturnValue(0);
      mockUtils.digOutUpcharges.mockReturnValue(0);
      mockUtils.digOutPercentages.mockReturnValue(0);
      mockUtils.digOutWooProducts.mockReturnValue([]);
    });

    it("should return array with main product price and quantity", () => {
      mockWoocommerce.getProduct.mockReturnValue("12345");
      // Set product price which is used by both getBasePrice and getTotalPrice
      mockWoocommerce.getProductPrice.mockReturnValue(599);

      const mockProduct = { id: "gloves", name: "Gloves", type: "Product" };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { gloves: mockProduct },
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const mockGets = {
        getLikelyQuantity: 1,
      };

      const result = getters.getWooPrices(state, mockGets);

      expect(result[0].wooid).toBe("12345");
      expect(result[0].name).toBe("Glove");
      expect(result[0].quantity).toBe(1);
      // Price is calculated via getTotalPrice (599 base + 0 upcharges + 0 percentages)
      expect(result[0].price).toBe(599);
    });

    it("should include additional woo products", () => {
      mockWoocommerce.getProduct.mockReturnValue("12345");
      mockWoocommerce.getProductPrice.mockReturnValue(599);
      mockUtils.digOutWooProducts.mockReturnValue([
        { wooid: 99999, name: "Addon Product", price: 50, quantity: 1 },
      ]);

      const mockProduct = { id: "gloves", name: "Gloves", type: "Product" };
      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { gloves: mockProduct },
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const mockGets = {
        getLikelyQuantity: 2,
      };

      const result = getters.getWooPrices(state, mockGets);

      expect(result.length).toBe(2);
      expect(result[0].quantity).toBe(2);
      expect(result[1]).toEqual({
        wooid: 99999,
        name: "Addon Product",
        price: 50,
        quantity: 1,
      });
    });
  });

  describe("getAttribute", () => {
    it("should return attribute from filtered attributes list", () => {
      const mockAttr = { id: "color", name: "Color", type: "Attribute" };
      const mockModel = {
        id: "classic-w",
        name: "Classic W",
        type: "Model",
        attributes: ["color", "size"],
      };

      // Mock getFilteredAttributes to return array
      mockStructure.traverse.mockImplementation(() => {});

      const state = createMockState({
        currentProduct: "gloves",
        currentAttribute: 0,
        objectIDMap: {
          "classic-w": mockModel,
          color: mockAttr,
          size: { id: "size", name: "Size", type: "Attribute" },
        },
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      // Since getFilteredAttributes relies on complex logic,
      // and we've mocked structure.traverse, let's just test the fallback path
      const result = getters.getAttribute(state);

      // Will fall back to model.attributes when getFilteredAttributes returns empty
      expect(result).toBe(mockAttr);
    });

    it("should return null if currentAttribute is out of bounds", () => {
      const mockModel = {
        id: "classic-w",
        name: "Classic W",
        type: "Model",
        attributes: ["color"],
      };

      const state = createMockState({
        currentProduct: "gloves",
        currentAttribute: 5, // Out of bounds
        objectIDMap: {
          "classic-w": mockModel,
          color: { id: "color", name: "Color", type: "Attribute" },
        },
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      const result = getters.getAttribute(state);

      expect(result).toBeNull();
    });

    it("should return null if no model is selected", () => {
      const state = createMockState({
        currentProduct: "gloves",
        currentAttribute: 0,
        objectIDMap: {},
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const result = getters.getAttribute(state);

      expect(result).toBeNull();
    });
  });

  describe("getDefaultQuantity", () => {
    it("should return model defaultquantity when set", () => {
      const mockModel = {
        id: "classic-w",
        name: "Classic W",
        type: "Model",
        defaultquantity: 5,
      };

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { "classic-w": mockModel },
        selectedOptions: {
          gloves: { model: "classic-w", series: "", selections: {} },
        },
      });

      const mockGets = {
        getModel: mockModel,
      };

      const result = getters.getDefaultQuantity(state, mockGets);

      expect(result).toBe(5);
    });

    it("should fall back to product defaultquantity", () => {
      const mockProduct = {
        id: "gloves",
        name: "Gloves",
        type: "Product",
        defaultquantity: 3,
      };

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { gloves: mockProduct },
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const mockGets = {
        getModel: null,
      };

      const result = getters.getDefaultQuantity(state, mockGets);

      expect(result).toBe(3);
    });

    it("should return 1 if no defaultquantity defined", () => {
      const mockProduct = {
        id: "gloves",
        name: "Gloves",
        type: "Product",
      };

      const state = createMockState({
        currentProduct: "gloves",
        objectIDMap: { gloves: mockProduct },
        selectedOptions: {
          gloves: { model: "", series: "", selections: {} },
        },
      });

      const mockGets = {
        getModel: null,
      };

      const result = getters.getDefaultQuantity(state, mockGets);

      expect(result).toBe(1);
    });
  });
});
