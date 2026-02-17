import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mock objects that can be used in vi.mock factories
const {
  mockStructure,
  mockStorage,
  mockShare,
  mockUtils,
  mockGetters,
  mockPimcos,
  mockThreedee,
  MockOptionCasing,
} = vi.hoisted(() => {
  class MockCasing {
    value: unknown = null;
    order: number = 0;
    required: boolean = true;
    userInteraction: boolean = false;
    noRequirement: boolean = false;
    branchID: string = "";
    defaultValue: string | null = null;
    allowedValues: Set<string> = new Set();
    woocommerceProduct: string | null = null;
    woocommerceName: string | null = null;
    "x-data": Record<string, unknown> | null = null;
    constructor(config: Record<string, unknown> = {}) {
      Object.assign(this, config);
    }
    next() {
      return null;
    }
    previous() {
      return null;
    }
    getMetaData() {
      return "";
    }
  }

  return {
    mockStructure: {
      getFilteredStructure: vi.fn((obj) => obj),
      traverse: vi.fn(),
      branch: vi.fn(() => null),
      build: vi.fn(() => ({})),
      getDefault: vi.fn(() => null),
    },
    mockStorage: {
      formatSelections: vi.fn((x) => x),
      saveSelections: vi.fn(),
      saveValue: vi.fn(),
    },
    mockShare: {
      updateSessionData: vi.fn(),
      setSelectionUpdated: vi.fn(),
    },
    mockUtils: {
      getNested: vi.fn(),
      setNested: vi.fn(() => true),
      generateHash: vi.fn(() => "Q12345"),
      unpackViewset: vi.fn((x) => [{ value: x, conditions: null }]),
      standardOptionFilter: vi.fn(() => true),
      parseMetaDataSync: vi.fn(() => ({ currentKey: -1, keys: [] })),
      urlFromImageKeySync: vi.fn(() => ""),
    },
    mockGetters: {
      getModel: vi.fn(() => ({ attributes: [] })),
      getFilteredAttributes: vi.fn(() => []),
      getViewOrder: vi.fn(() => null),
      getViewCount: vi.fn(() => 4),
      getViews: vi.fn(() => []),
      getRestrictions: vi.fn(() => ({})),
      getIndexedEnablers: vi.fn(() => ({})),
    },
    mockPimcos: {
      transformPimcoContribution: vi.fn(() => []),
    },
    mockThreedee: {
      getAngleIndicesSortedByClosest: vi.fn(() => [
        { index: 0, dot: 1 },
        { index: 1, dot: 0.9 },
        { index: 2, dot: 0.8 },
      ]),
    },
    MockOptionCasing: MockCasing,
  };
});

// Mock all dependencies
vi.mock("@/structure", () => ({
  default: mockStructure,
  OptionCasing: MockOptionCasing,
}));

vi.mock("@/storage", () => ({
  default: mockStorage,
}));

vi.mock("@/share", () => ({
  default: mockShare,
}));

vi.mock("@/utils", () => ({
  default: mockUtils,
}));

vi.mock("@/pimcos", () => ({
  default: mockPimcos,
}));

vi.mock("@/threedee", () => ({
  default: mockThreedee,
}));

vi.mock("./getters", () => ({
  default: mockGetters,
}));

vi.mock("./initialize", () => ({
  starters: { dev: false },
  mutationsContext: (mutations: Record<string, Function>) => {
    // Wrap each mutation to make it callable
    const wrapped: Record<string, Function> = {};
    for (const key in mutations) {
      wrapped[key] = mutations[key];
    }
    return wrapped;
  },
}));

// Import after mocking
import mutations, { saveData, evalApplicationConditions } from "./mutations";

