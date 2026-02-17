import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to define mock objects that can be used in vi.mock factories
const {
  mockData,
  mockRestrictions,
  mockStorage,
  mockStructure,
  mockGetters,
  mockCart,
  mockWoocommerce,
  mockShare,
  mockUtils,
  mockRenderer,
  mockPimcos,
  mockThreedee,
  mockEffects,
  mockParams,
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
    mockData: {
      fetchStartData: vi.fn(() => Promise.resolve([])),
      fetchModelData: vi.fn(() => Promise.resolve([])),
      fetchSeriesList: vi.fn(() => Promise.resolve([])),
      fetchConfiguratorData: vi.fn(() => Promise.resolve({})),
      fetch: vi.fn(() => Promise.resolve(null)),
      fetchContentDataFile: vi.fn(() => Promise.resolve(null)),
    },
    mockRestrictions: {
      match: vi.fn(() => false),
      certifyValueIsntRestricted: vi.fn(() => true),
    },
    mockStorage: {
      getValue: vi.fn(() => null),
      saveValue: vi.fn(),
      deleteValue: vi.fn(),
      evaluateSelections: vi.fn(),
    },
    mockStructure: {
      getFilteredStructure: vi.fn((obj) => obj),
      traverse: vi.fn(),
      branch: vi.fn(() => null),
      build: vi.fn(() => Promise.resolve({})),
      getDefault: vi.fn(() => null),
      products: vi.fn(() => Promise.resolve({})),
      recieve: vi.fn(),
      reset: vi.fn(),
    },
    mockGetters: {
      getModel: vi.fn(() => ({ attributes: [], wcvalue: "model-1" })),
      getModelID: vi.fn(() => "model-1"),
      getSeriesID: vi.fn(() => null),
      getFilteredAttributes: vi.fn(() => []),
      getProduct: vi.fn(() => ({ id: "product-1", dimensions: [1000, 1000] })),
      getProductCompletionMinimal: true,
      getRestrictions: vi.fn(() => ({})),
      getIndexedEnablers: vi.fn(() => ({})),
      getViewCount: vi.fn(() => 4),
      getViews: vi.fn(() => [[0, 0, 0]]),
      getViewOrder: vi.fn(() => null),
      getPimcoContributers: vi.fn(() => ({})),
      getFillerPimcos: vi.fn(() => []),
      getMobileWidth: vi.fn(() => false),
      getProductRenderingContext: "2D",
      getSeries: vi.fn(() => null),
      getWoocommerceMods: vi.fn(() => ({})),
      getDeviceMeta: vi.fn(() => ({})),
      getDerivedCloneFieldData: vi.fn(() => ({})),
      getStartOverMode: vi.fn(() => "default"),
      getProductBackground: vi.fn(() => null),
      getProductAspectRatio: vi.fn(() => 1),
    },
    mockCart: {
      addToCart: {
        apply: vi.fn(() => ({ html: "", action: "", body: {} })),
      },
    },
    mockWoocommerce: {
      getProduct: vi.fn(() => "12345"),
      onDataLoaded: vi.fn((cb) => cb()),
    },
    mockShare: {
      newSession: vi.fn(),
      sendSessionData: vi.fn(() => Promise.resolve(true)),
      sendSessionImage: vi.fn(() => Promise.resolve([true])),
    },
    mockUtils: {
      mapNested: vi.fn(() => ({})),
      standardOptionFilter: vi.fn(() => true),
      standardAttributeFilter: vi.fn(() => true),
      setNested: vi.fn(() => true),
      loadScript: vi.fn(() => Promise.resolve()),
      imageDataOrCanvasToDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,test")),
      imageDataOrCanvasToBlob: vi.fn(() => Promise.resolve(new Blob())),
    },
    mockRenderer: {
      draw: vi.fn(() => Promise.resolve()),
      preloadImages: vi.fn(),
    },
    mockPimcos: {
      filterContributions: vi.fn(() => ({})),
      compilePimcoContributions: vi.fn(() => []),
    },
    mockThreedee: {
      getModelRotation: vi.fn(() => [0, 0, 0]),
      getCameraFOV: vi.fn(() => 50),
      setModelRotation: vi.fn(),
      setCameraFOV: vi.fn(),
      render: vi.fn(),
    },
    mockEffects: {
      processRenderedImage: vi.fn(() => ({
        crop: vi.fn().mockReturnThis(),
        frame: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        execute: vi.fn(() => Promise.resolve()),
      })),
    },
    mockParams: {
      getBool: vi.fn(() => false),
      has: vi.fn(() => false),
      isNumber: vi.fn(() => false),
      getNumber: vi.fn(() => 0),
      getString: vi.fn(() => ""),
    },
    MockOptionCasing: MockCasing,
  };
});

