import { vi } from "vitest";
import { createStore, Store } from "vuex";
import type { State } from "@/store/state";

/**
 * Options for creating a mock Vuex store
 */
export interface MockStoreOptions {
  state?: Partial<State>;
  getters?: Record<string, unknown>;
  mutations?: Record<string, ReturnType<typeof vi.fn>>;
  actions?: Record<string, ReturnType<typeof vi.fn>>;
}

/**
 * Create a default mock state that matches the shape of the real state
 */
export function createDefaultMockState(): Partial<State> {
  return {
    currentProduct: "gloves",
    currentAttribute: 0,
    products: [],
    models: [],
    attributes: [],
    options: [],
    leathers: [],
    series: [],
    restrictions: {},
    objectIDMap: {},
    selectedOptions: {},
    pimcos: [],
    productImageContributions: {},
    generatedProductImageContributions: {},
    productView: 0,
    pimcoUpdater: false,
    priceEnforcer: false,
    sessionID: "test-session-id",
    configuratorPage: "build",
    configuratorMode: "blank",
    windowHeight: 768,
    windowWidth: 1024,
    OS: "Desktop",
    userBrowser: "Chrome",
    wasmLoaded: false,
    wasmUnavailable: false,
    supportsAvif: false,
    renderCompletionOverlay: false,
    renderCheckoutOverlay: false,
    showIncompleted: false,
    attrTransitionBusy: false,
    attrTransitionWait: 200,
    tippedLeatherGuide: false,
    standardPopupInfo: null,
    specialPopupInfo: null,
    sizeChangePopup: false,
    goEdgeXPopup: false,
    goClassicPopup: false,
    informationOverlayPages: [],
    leatherGuideInfo: null,
    leatherProps: {},
    leatherGuideLeathers: [],
    agreedTerms: {},
    globalAddToCartState: true,
    productImageDataURL: "",
    colorPlayInfo: {},
    optionApplicationTracker: {},
    expandProductStage: false,
    preConfigData: {},
    stageHijacker: null,
    stageHijackerPath: null,
    branchSync: [],
    branchSyncEnabled: false,
    editorPimcoOption: null,
    toggleRender: true,
    showControls3DTutorial: false,
    hideHeader: false,
    inStudioMode: false,
    displayStudioControls: false,
    studioPoses: [],
    studioLighting: null,
    indexedPopups: new Set(),
  };
}

/**
 * Create a mock Vuex store for testing
 */
export function createMockStore(options: MockStoreOptions = {}): Store<State> {
  const mockState = {
    ...createDefaultMockState(),
    ...options.state,
  } as State;

  // Create mock getters that return the provided values
  const mockGetters: Record<string, () => unknown> = {};
  if (options.getters) {
    for (const [key, value] of Object.entries(options.getters)) {
      mockGetters[key] = () => value;
    }
  }

  // Create mock mutations
  const mockMutations: Record<string, ReturnType<typeof vi.fn>> = {
    setCurrentProduct: vi.fn(),
    setCurrentAttribute: vi.fn(),
    setSelectedOptions: vi.fn(),
    setPimcos: vi.fn(),
    setCompletionOverlayRender: vi.fn(),
    setCheckoutOverlayRender: vi.fn(),
    setStandardPopup: vi.fn(),
    setSpecialPopup: vi.fn(),
    setSizeChangePopup: vi.fn(),
    incrementProductView: vi.fn(),
    decrementProductView: vi.fn(),
    ...options.mutations,
  };

  // Create mock actions
  const mockActions: Record<string, ReturnType<typeof vi.fn>> = {
    fetchData: vi.fn().mockResolvedValue(undefined),
    fetchPreConfigData: vi.fn().mockResolvedValue(undefined),
    incrementCurrentAttribute: vi.fn(),
    decrementCurrentAttribute: vi.fn(),
    setCurrentAttribute: vi.fn(),
    proceedToCheckout: vi.fn(),
    ...options.actions,
  };

  return createStore({
    state: () => mockState,
    getters: mockGetters,
    mutations: mockMutations,
    actions: mockActions,
  });
}

/**
 * Create a store with real test data loaded from test-data directory
 */
export async function createStoreWithTestData(
  options: MockStoreOptions = {}
): Promise<Store<State>> {
  // Import test data loader dynamically to avoid issues with file system in browser tests
  const { testData } = await import("../helpers/loadTestData");

  const startData = testData.startData as { products?: unknown[]; objectIDMap?: Record<string, unknown> };
  const modelData = testData.modelData as { models?: unknown[]; objectIDMap?: Record<string, unknown> };

  const stateWithData: Partial<State> = {
    ...createDefaultMockState(),
    products: (startData.products || []) as State["products"],
    models: (modelData.models || []) as State["models"],
    objectIDMap: {
      ...(startData.objectIDMap || {}),
      ...(modelData.objectIDMap || {}),
    } as State["objectIDMap"],
    ...options.state,
  };

  return createMockStore({
    ...options,
    state: stateWithData,
  });
}