describe("mutations", () => {
  // Helper to create a mock state
  function createMockState() {
    return {
      currentProduct: "product-1",
      currentAttribute: 0,
      configuratorMode: "custom",
      configuratorPage: "main",
      selectedOptions: {
        "product-1": {
          model: "model-1",
          series: null,
          selections: {},
          cloneMeta: null,
        },
      },
      objectIDMap: {
        "product-1": { id: "product-1", name: "Gloves", type: "Product" },
        "model-1": { id: "model-1", name: "Classic", type: "Model", attributes: [] },
        "attr-1": { id: "attr-1", name: "Color", type: "Attribute" },
        "opt-1": { id: "opt-1", name: "Red", type: "BasicOption" },
      },
      productImageContributions: {},
      informationOverlayPages: [],
      indexedPopups: new Set(),
      standardPopupInfo: null,
      specialPopupInfo: null,
      renderCompletionOverlay: false,
      renderCheckoutOverlay: false,
      showIncompleted: false,
      productView: 0,
      stageHijacker: null,
      stageHijackerPath: null,
      productImageDataURL: "",
      optionApplicationTracker: [],
      pimcoUpdater: false,
      agreedTerms: {},
      products: [],
      models: [],
      attributes: [],
      options: [],
      leathers: [],
      series: [],
      pimcos: [],
      leatherGuideInfo: null,
      tippedLeatherGuide: false,
      leatherGuideLeathers: [],
      sizeChangePopup: false,
      goClassicPopup: false,
      goEdgeXPopup: false,
      editorPimcoOption: null,
      studioPoses: [],
      studioLighting: null,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveData", () => {
    it("should format and save selections", () => {
      const selections = { product: { model: "test" } };
      saveData(selections, "custom", "product-1");

      expect(mockStorage.formatSelections).toHaveBeenCalledWith(selections);
      expect(mockStorage.saveSelections).toHaveBeenCalled();
      expect(mockShare.updateSessionData).toHaveBeenCalled();
    });
  });

  describe("forcePropertyUpdate", () => {
    it("should create new object reference for property", () => {
      const state = createMockState();
      const originalRef = state.selectedOptions;

      mutations.forcePropertyUpdate(state, "selectedOptions");

      expect(state.selectedOptions).not.toBe(originalRef);
      expect(state.selectedOptions).toEqual(originalRef);
    });
  });

  describe("addObjectIDs", () => {
    it("should add new objects to objectIDMap", () => {
      const state = createMockState();
      const newObjects = [
        { id: "new-1", name: "New Object 1", type: "Test" },
        { id: "new-2", name: "New Object 2", type: "Test" },
      ];

      mutations.addObjectIDs(state, newObjects as any);

      expect(state.objectIDMap["new-1"]).toBeDefined();
      expect(state.objectIDMap["new-2"]).toBeDefined();
    });

    it("should preserve existing objects", () => {
      const state = createMockState();
      const newObjects = [{ id: "new-1", name: "New", type: "Test" }];

      mutations.addObjectIDs(state, newObjects as any);

      expect(state.objectIDMap["product-1"]).toBeDefined();
      expect(state.objectIDMap["model-1"]).toBeDefined();
    });
  });

  describe("setStructure", () => {
    it("should set entire structure when no scope", () => {
      const state = createMockState();
      const newStructure = { newProduct: { model: null, selections: {} } };

      mutations.setStructure(state, { structure: newStructure });

      expect(state.selectedOptions).toBe(newStructure);
    });

    it("should set scoped structure and nullify previous selections", () => {
      const state = createMockState();
      const casing = new MockOptionCasing({ value: { id: "old-value" } });
      state.selectedOptions["product-1"].selections = { color: casing };

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(casing);
      });

      const newSelections = { color: new MockOptionCasing() };
      mutations.setStructure(state, {
        structure: newSelections,
        scope: "product-1",
      });

      expect(casing.value).toBeNull();
      expect(state.selectedOptions["product-1"].selections).toBe(newSelections);
    });
  });

  describe("setCurrentProduct", () => {
    it("should update current product and save to storage", () => {
      const state = createMockState();
      // Need to add the product to objectIDMap for title update
      state.objectIDMap["product-2"] = { id: "product-2", name: "Belts", type: "Product" } as any;

      mutations.setCurrentProduct(state, "product-2");

      expect(state.currentProduct).toBe("product-2");
      expect(mockStorage.saveValue).toHaveBeenCalledWith("product", "product-2");
    });
  });

  describe("setCurrentModel", () => {
    it("should update model for current product when string value", () => {
      const state = createMockState();

      mutations.setCurrentModel(state, "new-model");

      expect(state.selectedOptions["product-1"].model).toBe("new-model");
    });

    it("should update model for specific product when object value", () => {
      const state = createMockState();
      state.selectedOptions["product-2"] = { model: null, series: null, selections: {}, cloneMeta: null };

      mutations.setCurrentModel(state, { value: "specific-model", product: "product-2" });

      expect(state.selectedOptions["product-2"].model).toBe("specific-model");
    });
  });

  describe("setCurrentSeries", () => {
    it("should update series for current product", () => {
      const state = createMockState();

      mutations.setCurrentSeries(state, "new-series");

      expect(state.selectedOptions["product-1"].series).toBe("new-series");
    });
  });

  describe("setConfiguratorMode", () => {
    it("should update mode and save to storage", () => {
      const state = createMockState();

      mutations.setConfiguratorMode(state, "classic");

      expect(state.configuratorMode).toBe("classic");
      expect(mockStorage.saveValue).toHaveBeenCalledWith("mode", "classic");
    });
  });

  describe("setCurrentAttribute", () => {
    it("should update attribute index within bounds", () => {
      const state = createMockState();
      mockGetters.getModel.mockReturnValue({ attributes: ["a", "b", "c"] });
      mockGetters.getFilteredAttributes.mockReturnValue([{}, {}, {}]);

      mutations.setCurrentAttribute(state, 1);

      expect(state.currentAttribute).toBe(1);
    });

    it("should not update if index is out of bounds", () => {
      const state = createMockState();
      mockGetters.getModel.mockReturnValue({ attributes: ["a", "b"] });

      mutations.setCurrentAttribute(state, 10);

      expect(state.currentAttribute).toBe(0);
    });

    it("should set viewset from attribute if defined", () => {
      const state = createMockState();
      mockGetters.getModel.mockReturnValue({ attributes: ["a"] });
      mockGetters.getFilteredAttributes.mockReturnValue([{ viewset: 2 }]);

      mutations.setCurrentAttribute(state, 0);

      expect(state.productView).toBe(2);
    });
  });

  describe("incrementCurrentAttribute / decrementCurrentAttribute", () => {
    it("should increment attribute", () => {
      const state = createMockState();
      mockGetters.getModel.mockReturnValue({ attributes: ["a", "b", "c"] });
      mockGetters.getFilteredAttributes.mockReturnValue([{}, {}, {}]);

      mutations.incrementCurrentAttribute(state);

      expect(state.currentAttribute).toBe(1);
    });

    it("should decrement attribute", () => {
      const state = createMockState();
      state.currentAttribute = 2;
      mockGetters.getModel.mockReturnValue({ attributes: ["a", "b", "c"] });
      mockGetters.getFilteredAttributes.mockReturnValue([{}, {}, {}]);

      mutations.decrementCurrentAttribute(state);

      expect(state.currentAttribute).toBe(1);
    });
  });

  describe("setSelectedOptionGeneric", () => {
    it("should set value using branch", () => {
      const state = createMockState();
      const casing = new MockOptionCasing();
      mockStructure.branch.mockReturnValue(casing);

      mutations.setSelectedOptionGeneric(state, {
        branch: "brc123",
        value: { id: "opt-1", name: "Red" } as any,
      });

      expect(casing.value).toEqual({ id: "opt-1", name: "Red" });
    });

    it("should set value using path when branch not found", () => {
      const state = createMockState();
      const casing = new MockOptionCasing();
      mockStructure.branch.mockReturnValue(null);
      mockUtils.getNested.mockReturnValue(casing);

      mutations.setSelectedOptionGeneric(state, {
        path: ["product-1", "selections", "color"],
        value: { id: "opt-1", name: "Red" } as any,
      });

      expect(casing.value).toEqual({ id: "opt-1", name: "Red" });
    });

    it("should set default value when value is 'default'", () => {
      const state = createMockState();
      const casing = new MockOptionCasing({ defaultValue: "opt-1" });
      state.objectIDMap["opt-1"] = { id: "opt-1", name: "Default Option" } as any;
      mockStructure.branch.mockReturnValue(casing);

      mutations.setSelectedOptionGeneric(state, {
        branch: "brc123",
        value: "default",
      });

      expect(casing.value).toEqual({ id: "opt-1", name: "Default Option" });
    });

    it("should update userInteraction when provided", () => {
      const state = createMockState();
      const casing = new MockOptionCasing({ userInteraction: false });
      mockStructure.branch.mockReturnValue(casing);

      mutations.setSelectedOptionGeneric(state, {
        branch: "brc123",
        value: null,
        interaction: true,
      });

      expect(casing.userInteraction).toBe(true);
    });
  });

  describe("addProductImageContributer", () => {
    it("should add contributer to pimco list", () => {
      const state = createMockState();
      const contributer = { frames: [] } as any;

      mutations.addProductImageContributer(state, {
        pimco: "pimco-1",
        contributer,
      });

      expect(state.productImageContributions["pimco-1"]).toContain(contributer);
    });

    it("should create pimco list if not exists", () => {
      const state = createMockState();

      mutations.addProductImageContributer(state, {
        pimco: "new-pimco",
        contributer: { frames: [] } as any,
      });

      expect(state.productImageContributions["new-pimco"]).toBeDefined();
    });

    it("should not add duplicate contributers", () => {
      const state = createMockState();
      const contributer = { frames: [] } as any;
      state.productImageContributions["pimco-1"] = [contributer];

      mutations.addProductImageContributer(state, {
        pimco: "pimco-1",
        contributer,
      });

      expect(state.productImageContributions["pimco-1"].length).toBe(1);
    });
  });

  describe("removeProductImageContributer", () => {
    it("should remove contributers from lists", () => {
      const state = createMockState();
      const contributer1 = { id: "c1" } as any;
      const contributer2 = { id: "c2" } as any;
      state.productImageContributions["pimco-1"] = [contributer1, contributer2];

      mutations.removeProductImageContributer(state, [contributer1]);

      expect(state.productImageContributions["pimco-1"]).not.toContain(contributer1);
      expect(state.productImageContributions["pimco-1"]).toContain(contributer2);
    });

    it("should delete pimco key when list becomes empty", () => {
      const state = createMockState();
      const contributer = { id: "c1" } as any;
      state.productImageContributions["pimco-1"] = [contributer];

      mutations.removeProductImageContributer(state, [contributer]);

      expect(state.productImageContributions["pimco-1"]).toBeUndefined();
    });
  });

  describe("clearProductImageContributers", () => {
    it("should clear all contributions", () => {
      const state = createMockState();
      state.productImageContributions = {
        "pimco-1": [{}] as any,
        "pimco-2": [{}] as any,
      };

      mutations.clearProductImageContributers(state);

      expect(state.productImageContributions).toEqual({});
    });
  });

  describe("setProductView", () => {
    it("should set numeric view with wrapping", () => {
      const state = createMockState();
      mockGetters.getViewCount.mockReturnValue(4);

      mutations.setProductView(state, 5);

      expect(state.productView).toBe(1); // 5 % 4 = 1
    });

    it("should handle negative values with wrapping", () => {
      const state = createMockState();
      mockGetters.getViewCount.mockReturnValue(4);

      mutations.setProductView(state, -1);

      expect(state.productView).toBe(3); // (-1 + 4) % 4 = 3
    });

    it("should set array view directly", () => {
      const state = createMockState();

      mutations.setProductView(state, [0.5, 1.0, 0.25] as any);

      expect(state.productView).toEqual([0.5, 1.0, 0.25]);
    });

    it("should convert radians to degrees for unit view", () => {
      const state = createMockState();

      mutations.setProductView(state, {
        unit: "radians",
        view: [Math.PI, Math.PI / 2, 0],
      } as any);

      expect(state.productView).toEqual([180, 90, 0]);
    });
  });

  describe("addInformationPage", () => {
    it("should add page to overlay pages", () => {
      const state = createMockState();
      const page = { id: "page-1", component: "TestPage" };

      mutations.addInformationPage(state, page as any);

      expect(state.informationOverlayPages).toContain(page);
    });

    it("should skip indexed page if already shown", () => {
      const state = createMockState();
      state.indexedPopups.add("popup-1");
      const page = { id: "page-1", index: "popup-1", component: "TestPage" };

      mutations.addInformationPage(state, page as any);

      expect(state.informationOverlayPages.length).toBe(0);
    });

    it("should pop previous page if same id", () => {
      const state = createMockState();
      state.informationOverlayPages = [
        { id: "other" } as any,
        { id: "page-1" } as any,
        { id: "current" } as any,
      ];
      const page = { id: "page-1", component: "TestPage" };

      mutations.addInformationPage(state, page as any);

      // Should pop "current" because "page-1" is the previous page
      expect(state.informationOverlayPages.length).toBe(2);
    });
  });

  describe("removeInformationPage", () => {
    it("should pop last page when no argument", () => {
      const state = createMockState();
      state.informationOverlayPages = [{ id: "1" }, { id: "2" }] as any;

      mutations.removeInformationPage(state);

      expect(state.informationOverlayPages.length).toBe(1);
      expect(state.informationOverlayPages[0].id).toBe("1");
    });

    it("should clear all pages when 'all' passed", () => {
      const state = createMockState();
      state.informationOverlayPages = [{ id: "1" }, { id: "2" }] as any;

      mutations.removeInformationPage(state, "all");

      expect(state.informationOverlayPages.length).toBe(0);
    });

    it("should remove specific page by id string", () => {
      const state = createMockState();
      state.informationOverlayPages = [{ id: "1" }, { id: "2" }, { id: "3" }] as any;

      mutations.removeInformationPage(state, "2");

      expect(state.informationOverlayPages.length).toBe(2);
      expect(state.informationOverlayPages.find((p: any) => p.id === "2")).toBeUndefined();
    });
  });

  describe("setStandardPopup", () => {
    it("should set popup info when no current popup", async () => {
      vi.useFakeTimers();
      const state = createMockState();
      const popup = { id: "popup-1", title: "Test" };

      mutations.setStandardPopup(state, popup as any);
      await vi.runAllTimersAsync();

      expect(state.standardPopupInfo).toEqual(popup);
      vi.useRealTimers();
    });

    it("should not replace existing popup", async () => {
      vi.useFakeTimers();
      const state = createMockState();
      state.standardPopupInfo = { id: "existing" } as any;
      const popup = { id: "new-popup", title: "New" };

      mutations.setStandardPopup(state, popup as any);
      await vi.runAllTimersAsync();

      expect(state.standardPopupInfo).toEqual({ id: "existing" });
      vi.useRealTimers();
    });

    it("should skip indexed popup if already shown", async () => {
      vi.useFakeTimers();
      const state = createMockState();
      state.indexedPopups.add("index-1");
      const popup = { id: "popup-1", index: "index-1", title: "Test" };

      mutations.setStandardPopup(state, popup as any);
      await vi.runAllTimersAsync();

      expect(state.standardPopupInfo).toBeNull();
      vi.useRealTimers();
    });
  });

  describe("removeStandardPopup", () => {
    it("should clear popup info", () => {
      const state = createMockState();
      state.standardPopupInfo = { id: "test" } as any;

      mutations.removeStandardPopup(state);

      expect(state.standardPopupInfo).toBeNull();
    });
  });

  describe("productsSet / modelsSet / attributesSet / optionsSet", () => {
    it("should append products to existing list", () => {
      const state = createMockState();
      state.products = [{ id: "p1" }] as any;

      mutations.productsSet(state, [{ id: "p2" }] as any);

      expect(state.products.length).toBe(2);
    });

    it("should deduplicate models by id", () => {
      const state = createMockState();
      state.models = [{ id: "m1", name: "Model 1" }] as any;

      mutations.modelsSet(state, [
        { id: "m1", name: "Model 1 Updated" },
        { id: "m2", name: "Model 2" },
      ] as any);

      expect(state.models.length).toBe(2);
    });

    it("should append attributes", () => {
      const state = createMockState();
      state.attributes = [{ id: "a1" }] as any;

      mutations.attributesSet(state, [{ id: "a2" }] as any);

      expect(state.attributes.length).toBe(2);
    });

    it("should append options", () => {
      const state = createMockState();
      state.options = [{ id: "o1" }] as any;

      mutations.optionsSet(state, [{ id: "o2" }] as any);

      expect(state.options.length).toBe(2);
    });
  });

  describe("setTermsAgreement", () => {
    it("should set agreement for specific term", () => {
      const state = createMockState();

      mutations.setTermsAgreement(state, { id: "terms-1", value: true });

      expect(state.agreedTerms["terms-1"]).toBe(true);
    });
  });

  describe("buildTermsTracker", () => {
    it("should initialize terms for all products as false", () => {
      const state = createMockState();
      const products = [{ id: "p1" }, { id: "p2" }];

      mutations.buildTermsTracker(state, products as any);

      expect(state.agreedTerms["p1"]).toBe(false);
      expect(state.agreedTerms["p2"]).toBe(false);
    });
  });

  describe("setCompletionOverlayRender", () => {
    it("should set overlay render state", () => {
      const state = createMockState();

      mutations.setCompletionOverlayRender(state, true);

      expect(state.renderCompletionOverlay).toBe(true);
    });

    it("should hide incompletion when turning off overlay", () => {
      const state = createMockState();
      state.showIncompleted = true;

      mutations.setCompletionOverlayRender(state, false);

      expect(state.showIncompleted).toBe(false);
    });
  });

  describe("toggleCompletionOverlayRender", () => {
    it("should toggle overlay state", () => {
      const state = createMockState();
      state.renderCompletionOverlay = false;

      mutations.toggleCompletionOverlayRender(state);

      expect(state.renderCompletionOverlay).toBe(true);

      mutations.toggleCompletionOverlayRender(state);

      expect(state.renderCompletionOverlay).toBe(false);
    });
  });

  describe("addStudioPose / removeStudioPose", () => {
    it("should add pose", () => {
      const state = createMockState();
      const pose = { name: "Front", euler: [0, 0, 0] as [number, number, number] };

      mutations.addStudioPose(state, pose);

      expect(state.studioPoses).toContain(pose);
    });

    it("should remove pose by index", () => {
      const state = createMockState();
      state.studioPoses = [
        { name: "A", euler: [0, 0, 0] },
        { name: "B", euler: [1, 0, 0] },
      ] as any;

      mutations.removeStudioPose(state, 0);

      expect(state.studioPoses.length).toBe(1);
      expect(state.studioPoses[0].name).toBe("B");
    });
  });

  describe("setCloneMetaValue", () => {
    it("should update clone meta at specified index", () => {
      const state = createMockState();
      state.selectedOptions["product-1"].cloneMeta = {
        "clone-1": [[{ key: "field-1", value: "old", ref: false }]],
      };

      mutations.setCloneMetaValue(state, {
        meta: { key: "field-1", value: "new", ref: true },
        cloneKey: "clone-1",
        index: 0,
      });

      expect(state.selectedOptions["product-1"].cloneMeta!["clone-1"][0][0].value).toBe("new");
    });
  });

  describe("evalApplicationConditions", () => {
    it("should return true for empty conditions", () => {
      const state = createMockState();

      const result = evalApplicationConditions([], state);

      expect(result).toBe(true);
    });

    it("should evaluate VALUE IS condition", () => {
      const state = createMockState();
      const branch = new MockOptionCasing({ value: { id: "opt-1" } });
      mockStructure.branch.mockReturnValue(branch);
      state.objectIDMap["opt-1"] = { id: "opt-1", name: "Test" } as any;

      const result = evalApplicationConditions(
        { branch: "brc123", value: "opt-1", comparison: "VALUE IS" } as any,
        state
      );

      expect(result).toBe(true);
    });

    it("should evaluate VALUE IS NOT condition", () => {
      const state = createMockState();
      const branch = new MockOptionCasing({ value: { id: "opt-1" } });
      mockStructure.branch.mockReturnValue(branch);
      state.objectIDMap["opt-2"] = { id: "opt-2", name: "Other" } as any;

      const result = evalApplicationConditions(
        { branch: "brc123", value: "opt-2", comparison: "VALUE IS NOT" } as any,
        state
      );

      expect(result).toBe(true);
    });

    it("should evaluate VALUE IN condition", () => {
      const state = createMockState();
      const branch = new MockOptionCasing({ value: { id: "opt-1" } });
      mockStructure.branch.mockReturnValue(branch);
      state.objectIDMap["opt-1"] = { id: "opt-1", name: "Test" } as any;
      state.objectIDMap["opt-2"] = { id: "opt-2", name: "Other" } as any;

      const result = evalApplicationConditions(
        { branch: "brc123", value: ["opt-1", "opt-2"], comparison: "VALUE IN" } as any,
        state
      );

      expect(result).toBe(true);
    });

    it("should evaluate VALUE NOT IN condition", () => {
      const state = createMockState();
      const branch = new MockOptionCasing({ value: { id: "opt-3" } });
      mockStructure.branch.mockReturnValue(branch);
      state.objectIDMap["opt-1"] = { id: "opt-1", name: "Test" } as any;
      state.objectIDMap["opt-2"] = { id: "opt-2", name: "Other" } as any;

      const result = evalApplicationConditions(
        { branch: "brc123", value: ["opt-1", "opt-2"], comparison: "VALUE NOT IN" } as any,
        state
      );

      expect(result).toBe(true);
    });

    it("should return false when branch not found", () => {
      const state = createMockState();
      mockStructure.branch.mockReturnValue(null);

      const result = evalApplicationConditions(
        { branch: "brc123", value: "opt-1", comparison: "VALUE IS" } as any,
        state
      );

      expect(result).toBe(false);
    });
  });

  describe("setSelectedOption", () => {
    it("should set option for current product attribute", () => {
      const state = createMockState();
      const casing = new MockOptionCasing();
      mockUtils.getNested.mockReturnValue(casing);
      mockStructure.branch.mockReturnValue(null);

      mutations.setSelectedOption(state, {
        attribute: "color",
        value: { id: "opt-red", name: "Red" } as any,
      });

      expect(casing.value).toEqual({ id: "opt-red", name: "Red" });
      expect(casing.userInteraction).toBe(true);
    });

    it("should set option for specific product", () => {
      const state = createMockState();
      const casing = new MockOptionCasing();
      mockUtils.getNested.mockReturnValue(casing);
      mockStructure.branch.mockReturnValue(null);

      mutations.setSelectedOption(state, {
        product: "product-2",
        attribute: "size",
        value: { id: "opt-large", name: "Large" } as any,
      });

      expect(casing.value).toEqual({ id: "opt-large", name: "Large" });
    });
  });

  describe("setSelectedParallelOption", () => {
    it("should set parallel option with section path", () => {
      const state = createMockState();
      const casing = new MockOptionCasing();
      mockUtils.getNested.mockReturnValue(casing);
      mockStructure.branch.mockReturnValue(null);

      mutations.setSelectedParallelOption(state, {
        attribute: "leather",
        section: "region",
        value: { id: "opt-palm", name: "Palm" } as any,
      });

      expect(casing.value).toEqual({ id: "opt-palm", name: "Palm" });
      expect(casing.userInteraction).toBe(true);
    });
  });

  describe("setSelectedNestedOption", () => {
    it("should set nested option with full path", () => {
      const state = createMockState();
      const casing = new MockOptionCasing();
      mockUtils.getNested.mockReturnValue(casing);
      mockStructure.branch.mockReturnValue(null);

      mutations.setSelectedNestedOption(state, {
        attribute: "customization",
        subattribute: "engraving",
        section: "text",
        value: { id: "opt-name", name: "Name" } as any,
      });

      expect(casing.value).toEqual({ id: "opt-name", name: "Name" });
    });
  });

  describe("setSelectedNestedAddonOption", () => {
    it("should set nested addon option with full path", () => {
      const state = createMockState();
      const casing = new MockOptionCasing();
      mockUtils.getNested.mockReturnValue(casing);
      mockStructure.branch.mockReturnValue(null);

      mutations.setSelectedNestedAddonOption(state, {
        attribute: "customization",
        subattribute: "logos",
        addonattribute: "logo-1",
        section: "position",
        value: { id: "opt-center", name: "Center" } as any,
      });

      expect(casing.value).toEqual({ id: "opt-center", name: "Center" });
    });
  });

  describe("setOptionInteraction", () => {
    it("should set interaction flag to true by default", () => {
      const state = createMockState();

      mutations.setOptionInteraction(state, {
        attribute: "color",
      });

      expect(mockUtils.setNested).toHaveBeenCalledWith(
        state.selectedOptions,
        true,
        ["product-1", "selections", "color", "userInteraction"]
      );
    });

    it("should set interaction flag to specified value", () => {
      const state = createMockState();

      mutations.setOptionInteraction(state, {
        attribute: "color",
        value: false,
      });

      expect(mockUtils.setNested).toHaveBeenCalledWith(
        state.selectedOptions,
        false,
        ["product-1", "selections", "color", "userInteraction"]
      );
    });
  });

  describe("setNestedOptionInteraction", () => {
    it("should set nested interaction flag", () => {
      const state = createMockState();

      mutations.setNestedOptionInteraction(state, {
        attribute: "customization",
        subattribute: "engraving",
        section: "text",
        value: true,
      });

      expect(mockUtils.setNested).toHaveBeenCalledWith(
        state.selectedOptions,
        true,
        ["product-1", "selections", "customization", "engraving", "text", "userInteraction"]
      );
    });
  });

  describe("setNestedAddonOptionInteraction", () => {
    it("should set nested addon interaction flag", () => {
      const state = createMockState();

      mutations.setNestedAddonOptionInteraction(state, {
        attribute: "customization",
        subattribute: "logos",
        addonattribute: "logo-1",
        section: "position",
      });

      expect(mockUtils.setNested).toHaveBeenCalledWith(
        state.selectedOptions,
        true,
        ["product-1", "selections", "customization", "logos", "logo-1", "position", "userInteraction"]
      );
    });
  });

  describe("setCheckoutOverlayRender", () => {
    it("should set checkout overlay state", () => {
      const state = createMockState();

      mutations.setCheckoutOverlayRender(state, true);

      expect(state.renderCheckoutOverlay).toBe(true);
    });
  });

  describe("toggleCheckoutOverlayRender", () => {
    it("should toggle checkout overlay state", () => {
      const state = createMockState();
      state.renderCheckoutOverlay = false;

      mutations.toggleCheckoutOverlayRender(state);
      expect(state.renderCheckoutOverlay).toBe(true);

      mutations.toggleCheckoutOverlayRender(state);
      expect(state.renderCheckoutOverlay).toBe(false);
    });
  });

  describe("setIncompletionShow", () => {
    it("should set incompletion show state", () => {
      const state = createMockState();

      mutations.setIncompletionShow(state, true);

      expect(state.showIncompleted).toBe(true);
    });
  });

  describe("clearIndexedPopups", () => {
    it("should clear indexed popups and standard popup", () => {
      const state = createMockState();
      state.indexedPopups.add("popup-1");
      state.indexedPopups.add("popup-2");
      state.standardPopupInfo = { id: "current" } as any;

      mutations.clearIndexedPopups(state);

      expect(state.indexedPopups.size).toBe(0);
      expect(state.standardPopupInfo).toBeNull();
    });
  });

  describe("setSpecialPopup", () => {
    it("should set special popup from object", () => {
      const state = createMockState();
      const popup = { id: "special-1", component: "SpecialComponent" };

      mutations.setSpecialPopup(state, popup as any);

      expect(state.specialPopupInfo).toEqual(popup);
    });

    it("should set special popup from string key in window data", () => {
      const state = createMockState();
      const popupData = { id: "from-window", component: "WindowComponent" };
      (window as any).specPopupData = { "my-popup": popupData };

      mutations.setSpecialPopup(state, "my-popup");

      expect(state.specialPopupInfo).toEqual(popupData);
      delete (window as any).specPopupData;
    });
  });

  describe("removeSpecialPopup", () => {
    it("should clear special popup", () => {
      const state = createMockState();
      state.specialPopupInfo = { id: "special" } as any;

      mutations.removeSpecialPopup(state);

      expect(state.specialPopupInfo).toBeNull();
    });
  });

  describe("setSizeEditPopup / setGoClassicPopup / setGoEdgeXPopup", () => {
    it("should set size edit popup state", () => {
      const state = createMockState();

      mutations.setSizeEditPopup(state, true);
      expect(state.sizeChangePopup).toBe(true);

      mutations.setSizeEditPopup(state, false);
      expect(state.sizeChangePopup).toBe(false);
    });

    it("should set go classic popup state", () => {
      const state = createMockState();

      mutations.setGoClassicPopup(state, true);
      expect(state.goClassicPopup).toBe(true);
    });

    it("should set go edge x popup state", () => {
      const state = createMockState();

      mutations.setGoEdgeXPopup(state, true);
      expect(state.goEdgeXPopup).toBe(true);
    });
  });

  describe("setEditorPimcoOption", () => {
    it("should set editor pimco option", () => {
      const state = createMockState();
      const option = { id: "opt-1", name: "Option" };

      mutations.setEditorPimcoOption(state, option as any);

      expect(state.editorPimcoOption).toEqual(option);
    });

    it("should clear editor pimco option", () => {
      const state = createMockState();
      state.editorPimcoOption = { id: "old" } as any;

      mutations.setEditorPimcoOption(state, null);

      expect(state.editorPimcoOption).toBeNull();
    });
  });

  describe("incrementProductView / decrementProductView", () => {
    it("should increment index-based view", () => {
      const state = createMockState();
      state.productView = 1;
      mockGetters.getViews.mockReturnValue([]);
      mockGetters.getViewCount.mockReturnValue(4);

      mutations.incrementProductView(state);

      expect(state.productView).toBe(2);
    });

    it("should decrement index-based view", () => {
      const state = createMockState();
      state.productView = 2;
      mockGetters.getViews.mockReturnValue([]);
      mockGetters.getViewCount.mockReturnValue(4);

      mutations.decrementProductView(state);

      expect(state.productView).toBe(1);
    });

    it("should handle 3D views with angle-based navigation", () => {
      const state = createMockState();
      const views = [[0, 0, 0], [Math.PI / 2, 0, 0], [Math.PI, 0, 0]];
      mockGetters.getViews.mockReturnValue(views);
      mockThreedee.getAngleIndicesSortedByClosest.mockReturnValue([
        { index: 0, dot: 1 },
        { index: 2, dot: 0.9 },
        { index: 1, dot: 0.8 },
      ]);

      mutations.incrementProductView(state);

      // Should set view based on angle calculations
      expect(state.productView).toBeDefined();
    });
  });

  describe("setStageHijacker / setStageHijackerPath", () => {
    it("should set stage hijacker", () => {
      const state = createMockState();
      const hijacker = { component: "CustomStage" };

      mutations.setStageHijacker(state, hijacker as any);

      expect(state.stageHijacker).toEqual(hijacker);
    });

    it("should clear stage hijacker", () => {
      const state = createMockState();
      state.stageHijacker = { component: "Old" } as any;

      mutations.setStageHijacker(state, null);

      expect(state.stageHijacker).toBeNull();
    });

    it("should set stage hijacker path", () => {
      const state = createMockState();
      const path = ["product-1", "selections", "color"];

      mutations.setStageHijackerPath(state, path);

      expect(state.stageHijackerPath).toEqual(path);
    });
  });

  describe("setProductImageDataURL", () => {
    it("should set product image data URL", () => {
      const state = createMockState();
      const url = "data:image/png;base64,test123";

      mutations.setProductImageDataURL(state, url);

      expect(state.productImageDataURL).toBe(url);
    });
  });

  describe("forceUpdateOrderedPimcos", () => {
    it("should toggle pimco updater flag", () => {
      const state = createMockState();
      state.pimcoUpdater = false;

      mutations.forceUpdateOrderedPimcos(state);
      expect(state.pimcoUpdater).toBe(true);

      mutations.forceUpdateOrderedPimcos(state);
      expect(state.pimcoUpdater).toBe(false);
    });
  });

  describe("leathersSet / seriesSet / pimcosSet", () => {
    it("should append leathers", () => {
      const state = createMockState();
      state.leathers = [{ id: "l1" }] as any;

      mutations.leathersSet(state, [{ id: "l2" }] as any);

      expect(state.leathers.length).toBe(2);
    });

    it("should append series", () => {
      const state = createMockState();
      state.series = [{ id: "s1" }] as any;

      mutations.seriesSet(state, [{ id: "s2" }] as any);

      expect(state.series.length).toBe(2);
    });

    it("should append pimcos", () => {
      const state = createMockState();
      state.pimcos = [{ id: "p1" }] as any;

      mutations.pimcosSet(state, [{ id: "p2" }] as any);

      expect(state.pimcos.length).toBe(2);
    });
  });

  describe("miscSet", () => {
    it("should set misc data to state properties", () => {
      const state = createMockState();

      mutations.miscSet(state, {
        configuratorPage: "checkout",
        currentAttribute: 5,
      });

      expect(state.configuratorPage).toBe("checkout");
      expect(state.currentAttribute).toBe(5);
    });

    it("should warn for unknown keys", () => {
      const state = createMockState();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mutations.miscSet(state, { unknownProperty: "value" });

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("addCloneMetaGroup", () => {
    it("should create cloneMeta if not exists and add group", () => {
      const state = createMockState();
      const schema = [
        { wcname: "field-1", type: "text", source: "value" },
      ];
      mockStructure.branch.mockReturnValue({
        defaultValue: "opt-default",
      });
      state.objectIDMap["opt-default"] = { id: "opt-default", default: "Default Text" } as any;

      mutations.addCloneMetaGroup(state, {
        schema: schema as any,
        cloneKey: "clone-key",
      });

      expect(state.selectedOptions["product-1"].cloneMeta).toBeDefined();
      expect(state.selectedOptions["product-1"].cloneMeta!["clone-key"]).toBeDefined();
      expect(state.selectedOptions["product-1"].cloneMeta!["clone-key"].length).toBe(1);
    });

    it("should add to existing clone meta group", () => {
      const state = createMockState();
      state.selectedOptions["product-1"].cloneMeta = {
        "clone-key": [[{ key: "existing", value: "val", ref: false }]],
      };
      const schema = [{ wcname: "field-1", type: "select", source: "meta" }];
      mockStructure.branch.mockReturnValue({ defaultValue: "opt-1" });

      mutations.addCloneMetaGroup(state, {
        schema: schema as any,
        cloneKey: "clone-key",
      });

      expect(state.selectedOptions["product-1"].cloneMeta!["clone-key"].length).toBe(2);
    });
  });

  describe("removeCloneMetaGroup", () => {
    it("should remove clone meta group at index", () => {
      const state = createMockState();
      state.selectedOptions["product-1"].cloneMeta = {
        "clone-key": [
          [{ key: "a", value: "1", ref: false }],
          [{ key: "b", value: "2", ref: false }],
        ],
      };

      mutations.removeCloneMetaGroup(state, {
        cloneKey: "clone-key",
        index: 0,
      });

      expect(state.selectedOptions["product-1"].cloneMeta!["clone-key"].length).toBe(1);
      expect(state.selectedOptions["product-1"].cloneMeta!["clone-key"][0][0].key).toBe("b");
    });
  });

  describe("setLeatherGuideTippedStatus", () => {
    it("should set tipped status and save to storage", () => {
      const state = createMockState();
      state.tippedLeatherGuide = false;

      mutations.setLeatherGuideTippedStatus(state, true);

      expect(state.tippedLeatherGuide).toBe(true);
      expect(mockStorage.saveValue).toHaveBeenCalledWith("tippedLeatherGuide", true);
    });

    it("should not save if status unchanged", () => {
      const state = createMockState();
      state.tippedLeatherGuide = true;

      mutations.setLeatherGuideTippedStatus(state, true);

      expect(mockStorage.saveValue).not.toHaveBeenCalled();
    });
  });

  describe("setLeatherGuideLeathers", () => {
    it("should set leather guide leathers", () => {
      const state = createMockState();
      const leathers = [{ leather: "l1", bucket: "b1" }];

      mutations.setLeatherGuideLeathers(state, leathers);

      expect(state.leatherGuideLeathers).toEqual(leathers);
    });

    it("should clear leathers when undefined passed", () => {
      const state = createMockState();
      state.leatherGuideLeathers = [{ leather: "l1", bucket: "b1" }] as any;

      mutations.setLeatherGuideLeathers(state, undefined);

      expect(state.leatherGuideLeathers).toEqual([]);
    });
  });

  describe("addStudioLight / removeStudioLight / updateStudioLightParameter", () => {
    it("should add studio light", () => {
      const state = createMockState();
      state.studioLighting = [];
      const light = { name: "Key Light", type: "directional" };

      mutations.addStudioLight(state, light as any);

      expect(state.studioLighting).toContainEqual(light);
    });

    it("should create lighting array if not exists", () => {
      const state = createMockState();
      state.studioLighting = null;
      const light = { name: "Key Light", type: "directional" };

      mutations.addStudioLight(state, light as any);

      expect(state.studioLighting).toBeDefined();
      expect(state.studioLighting!.length).toBe(1);
    });

    it("should remove studio light by index", () => {
      const state = createMockState();
      state.studioLighting = [
        { name: "Light A" },
        { name: "Light B" },
      ] as any;

      mutations.removeStudioLight(state, 0);

      expect(state.studioLighting!.length).toBe(1);
      expect(state.studioLighting![0].name).toBe("Light B");
    });

    it("should update studio light parameter", () => {
      const state = createMockState();
      state.studioLighting = [
        { name: "Light A", intensity: 1.0 },
      ] as any;

      mutations.updateStudioLightParameter(state, {
        index: 0,
        path: ["intensity"],
        value: 0.5,
      });

      expect(mockUtils.setNested).toHaveBeenCalled();
    });

    it("should not update light if studioLighting is null", () => {
      const state = createMockState();
      state.studioLighting = null;

      mutations.updateStudioLightParameter(state, {
        index: 0,
        path: ["intensity"],
        value: 0.5,
      });

      expect(mockUtils.setNested).not.toHaveBeenCalled();
    });
  });

  describe("manageSelectionData", () => {
    it("should force update selected options", () => {
      const state = createMockState();
      const originalRef = state.selectedOptions;
      const branch = new MockOptionCasing();

      mutations.manageSelectionData(state, {
        value: { id: "opt-1" } as any,
        oldValue: null as any,
        contributions: [],
        releaseSetter: () => {},
        branch: branch as any,
      });

      expect(state.selectedOptions).not.toBe(originalRef);
    });

    it("should set selection updated flag", () => {
      const state = createMockState();
      const branch = new MockOptionCasing();

      mutations.manageSelectionData(state, {
        value: { id: "opt-1" } as any,
        oldValue: null as any,
        contributions: [],
        releaseSetter: () => {},
        branch: branch as any,
      });

      expect(mockShare.setSelectionUpdated).toHaveBeenCalledWith(true);
    });

    it("should handle viewset from option value", () => {
      const state = createMockState();
      const branch = new MockOptionCasing();

      mutations.manageSelectionData(state, {
        value: { id: "opt-1", viewset: 2 } as any,
        oldValue: null as any,
        contributions: [],
        releaseSetter: () => {},
        branch: branch as any,
      });

      expect(state.productView).toBe(2);
    });
  });

  describe("addLeatherGuidePage", () => {
    it("should add leather guide page when info exists", () => {
      const state = createMockState();
      state.leatherGuideInfo = { title: "Leather Guide" } as any;

      mutations.addLeatherGuidePage(state);

      expect(state.informationOverlayPages.length).toBe(1);
      expect(state.informationOverlayPages[0].component).toBe("LeatherGuidePage");
    });

    it("should not add page when leatherGuideInfo is null", () => {
      const state = createMockState();
      state.leatherGuideInfo = null;

      mutations.addLeatherGuidePage(state);

      expect(state.informationOverlayPages.length).toBe(0);
    });

    it("should set tipped status when first shown", () => {
      const state = createMockState();
      state.leatherGuideInfo = { title: "Leather Guide" } as any;
      state.tippedLeatherGuide = false;

      mutations.addLeatherGuidePage(state);

      expect(state.tippedLeatherGuide).toBe(true);
      expect(mockStorage.saveValue).toHaveBeenCalledWith("tippedLeatherGuide", true);
    });

    it("should extract leathers from buckets", () => {
      const state = createMockState();
      state.leatherGuideInfo = { title: "Leather Guide" } as any;
      state.objectIDMap["bucket-1"] = {
        id: "bucket-1",
        suboptions: { options: ["leather-a", "leather-b"] },
      } as any;

      mutations.addLeatherGuidePage(state, { buckets: ["bucket-1"] });

      const page = state.informationOverlayPages[0] as any;
      expect(page.leathers).toContain("leather-a");
      expect(page.leathers).toContain("leather-b");
    });
  });

  describe("addLeatherDetailsPage", () => {
    it("should add leather details page from ID", () => {
      const state = createMockState();
      state.objectIDMap["leather-info-1"] = {
        id: "leather-info-1",
        name: "Premium Leather",
      } as any;

      mutations.addLeatherDetailsPage(state, "leather-info-1");

      expect(state.informationOverlayPages.length).toBe(1);
      expect(state.informationOverlayPages[0].component).toBe("LeatherDetailsPage");
    });

    it("should add leather details page from object", () => {
      const state = createMockState();
      const leatherInfo = { id: "li-1", name: "Kangaroo" };

      mutations.addLeatherDetailsPage(state, leatherInfo as any);

      expect(state.informationOverlayPages.length).toBe(1);
    });
  });

  describe("addLeatherComparePage", () => {
    it("should add leather compare page with sorted id", () => {
      const state = createMockState();
      const leathers = [
        { id: "leather-b" },
        { id: "leather-a" },
      ];

      mutations.addLeatherComparePage(state, leathers as any);

      expect(state.informationOverlayPages.length).toBe(1);
      expect(state.informationOverlayPages[0].id).toBe("leather-a-leather-b");
      expect(state.informationOverlayPages[0].component).toBe("LeatherComparePage");
    });

    it("should handle string leather IDs", () => {
      const state = createMockState();

      mutations.addLeatherComparePage(state, ["leather-a", "leather-b"]);

      expect(state.informationOverlayPages[0].id).toBe("leather-a-leather-b");
    });
  });

  describe("addOptionInformationPage", () => {
    it("should add options info page for attribute with info", () => {
      const state = createMockState();
      state.objectIDMap["attr-color"] = {
        id: "attr-color",
        name: "Color",
        options: ["opt-1", "opt-2"],
        info: { description: "Choose your color" },
      } as any;
      state.objectIDMap["opt-1"] = { id: "opt-1", name: "Red" } as any;
      state.objectIDMap["opt-2"] = { id: "opt-2", name: "Blue" } as any;

      mutations.addOptionInformationPage(state, "attr-color");

      expect(state.informationOverlayPages.length).toBe(1);
      expect(state.informationOverlayPages[0].component).toBe("OptionsInfoPage");
    });

    it("should not add page for attribute without info", () => {
      const state = createMockState();
      state.objectIDMap["attr-color"] = {
        id: "attr-color",
        name: "Color",
        options: ["opt-1"],
      } as any;

      mutations.addOptionInformationPage(state, "attr-color");

      expect(state.informationOverlayPages.length).toBe(0);
    });
  });
});