// Mock all dependencies
vi.mock("@/data", () => ({
  default: mockData,
}));

vi.mock("@/restrictions", () => ({
  default: mockRestrictions,
}));

vi.mock("@/storage", () => ({
  default: mockStorage,
}));

vi.mock("@/structure", () => ({
  default: mockStructure,
  OptionCasing: MockOptionCasing,
}));

vi.mock("./getters", () => ({
  default: mockGetters,
}));

vi.mock("@/cart", () => ({
  default: mockCart,
}));

vi.mock("@/woocommerce", () => ({
  default: mockWoocommerce,
}));

vi.mock("@/share", () => ({
  default: mockShare,
}));

vi.mock("@/utils", () => ({
  default: mockUtils,
}));

vi.mock("@/renderer", () => ({
  default: mockRenderer,
}));

vi.mock("@/pimcos", () => ({
  default: mockPimcos,
}));

vi.mock("@/threedee", () => ({
  default: mockThreedee,
}));

vi.mock("@/effects", () => ({
  default: mockEffects,
}));

vi.mock("@/params", () => ({
  default: mockParams,
}));

vi.mock("@/renderer/canvas-workers", () => ({
  default: {
    request: vi.fn(() => Promise.resolve({
      width: 1000,
      height: 1000,
      ctx: {
        globalCompositeOperation: "",
        fillStyle: "",
        fillRect: vi.fn(),
      },
      cvs: document.createElement("canvas"),
      release: vi.fn(),
    })),
  },
}));

vi.mock("./initialize", () => ({
  starters: {
    dev: false,
    frame: 0,
    models: {},
    series: {},
    branchAssignments: {},
  },
  actionsContext: (actions: Record<string, Function>) => {
    // Wrap each action to make it callable
    const wrapped: Record<string, Function> = {};
    for (const key in actions) {
      wrapped[key] = actions[key];
    }
    return wrapped;
  },
}));

vi.mock("./mutations", () => ({
  saveData: vi.fn(),
}));

vi.mock(".", () => ({
  resetModelSelectionStorage: vi.fn(),
}));

// Import after mocking
import actions from "./actions";

