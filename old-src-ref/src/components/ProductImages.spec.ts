/**
 * ProductImages.vue Unit Tests
 *
 * These tests run with Vitest + happy-dom for fast, automated testing of
 * component behavior, computed properties, lifecycle hooks, and user interactions.
 *
 * For visual/canvas rendering tests, use the productimages-harness:
 *   npm run test:productimages
 *
 * The harness provides:
 * - Real browser canvas APIs
 * - Interactive visual testing
 * - Programmatic access via window.harness for Playwright integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shallowMount, VueWrapper } from "@vue/test-utils";
import { createStore, Store } from "vuex";
import ProductImages from "./ProductImages.vue";

// Use vi.hoisted for mock definitions
const {
  mockRenderer,
  mockThreedee,
  mockParams,
  mockUtils,
  mockRegionmap,
  mockCanvasWorkers,
  mockEffects,
} = vi.hoisted(() => ({
  mockRenderer: {
    draw: vi.fn(() => Promise.resolve()),
    drawSubstitution: vi.fn(() => Promise.resolve()),
  },
  mockThreedee: {
    initialize: vi.fn(() =>
      Promise.resolve({
        transformation: {
          identity: vi.fn(),
          makeRotationY: vi.fn().mockReturnThis(),
          multiply: vi.fn(),
        },
        THREE: {
          Matrix4: vi.fn().mockImplementation(() => ({
            makeRotationX: vi.fn(),
          })),
        },
      })
    ),
    render: vi.fn(),
    getModificationContext: vi.fn(() => ({
      updateSceneMeshes: vi.fn(() => Promise.resolve()),
      setMaterialTextures: vi.fn(),
    })),
    updateSceneLights: vi.fn(),
    setCameraFOV: vi.fn(),
    getCameraFOV: vi.fn(() => 25),
    animateModelRotation: vi.fn(),
    cancelAnimation: vi.fn(),
    onAnimationFinish: vi.fn(),
    onAnimationProgress: vi.fn(),
    setModelRotation: vi.fn(),
    getModelRotation: vi.fn(() => [0, 0, 0]),
    getAngleIndicesSortedByClosest: vi.fn(() => [{ index: 0, dot: 1 }]),
    getRotationDistance: vi.fn(() => 0),
    triggerTransformChangeEvent: vi.fn(),
    initialized: false,
    requestAnimationPromise: vi.fn(() => Promise.resolve()),
    loadHdrTexture: vi.fn(() => Promise.resolve(null)),
    setCameraPosition: vi.fn(),
  },
  mockParams: {
    getBool: vi.fn(() => false),
    get: vi.fn(() => null),
    has: vi.fn(() => false),
    getString: vi.fn(() => ""),
    isNumber: vi.fn(() => false),
    getNumber: vi.fn(() => 0),
  },
  mockUtils: {
    sanitize: vi.fn((str: string) => str.toLowerCase().replace(/\s+/g, "-")),
    lerp: vi.fn((a: number, b: number, t: number) => a + (b - a) * t),
  },
  mockRegionmap: {
    resetRegionMap: vi.fn(() => Promise.resolve()),
    generatePimcoKey: vi.fn(() => "key"),
    isInCacheLibrary: vi.fn(() => false),
    applyImageDataToRegionBuffer: vi.fn(() => Promise.resolve()),
    renderRegionBufferFromQueue: vi.fn(() => Promise.resolve()),
    getStepListFromCoords: vi.fn(() => Promise.resolve([])),
  },
  mockCanvasWorkers: {
    request: vi.fn(() =>
      Promise.resolve({
        canvas: document.createElement("canvas"),
        ctx: document.createElement("canvas").getContext("2d"),
        width: 100,
        height: 100,
        release: vi.fn(),
      })
    ),
    setMode: vi.fn(),
  },
  mockEffects: {
    startSpecialCrossFadeAnimation: vi.fn(() => ({
      step: vi.fn(),
      end: vi.fn(),
    })),
  },
}));

// Mock dependencies
vi.mock("@/renderer", () => ({
  default: mockRenderer,
}));

vi.mock("@/threedee", () => ({
  default: mockThreedee,
}));

vi.mock("@/params", () => ({
  default: mockParams,
}));

vi.mock("@/utils", () => ({
  default: mockUtils,
}));

vi.mock("@/regionmap", () => ({
  default: mockRegionmap,
}));

vi.mock("@/renderer/canvas-workers", () => ({
  default: mockCanvasWorkers,
}));

vi.mock("@/effects", () => ({
  default: mockEffects,
}));

vi.mock("@/formulas", () => ({
  createNumericalFormula: vi.fn(() => () => 25),
}));

vi.mock("@/store/initialize", () => ({
  starters: { dev: false },
}));

// Mock child component
vi.mock("./WorkingIndicator.vue", () => ({
  default: {
    name: "WorkingIndicator",
    props: ["changingFrames"],
    template: "<div class='mock-working-indicator'></div>",
  },
}));

describe("ProductImages.vue", () => {
  let store: Store<any>;
  let mockMutations: Record<string, ReturnType<typeof vi.fn>>;
  let mockActions: Record<string, ReturnType<typeof vi.fn>>;

  const createMockStore = (
    stateOverrides: Record<string, unknown> = {},
    getterOverrides: Record<string, unknown> = {}
  ) => {
    mockMutations = {
      setProductImageDataURL: vi.fn(),
      incrementProductView: vi.fn(),
      decrementProductView: vi.fn(),
      setStandardPopup: vi.fn(),
      setProductView: vi.fn(),
    };

    mockActions = {
      setCurrentAttribute: vi.fn(),
      setAttributes: vi.fn(),
    };

    return createStore({
      state: {
        OS: "Desktop",
        inStudioMode: false,
        ...stateOverrides,
      },
      getters: {
        getOrderedPimcos: () => [],
        getMaterialPimcos3D: () => ({}),
        getProduct: () => ({
          name: "Gloves",
          dimensions: [1350, 1350],
        }),
        getModel: () => ({
          name: "Classic W",
          camera: { fov: 25 },
        }),
        getFilteredAttributes: () => [],
        getProductRenderingContext: () => "2D",
        getMeshes3D: () => [],
        getLights3D: () => [],
        getMaterialSize: () => [1024, 1024],
        getProductView: () => 0,
        getViews: () => [],
        getProductAspectRatio: () => 1,
        getProductImageSizingMode: () => "contain",
        ...getterOverrides,
      },
      mutations: mockMutations,
      actions: mockActions,
    });
  };

  const mountComponent = (
    stateOverrides: Record<string, unknown> = {},
    getterOverrides: Record<string, unknown> = {}
  ) => {
    store = createMockStore(stateOverrides, getterOverrides);

    // Mock ResizeObserver
    const mockResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    }));
    vi.stubGlobal("ResizeObserver", mockResizeObserver);

    return shallowMount(ProductImages, {
      global: {
        plugins: [store],
      },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ============================================
  // RENDERING TESTS
  // ============================================
  describe("rendering", () => {
    it("should render the canvas container", () => {
      const wrapper = mountComponent();
      expect(wrapper.find("#canvas-container").exists()).toBe(true);
    });

    it("should render the main canvas", () => {
      const wrapper = mountComponent();
      expect(wrapper.find("#main-canvas").exists()).toBe(true);
    });

    it("should render WorkingIndicator component", () => {
      const wrapper = mountComponent();
      expect(
        wrapper.findComponent({ name: "WorkingIndicator" }).exists()
      ).toBe(true);
    });

    it("should add render-context class based on productRenderingContext", () => {
      const wrapper = mountComponent({}, { getProductRenderingContext: () => "2D" });
      expect(wrapper.find("#canvas-container").classes()).toContain(
        "render-context-2d"
      );
    });

    it("should show 3D controls when context is THREE", () => {
      const wrapper = mountComponent({}, { getProductRenderingContext: () => "THREE" });
      expect(wrapper.find(".controls-3d").exists()).toBe(true);
    });

    it("should hide 3D controls when context is 2D", () => {
      const wrapper = mountComponent({}, { getProductRenderingContext: () => "2D" });
      expect(wrapper.find(".controls-3d").exists()).toBe(false);
    });
  });

  // ============================================
  // COMPUTED PROPERTIES TESTS
  // ============================================
  describe("computed properties", () => {
    it("should compute productImageDimensions from product", () => {
      const wrapper = mountComponent(
        {},
        {
          getProduct: () => ({
            name: "Test",
            dimensions: [1200, 1000],
          }),
        }
      );
      expect((wrapper.vm as any).productImageDimensions).toEqual([1200, 1000]);
    });

    it("should use default dimensions when product has no dimensions", () => {
      const wrapper = mountComponent(
        {},
        {
          getProduct: () => ({
            name: "Test",
          }),
        }
      );
      expect((wrapper.vm as any).productImageDimensions).toEqual([1350, 1350]);
    });

    it("should compute renderingContextClass correctly", () => {
      const wrapper = mountComponent({}, { getProductRenderingContext: () => "THREE" });
      expect((wrapper.vm as any).renderingContextClass).toBe(
        "render-context-three"
      );
    });

    it("should compute filteredAttributeIDs from filtered attributes", () => {
      const wrapper = mountComponent(
        {},
        {
          getFilteredAttributes: () => [
            { id: "attr-1", name: "Color" },
            { id: "attr-2", name: "Size" },
          ],
        }
      );
      expect((wrapper.vm as any).filteredAttributeIDs).toEqual([
        "attr-1",
        "attr-2",
      ]);
    });

    it("should compute fieldOfView3D from model camera", () => {
      const wrapper = mountComponent(
        {},
        {
          getModel: () => ({
            name: "Test",
            camera: { fov: 30 },
          }),
        }
      );
      expect((wrapper.vm as any).fieldOfView3D).toBe(30);
    });

    it("should use default FOV when model has no camera", () => {
      const wrapper = mountComponent(
        {},
        {
          getModel: () => ({
            name: "Test",
          }),
        }
      );
      expect((wrapper.vm as any).fieldOfView3D).toBe(25);
    });
  });

  // ============================================
  // CANVAS DATA ATTRIBUTES TESTS
  // ============================================
  describe("canvas data attributes", () => {
    it("should set data-canvas-state to loading when changing frames", async () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      vm.changingFrames = true;
      await wrapper.vm.$nextTick();

      const canvas = wrapper.find("#main-canvas");
      expect(canvas.attributes("data-canvas-state")).toBe("loading");
    });

    it("should set data-canvas-state to done when not changing", () => {
      const wrapper = mountComponent();
      const canvas = wrapper.find("#main-canvas");
      expect(canvas.attributes("data-canvas-state")).toBe("done");
    });
  });

  // ============================================
  // DATA INITIALIZATION TESTS
  // ============================================
  describe("data initialization", () => {
    it("should initialize with correct default values", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      expect(vm.changingFrames).toBe(false);
      expect(vm.changingMeshes).toBe(false);
      expect(vm.changingTextures).toBe(false);
      expect(vm.pimcoUpdates).toBe(true);
      expect(vm.threeJSReady).toBe(false);
      expect(vm.zoomScale).toBe(1.0);
      expect(vm.maxZoom).toBe(3.0);
    });

    it("should create offscreen canvases", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      expect(vm.workCanvas).toBeInstanceOf(HTMLCanvasElement);
      expect(vm.colorCanvas).toBeInstanceOf(HTMLCanvasElement);
      expect(vm.frameCanvas1).toBeInstanceOf(HTMLCanvasElement);
      expect(vm.frameCanvas2).toBeInstanceOf(HTMLCanvasElement);
    });

    it("should initialize image cache as empty Map", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      expect(vm.loadedImages).toBeInstanceOf(Map);
      expect(vm.loadedImages.size).toBe(0);
    });
  });

  // ============================================
  // METHODS TESTS
  // ============================================
  describe("methods", () => {
    it("should have loadImage method", () => {
      const wrapper = mountComponent();
      expect(typeof (wrapper.vm as any).loadImage).toBe("function");
    });

    it("should have changeFrames method", () => {
      const wrapper = mountComponent();
      expect(typeof (wrapper.vm as any).changeFrames).toBe("function");
    });

    it("should have resizeCanvas method", () => {
      const wrapper = mountComponent();
      expect(typeof (wrapper.vm as any).resizeCanvas).toBe("function");
    });

    it("should have cubicEasing method that returns correct values", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      // Test easing at different points
      expect(vm.cubicEasing(0)).toBe(0);
      expect(vm.cubicEasing(1)).toBe(1);
      expect(vm.cubicEasing(0.5)).toBe(0.5); // Inflection point
    });

    it("should ease in at start of curve", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      expect(vm.cubicEasing(0.25)).toBeLessThan(0.25);
    });

    it("should ease out at end of curve", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      expect(vm.cubicEasing(0.75)).toBeGreaterThan(0.75);
    });
  });

  // ============================================
  // LIGHT HELP MODE TESTS
  // ============================================
  describe("isInLightHelpMode", () => {
    it("should return false when param is not set", () => {
      mockParams.getBool.mockReturnValue(false);
      const wrapper = mountComponent();
      expect((wrapper.vm as any).isInLightHelpMode).toBe(false);
    });

    it("should return true when param is set", () => {
      mockParams.getBool.mockReturnValue(true);
      const wrapper = mountComponent();
      expect((wrapper.vm as any).isInLightHelpMode).toBe(true);
    });

    it("should add help-lights class when in light help mode", () => {
      mockParams.getBool.mockReturnValue(true);
      const wrapper = mountComponent();
      expect(wrapper.find("#canvas-container").classes()).toContain(
        "help-lights"
      );
    });
  });

  // ============================================
  // FILL SCALE LOCK TESTS
  // ============================================
  describe("fillScaleLock", () => {
    it("should add contain class to canvas when fillScaleLock is true", async () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      vm.fillScaleLock = true;
      await wrapper.vm.$nextTick();

      expect(wrapper.find("#main-canvas").classes()).toContain("contain");
    });

    it("should not have contain class by default", () => {
      const wrapper = mountComponent();
      expect(wrapper.find("#main-canvas").classes()).not.toContain("contain");
    });
  });

  // ============================================
  // LIFECYCLE HOOKS TESTS
  // ============================================
  describe("lifecycle hooks", () => {
    it("should set up resize observer on mount", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      expect(vm.resizeObserver).toBeDefined();
    });

    it("should add keydown listener on mount", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");
      mountComponent();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
      addEventListenerSpy.mockRestore();
    });

    it("should disconnect resize observer on unmount", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;
      const disconnectSpy = vi.spyOn(vm.resizeObserver, "disconnect");

      wrapper.unmount();

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it("should remove keydown listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
      const wrapper = mountComponent();

      wrapper.unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
      removeEventListenerSpy.mockRestore();
    });
  });

  // ============================================
  // KEYBOARD NAVIGATION TESTS
  // ============================================
  describe("keyboard navigation", () => {
    it("should increment view on ArrowRight key", () => {
      mountComponent();

      const keyEvent = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      });
      document.dispatchEvent(keyEvent);

      expect(mockMutations.incrementProductView).toHaveBeenCalled();
    });

    it("should decrement view on ArrowLeft key", () => {
      mountComponent();

      const keyEvent = new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
      });
      document.dispatchEvent(keyEvent);

      expect(mockMutations.decrementProductView).toHaveBeenCalled();
    });

    it("should ignore arrow keys when shift is pressed", () => {
      mountComponent();

      const keyEvent = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
      });
      document.dispatchEvent(keyEvent);

      expect(mockMutations.incrementProductView).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 3D CONTROLS TESTS
  // ============================================
  describe("3D controls", () => {
    it("should track mouse position for 3D rotation", () => {
      const wrapper = mountComponent({}, { getProductRenderingContext: () => "THREE" });
      const vm = wrapper.vm as any;

      const mockEvent = {
        button: 0,
        clientX: 100,
        clientY: 150,
        preventDefault: vi.fn(),
      };

      vm.trackUserControls3DStart(mockEvent);

      expect(vm.lastMousePosX).toBe(100);
      expect(vm.lastMousePosY).toBe(150);

      vm.trackUserControls3DEnd();
    });

    it("should detect two-touch rotation gesture", () => {
      const wrapper = mountComponent({}, { getProductRenderingContext: () => "THREE" });
      const vm = wrapper.vm as any;

      // Create a mock TouchEvent class for happy-dom
      class MockTouchEvent {
        touches: Array<{ clientX: number; clientY: number }>;
        preventDefault: ReturnType<typeof vi.fn>;
        constructor(touches: Array<{ clientX: number; clientY: number }>) {
          this.touches = touches;
          this.preventDefault = vi.fn();
        }
      }
      vi.stubGlobal("TouchEvent", MockTouchEvent);

      const mockTouchEvent = new MockTouchEvent([
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 200 },
      ]);

      vm.trackUserControls3DStart(mockTouchEvent);

      expect(vm.twoTouchRotation).toBe(true);

      vm.trackUserControls3DEnd();
    });
  });

  // ============================================
  // STATE SYNCHRONIZATION TESTS
  // ============================================
  describe("state synchronization", () => {
    it("should access OS from store state", () => {
      const wrapper = mountComponent({ OS: "iOS" });
      const vm = wrapper.vm as any;

      expect(vm.OS).toBe("iOS");
    });

    it("should access inStudioMode from store state", () => {
      const wrapper = mountComponent({ inStudioMode: true });
      const vm = wrapper.vm as any;

      expect(vm.inStudioMode).toBe(true);
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================
  describe("error handling", () => {
    it("should handle null mainCanvas gracefully in changeFrames", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      const originalCanvas = vm.mainCanvas;
      vm.mainCanvas = null;

      expect(() => vm.changeFrames()).not.toThrow();

      vm.mainCanvas = originalCanvas;
    });

    it("should handle missing container in resize", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      const originalContainer = vm.canvasContainer;
      vm.canvasContainer = null;

      expect(() => vm.resizeCanvas()).not.toThrow();

      vm.canvasContainer = originalContainer;
    });

    it("should handle missing resizeObserver on unmount", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      vm.resizeObserver = undefined;

      expect(() => wrapper.unmount()).not.toThrow();
    });
  });
});