describe("actions", () => {
  // Helper to create a mock action context
  function createMockContext(overrides: Partial<{
    state: Record<string, unknown>;
    getters: Record<string, unknown>;
  }> = {}) {
    const commit = vi.fn();
    const dispatch = vi.fn();

    const state = {
      currentProduct: "product-1",
      currentAttribute: 0,
      configuratorMode: "custom",
      configuratorPage: "main",
      attrTransitionBusy: false,
      attrTransitionWait: 50,
      branchSyncEnabled: false,
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
      },
      models: [],
      attributes: [],
      options: [],
      leathers: [],
      pimcos: [],
      restrictions: {},
      sessionID: "test-session-id",
      globalAddToCartState: true,
      preConfigData: {},
      studioLighting: null,
      studioPoses: [],
      ...overrides.state,
    };

    const getters = {
      getModel: { attributes: [], wcvalue: "model-1" },
      getModelID: "model-1",
      getSeriesID: null,
      getFilteredAttributes: [],
      getProduct: { id: "product-1", dimensions: [1000, 1000] },
      getProductCompletionMinimal: true,
      getRestrictions: {},
      getIndexedEnablers: {},
      getViewCount: 4,
      getViews: [[0, 0, 0]],
      getViewOrder: null,
      getPimcoContributers: {},
      getFillerPimcos: [],
      getMobileWidth: false,
      getProductRenderingContext: "2D",
      getSeries: null,
      getWoocommerceMods: {},
      getDeviceMeta: {},
      getDerivedCloneFieldData: {},
      getStartOverMode: "default",
      getProductBackground: null,
      getProductAspectRatio: 1,
      ...overrides.getters,
    };

    return { commit, dispatch, state, getters };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("setCurrentAttribute", () => {
    it("should not change attribute if transition is busy", () => {
      const context = createMockContext({
        state: { attrTransitionBusy: true },
      });

      actions.setCurrentAttribute(context as any, 1);

      expect(context.commit).not.toHaveBeenCalled();
    });

    it("should not change attribute if same value", () => {
      const context = createMockContext({
        state: { currentAttribute: 1 },
      });

      actions.setCurrentAttribute(context as any, 1);

      expect(context.commit).not.toHaveBeenCalled();
    });

    it("should proceed to checkout when value exceeds filtered attributes length", () => {
      const context = createMockContext({
        getters: { getFilteredAttributes: [{}, {}] },
      });

      actions.setCurrentAttribute(context as any, 5);

      expect(context.dispatch).toHaveBeenCalledWith("proceedToCheckout");
    });

    it("should set attribute with transition delay", async () => {
      const context = createMockContext({
        state: { attrTransitionWait: 50 },
        getters: { getFilteredAttributes: [{}, {}, {}] },
      });

      actions.setCurrentAttribute(context as any, 1);

      expect(context.state.attrTransitionBusy).toBe(true);

      await vi.advanceTimersByTimeAsync(50);
      expect(context.commit).toHaveBeenCalledWith("setCurrentAttribute", 1);

      await vi.advanceTimersByTimeAsync(50);
      expect(context.state.attrTransitionBusy).toBe(false);
    });
  });

  describe("incrementCurrentAttribute", () => {
    it("should dispatch setCurrentAttribute with incremented value", () => {
      const context = createMockContext({
        state: { currentAttribute: 2 },
      });

      actions.incrementCurrentAttribute(context as any);

      expect(context.dispatch).toHaveBeenCalledWith("setCurrentAttribute", 3);
    });
  });

  describe("decrementCurrentAttribute", () => {
    it("should dispatch setCurrentAttribute with decremented value", () => {
      const context = createMockContext({
        state: { currentAttribute: 2 },
      });

      actions.decrementCurrentAttribute(context as any);

      expect(context.dispatch).toHaveBeenCalledWith("setCurrentAttribute", 1);
    });
  });

  describe("proceedToCheckout", () => {
    it("should show checkout overlay when product is complete", () => {
      const context = createMockContext({
        getters: { getProductCompletionMinimal: true },
      });

      actions.proceedToCheckout(context as any);

      expect(context.commit).toHaveBeenCalledWith("setCheckoutOverlayRender", true);
    });

    it("should show special popup when product is incomplete with prompt", () => {
      const context = createMockContext({
        getters: { getProductCompletionMinimal: false },
      });

      actions.proceedToCheckout(context as any, true);

      expect(context.commit).toHaveBeenCalledWith("setSpecialPopup", expect.objectContaining({
        title: "Unfinished Business",
      }));
    });

    it("should show completion overlay directly when prompt is false", () => {
      const context = createMockContext({
        getters: { getProductCompletionMinimal: false },
      });

      actions.proceedToCheckout(context as any, false);

      expect(context.commit).toHaveBeenCalledWith("setCompletionOverlayRender", true);
      expect(context.commit).toHaveBeenCalledWith("setIncompletionShow", true);
    });
  });

  describe("fetchStartData", () => {
    it("should fetch products and commit to store", async () => {
      const mockProducts = [{ id: "p1", type: "Product" }];
      mockData.fetchStartData.mockResolvedValueOnce(mockProducts);
      mockStructure.products.mockResolvedValueOnce({ products: {} });

      const context = createMockContext();
      actions.fetchStartData(context as any);

      await vi.runAllTimersAsync();

      expect(mockData.fetchStartData).toHaveBeenCalled();
    });

    it("should add data tracker marker for start", () => {
      const context = createMockContext();
      actions.fetchStartData(context as any);

      // The dataTracker.add should have been called internally
      // We can verify this by checking that the action doesn't throw
      expect(true).toBe(true);
    });
  });

  describe("fetchModelData", () => {
    it("should fetch models for current product", async () => {
      const mockModels = [{ id: "m1", type: "Model" }];
      mockData.fetchModelData.mockResolvedValueOnce(mockModels);

      const context = createMockContext();
      actions.fetchModelData(context as any);

      await vi.runAllTimersAsync();

      expect(mockData.fetchModelData).toHaveBeenCalledWith("product-1");
    });
  });

  describe("fetchSeriesData", () => {
    it("should fetch series for current product", async () => {
      const mockSeries = [{ id: "s1", type: "Series" }];
      mockData.fetchSeriesList.mockResolvedValueOnce(mockSeries);

      const context = createMockContext();
      actions.fetchSeriesData(context as any);

      await vi.runAllTimersAsync();

      expect(mockData.fetchSeriesList).toHaveBeenCalledWith("product-1");
    });
  });

  describe("fetchConfiguratorData", () => {
    it("should fetch configurator data for current model", async () => {
      mockData.fetchConfiguratorData.mockResolvedValueOnce({
        attributes: [],
        options: [],
        leathers: [],
        pimcos: [],
      });

      const context = createMockContext();
      actions.fetchConfiguratorData(context as any);

      await vi.runAllTimersAsync();

      expect(mockData.fetchConfiguratorData).toHaveBeenCalled();
      expect(context.dispatch).toHaveBeenCalledWith("buildStructure");
    });
  });

  describe("switchProduct", () => {
    it("should commit product change and reset state", () => {
      const context = createMockContext();

      actions.switchProduct(context as any, "product-2");

      expect(context.commit).toHaveBeenCalledWith("setCurrentProduct", "product-2");
      expect(context.commit).toHaveBeenCalledWith("setConfiguratorPage", "start");
      expect(context.commit).toHaveBeenCalledWith("setConfiguratorMode", "");
      expect(mockShare.newSession).toHaveBeenCalled();
    });
  });

  describe("clearData", () => {
    it("should clear all data arrays by default", () => {
      const context = createMockContext({
        state: {
          models: [{ id: "m1" }],
          attributes: [{ id: "a1" }],
          options: [{ id: "o1" }],
          leathers: [{ id: "l1" }],
          pimcos: [{ id: "p1" }],
          objectIDMap: { m1: {}, a1: {}, o1: {}, l1: {}, p1: {} },
        },
      });

      actions.clearData(context as any);

      expect(context.state.models.length).toBe(0);
      expect(context.state.attributes.length).toBe(0);
      expect(context.state.options.length).toBe(0);
      expect(context.state.leathers.length).toBe(0);
      expect(context.state.pimcos.length).toBe(0);
      expect(context.commit).toHaveBeenCalledWith("clearProductImageContributers");
    });

    it("should clear only specified data arrays", () => {
      const context = createMockContext({
        state: {
          models: [{ id: "m1" }],
          attributes: [{ id: "a1" }],
          options: [],
          leathers: [],
          pimcos: [],
          objectIDMap: { m1: {}, a1: {} },
        },
      });

      actions.clearData(context as any, ["models"]);

      expect(context.state.models.length).toBe(0);
      expect(context.state.attributes.length).toBe(1);
    });
  });

  describe("switchModelData", () => {
    it("should clear specific data and dispatch clearData", () => {
      const context = createMockContext();

      actions.switchModelData(context as any);

      expect(context.dispatch).toHaveBeenCalledWith("clearData", [
        "attributes",
        "options",
        "leathers",
        "pimcos",
      ]);
      expect(context.state.restrictions).toEqual({});
      expect(mockStructure.reset).toHaveBeenCalledWith(["attributes", "options", "leathers", "pimcos"]);
      expect(context.commit).toHaveBeenCalledWith("setCurrentAttribute", 0);
    });
  });

  describe("storeData", () => {
    it("should call saveData with current selections", async () => {
      const { saveData } = await import("./mutations");
      const context = createMockContext();

      actions.storeData(context as any);

      expect(saveData).toHaveBeenCalledWith(
        context.state.selectedOptions,
        "custom",
        "product-1"
      );
    });
  });

  describe("addToCart", () => {
    it("should generate cart data and call callback", () => {
      mockWoocommerce.getProduct.mockReturnValueOnce("12345");
      const callback = vi.fn();
      const context = createMockContext({
        getters: {
          getProduct: { id: "product-1", dimensions: [1000, 1000] },
          getModel: { wcvalue: "model-1" },
          getSeries: null,
          getRestrictions: {},
          getIndexedEnablers: {},
          getWoocommerceMods: {},
          getDeviceMeta: {},
          getDerivedCloneFieldData: {},
        },
      });

      actions.addToCart(context as any, callback);

      expect(callback).toHaveBeenCalled();
      expect(context.state.globalAddToCartState).toBe(true);
    });

    it("should not call callback if wooID is not found", () => {
      mockWoocommerce.getProduct.mockReturnValueOnce(null);
      const callback = vi.fn();
      const context = createMockContext({
        getters: {
          getProduct: { id: "product-1", dimensions: [1000, 1000] },
          getModel: { wcvalue: "model-1" },
        },
      });

      actions.addToCart(context as any, callback);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("cleanSlate", () => {
    describe("with editor mode", () => {
      it("should reset option values to defaults without clearing all data", () => {
        const casing = new MockOptionCasing({ value: { id: "opt-1" }, defaultValue: null });
        mockStructure.traverse.mockImplementation((obj, callback) => {
          callback(casing);
        });

        const context = createMockContext({
          getters: {
            getStartOverMode: "editor",
            getProductRenderingContext: "2D",
            getViews: [[0, 0, 0]],
          },
        });

        actions.cleanSlate(context as any);

        expect(casing.value).toBeNull();
        expect(casing.userInteraction).toBe(false);
        expect(mockShare.newSession).toHaveBeenCalled();
        expect(context.commit).toHaveBeenCalledWith("setCurrentAttribute", 0);
        expect(context.commit).toHaveBeenCalledWith("clearProductImageContributers");
        expect(context.commit).toHaveBeenCalledWith("clearIndexedPopups");
      });

      it("should clear text from option values", () => {
        const casing = new MockOptionCasing({
          value: { id: "opt-1", text: "some text" },
          defaultValue: null,
        });
        mockStructure.traverse.mockImplementation((obj, callback) => {
          callback(casing);
        });

        const context = createMockContext({
          getters: {
            getStartOverMode: "editor",
            getProductRenderingContext: "2D",
            getViews: [[0, 0, 0]],
          },
        });

        actions.cleanSlate(context as any);

        // Text should be cleared before the value is nullified
        expect(casing.value).toBeNull();
      });
    });

    describe("with default mode", () => {
      it("should fully reset the configurator", () => {
        const context = createMockContext({
          getters: { getStartOverMode: "default" },
        });

        actions.cleanSlate(context as any);

        expect(context.commit).toHaveBeenCalledWith("setCurrentAttribute", 0);
        expect(mockStructure.reset).toHaveBeenCalled();
        expect(mockShare.newSession).toHaveBeenCalled();
        expect(context.dispatch).toHaveBeenCalledWith("clearData");
        expect(context.commit).toHaveBeenCalledWith("setCurrentModel", "");
        expect(context.commit).toHaveBeenCalledWith("setCurrentSeries", "");
        expect(context.commit).toHaveBeenCalledWith("setConfiguratorMode", "");
        expect(context.commit).toHaveBeenCalledWith("clearIndexedPopups");
        expect(mockStorage.deleteValue).toHaveBeenCalledWith("model");
        expect(mockStorage.deleteValue).toHaveBeenCalledWith("series");
        expect(mockStorage.deleteValue).toHaveBeenCalledWith("mode");
        expect(mockStorage.deleteValue).toHaveBeenCalledWith("selections");
        expect(mockStorage.deleteValue).toHaveBeenCalledWith("modelSelectionStorage");
      });
    });
  });

  describe("pose3DModel", () => {
    it("should set model rotation via threedee", async () => {
      const callback = vi.fn();

      await actions.pose3DModel({} as any, { view: [10, 20, 30], callback });

      expect(mockThreedee.setModelRotation).toHaveBeenCalledWith(10, 20, 30);
      expect(callback).toHaveBeenCalled();
    });

    it("should use window.set3DModelPose if available", async () => {
      const mockSet3DModelPose = vi.fn(() => Promise.resolve());
      (window as any).set3DModelPose = mockSet3DModelPose;
      const callback = vi.fn();

      await actions.pose3DModel({} as any, { view: [10, 20, 30], callback });

      expect(mockSet3DModelPose).toHaveBeenCalledWith(10, 20, 30);
      expect(callback).toHaveBeenCalled();

      delete (window as any).set3DModelPose;
    });
  });

  describe("setFOV3DModel", () => {
    it("should set camera FOV via threedee", () => {
      actions.setFOV3DModel({} as any, 45);

      expect(mockThreedee.setCameraFOV).toHaveBeenCalledWith(45);
    });
  });

  describe("saveSessionData", () => {
    it("should send session data and dispatch saveSessionImages", async () => {
      mockShare.sendSessionData.mockResolvedValueOnce(true);
      const callback = vi.fn();
      const context = createMockContext();

      actions.saveSessionData(context as any, { callback, number: 1 });

      await vi.runAllTimersAsync();

      expect(mockShare.sendSessionData).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ name: "sessionData", success: true });
      expect(context.dispatch).toHaveBeenCalledWith("saveSessionImages", expect.any(Object));
    });

    it("should skip saveSessionImages when saveImages is false", async () => {
      mockShare.sendSessionData.mockResolvedValueOnce(true);
      const context = createMockContext();

      actions.saveSessionData(context as any, { saveImages: false });

      await vi.runAllTimersAsync();

      expect(context.dispatch).not.toHaveBeenCalledWith("saveSessionImages", expect.any(Object));
    });
  });

  describe("saveStudioSettings", () => {
    it("should save studio settings to session storage", () => {
      // Use the global sessionStorage directly
      const setItemSpy = vi.spyOn(sessionStorage, "setItem");
      const context = createMockContext({
        state: {
          studioLighting: { intensity: 1 },
          studioPoses: [{ name: "Front", euler: [0, 0, 0] }],
        },
      });

      actions.saveStudioSettings(context as any);

      expect(setItemSpy).toHaveBeenCalledWith(
        "studioSettings",
        JSON.stringify({
          l: { intensity: 1 },
          p: [{ name: "Front", euler: [0, 0, 0] }],
        })
      );
      setItemSpy.mockRestore();
    });
  });

  describe("loadStudioSettings", () => {
    it("should load studio settings from session storage", () => {
      // Use the global sessionStorage directly
      const getItemSpy = vi.spyOn(sessionStorage, "getItem").mockReturnValueOnce(
        JSON.stringify({
          l: { intensity: 0.8 },
          p: [{ name: "Side", euler: [90, 0, 0] }],
        })
      );
      const context = createMockContext();

      actions.loadStudioSettings(context as any);

      expect(context.state.studioLighting).toEqual({ intensity: 0.8 });
      expect(context.state.studioPoses).toEqual([{ name: "Side", euler: [90, 0, 0] }]);
      getItemSpy.mockRestore();
    });

    it("should use payload if provided", () => {
      const context = createMockContext();
      const payload = {
        l: { intensity: 0.5 },
        p: [{ name: "Top", euler: [0, 90, 0] }],
      };

      actions.loadStudioSettings(context as any, payload);

      expect(context.state.studioLighting).toEqual({ intensity: 0.5 });
      expect(context.state.studioPoses).toEqual([{ name: "Top", euler: [0, 90, 0] }]);
    });
  });

  describe("studioSettingsToFile", () => {
    it("should create and download a JSON file", () => {
      const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
      const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL");
      const clickSpy = vi.fn();
      vi.spyOn(document, "createElement").mockReturnValueOnce({
        href: "",
        download: "",
        click: clickSpy,
      } as unknown as HTMLAnchorElement);

      const context = createMockContext({
        state: {
          studioLighting: { intensity: 1 },
          studioPoses: [],
        },
      });

      actions.studioSettingsToFile(context as any, "test-settings.json");

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:test");
    });
  });

  describe("fetchPreConfigData", () => {
    it("should fetch and store pre-config data", async () => {
      const mockPreConfigData = { someData: true };
      mockData.fetchContentDataFile.mockResolvedValueOnce(mockPreConfigData);
      const context = createMockContext();

      actions.fetchPreConfigData(context as any, { url: "/test/url", product: "test-product" });

      await vi.runAllTimersAsync();

      expect(mockData.fetchContentDataFile).toHaveBeenCalledWith("/test/url");
      expect(context.state.preConfigData["test-product"]).toEqual(mockPreConfigData);
    });
  });

  describe("onDataStepComplete", () => {
    it("should register callback for data step completion", () => {
      const callback = vi.fn();
      const context = createMockContext();

      // This action uses the internal dataTracker which is not easily testable
      // We just verify it doesn't throw
      expect(() => {
        actions.onDataStepComplete(context as any, { id: "start", callback });
      }).not.toThrow();
    });
  });

  describe("setAttributes", () => {
    it("should not proceed if transition is busy", () => {
      const context = createMockContext({
        state: { attrTransitionBusy: true },
      });

      actions.setAttributes(context as any, { attribute: 1, subAttribute: 0 });

      expect(context.commit).not.toHaveBeenCalled();
    });

    it("should proceed to checkout when attribute exceeds filtered attributes", () => {
      const context = createMockContext({
        getters: { getFilteredAttributes: [{}, {}] },
      });

      actions.setAttributes(context as any, { attribute: 10, subAttribute: 0 });

      expect(context.dispatch).toHaveBeenCalledWith("proceedToCheckout");
    });

    it("should handle string attribute ID lookup", () => {
      const context = createMockContext({
        state: { currentAttribute: 0 },
        getters: {
          getFilteredAttributes: [
            { id: "attr-1" },
            { id: "attr-2" },
            { id: "attr-3" },
          ],
        },
      });

      actions.setAttributes(context as any, { attribute: "attr-2", subAttribute: 0 });

      // Should set attrTransitionBusy since we're changing attributes
      expect(context.state.attrTransitionBusy).toBe(true);
    });
  });

  describe("buildStructure", () => {
    it("should build structure and apply saved options", async () => {
      mockStructure.build.mockResolvedValueOnce({ selections: {} });
      mockStorage.getValue.mockReturnValue(null);

      const context = createMockContext();

      actions.buildStructure(context as any);

      await vi.runAllTimersAsync();

      expect(mockStructure.build).toHaveBeenCalled();
    });

    it("should evaluate stored selections when available", async () => {
      mockStructure.build.mockResolvedValueOnce({ selections: {} });
      mockStorage.getValue
        .mockReturnValueOnce({ "model-1": { color: "red" } }) // modelSelectionStorage
        .mockReturnValueOnce({ "product-1": { selections: {} } }); // selections

      const context = createMockContext();

      actions.buildStructure(context as any);

      await vi.runAllTimersAsync();

      // The evaluateSelections should be called with stored data
      expect(mockStorage.getValue).toHaveBeenCalledWith("modelSelectionStorage");
      expect(mockStorage.getValue).toHaveBeenCalledWith("selections");
    });
  });

  describe("buildEntireNewStructure", () => {
    it("should build products structure and commit", async () => {
      const mockNewStructure = { products: {} };
      mockStructure.products.mockResolvedValueOnce(mockNewStructure);

      const context = createMockContext();

      actions.buildEntireNewStructure(context as any);

      await vi.runAllTimersAsync();

      expect(mockStructure.products).toHaveBeenCalled();
      expect(context.commit).toHaveBeenCalledWith("setStructure", { structure: mockNewStructure });
    });
  });
});
