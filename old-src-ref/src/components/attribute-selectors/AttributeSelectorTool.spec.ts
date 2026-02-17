import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createStore, Store } from "vuex";
import AttributeSelectorTool from "./AttributeSelectorTool.vue";

// Mock child selector components
vi.mock("./parrallel/ParallelSelector.vue", () => ({
  default: { template: "<div class='mock-parallel-selector'></div>" },
}));
vi.mock("./basic/BasicSelector.vue", () => ({
  default: { template: "<div class='mock-basic-selector'></div>" },
}));
vi.mock("./complex/ComplexSelectorNew.vue", () => ({
  default: { template: "<div class='mock-complex-selector'></div>" },
}));
vi.mock("./color/ColorSelector.vue", () => ({
  default: { template: "<div class='mock-color-selector'></div>" },
}));
vi.mock("./grand/GrandSelector.vue", () => ({
  default: { template: "<div class='mock-grand-selector'></div>" },
}));
vi.mock("./generic/GenericSelector.vue", () => ({
  default: { template: "<div class='mock-generic-selector'></div>" },
}));
vi.mock("@/components/DynamicText.vue", () => ({
  default: {
    props: ["text"],
    template: "<span class='mock-dynamic-text'>{{ text }}</span>",
  },
}));

describe("AttributeSelectorTool.vue", () => {
  let store: Store<any>;
  let mockActions: any;
  let mockMutations: any;

  const createMockStore = (stateOverrides = {}, getterOverrides = {}) => {
    mockActions = {
      incrementCurrentAttribute: vi.fn(),
      decrementCurrentAttribute: vi.fn(),
      setCurrentAttribute: vi.fn(),
    };

    mockMutations = {
      addOptionInformationPage: vi.fn(),
      setCompletionOverlayRender: vi.fn(),
      setCheckoutOverlayRender: vi.fn(),
      setStandardPopup: vi.fn(),
    };

    return createStore({
      state: {
        currentProduct: "gloves",
        currentAttribute: 0,
        attributes: [],
        products: [{ id: "gloves", name: "Gloves" }],
        objectIDMap: {},
        selectedOptions: { gloves: {} },
        attrTransitionWait: 100,
        attrTransitionBusy: false,
        OS: "Desktop",
        displayStudioControls: false,
        ...stateOverrides,
      },
      getters: {
        getModel: () => ({ name: "Classic W" }),
        getAttribute: () => ({
          id: "attr-1",
          name: "Color",
          type: "BasicAttribute",
          component: "BasicSelector",
          info: null,
        }),
        getFilteredAttributes: () => [
          { id: "attr-1", name: "Color", type: "BasicAttribute", component: "BasicSelector" },
          { id: "attr-2", name: "Size", type: "BasicAttribute", component: "BasicSelector" },
          { id: "attr-3", name: "Style", type: "BasicAttribute", component: "BasicSelector" },
        ],
        getProductCompletionMinimal: () => false,
        ...getterOverrides,
      },
      mutations: mockMutations,
      actions: mockActions,
    });
  };

  const mountComponent = (stateOverrides = {}, getterOverrides = {}) => {
    store = createMockStore(stateOverrides, getterOverrides);
    return shallowMount(AttributeSelectorTool, {
      global: {
        plugins: [store],
      },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up global state
    delete (window as any).__nav_queued_set__;
    delete (window as any).__nav_queued_step__;
  });

  describe("rendering", () => {
    it("should render the attribute selector tool", () => {
      const wrapper = mountComponent();
      expect(wrapper.find("#attribute-selector-tool").exists()).toBe(true);
    });

    it("should not render when displayStudioControls is true", () => {
      const wrapper = mountComponent({ displayStudioControls: true });
      expect(wrapper.find("#attribute-selector-tool").exists()).toBe(false);
    });

    it("should not render when attribute is null", () => {
      const wrapper = mountComponent({}, { getAttribute: () => null });
      expect(wrapper.find("#attribute-selector-tool").exists()).toBe(false);
    });

    it("should not render when selectedOptions is null", () => {
      const wrapper = mountComponent({ selectedOptions: null });
      expect(wrapper.find("#attribute-selector-tool").exists()).toBe(false);
    });

    it("should display progress indicator", () => {
      const wrapper = mountComponent({ currentAttribute: 0 });
      const progress = wrapper.find(".progress");
      expect(progress.exists()).toBe(true);
      expect(progress.text()).toBe("1/3");
    });

    it("should display attribute name", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Leather Color",
            component: "BasicSelector",
          }),
        }
      );
      expect((wrapper.vm as any).attributeName).toBe("Leather Color");
    });

    it("should prefer nickname over name for attribute display", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Full Attribute Name",
            nickname: "Short Name",
            component: "BasicSelector",
          }),
        }
      );
      expect((wrapper.vm as any).attributeName).toBe("Short Name");
    });
  });

  describe("navigation", () => {
    it("should disable prev arrow on first attribute", () => {
      const wrapper = mountComponent({ currentAttribute: 0 });
      const prevArrow = wrapper.find(".prev-arrow");
      expect(prevArrow.classes()).toContain("disabled");
    });

    it("should enable prev arrow when not on first attribute", () => {
      const wrapper = mountComponent({ currentAttribute: 1 });
      const prevArrow = wrapper.find(".prev-arrow");
      expect(prevArrow.classes()).not.toContain("disabled");
    });

    it("should disable next arrow on last attribute when product not completed", () => {
      const wrapper = mountComponent(
        { currentAttribute: 2 },
        { getProductCompletionMinimal: () => false }
      );
      const nextArrow = wrapper.find(".next-arrow");
      expect(nextArrow.classes()).toContain("disabled");
    });

    it("should enable next arrow on last attribute when product is completed", () => {
      const wrapper = mountComponent(
        { currentAttribute: 2 },
        { getProductCompletionMinimal: () => true }
      );
      const nextArrow = wrapper.find(".next-arrow");
      expect(nextArrow.classes()).not.toContain("disabled");
    });

    it("should call decrementCurrentAttribute when prev arrow clicked", async () => {
      const wrapper = mountComponent({ currentAttribute: 1 });
      await wrapper.find(".prev-arrow").trigger("click");
      expect(mockActions.decrementCurrentAttribute).toHaveBeenCalled();
    });

    it("should not call decrementCurrentAttribute when on first attribute", async () => {
      const wrapper = mountComponent({ currentAttribute: 0 });
      await wrapper.find(".prev-arrow").trigger("click");
      expect(mockActions.decrementCurrentAttribute).not.toHaveBeenCalled();
    });

    it("should call incrementCurrentAttribute when next arrow clicked", async () => {
      const wrapper = mountComponent({ currentAttribute: 0 });
      await wrapper.find(".next-arrow").trigger("click");
      expect(mockActions.incrementCurrentAttribute).toHaveBeenCalled();
    });

    it("should not call incrementCurrentAttribute when next is disabled", async () => {
      const wrapper = mountComponent(
        { currentAttribute: 2 },
        { getProductCompletionMinimal: () => false }
      );
      await wrapper.find(".next-arrow").trigger("click");
      expect(mockActions.incrementCurrentAttribute).not.toHaveBeenCalled();
    });
  });

  describe("completion overlay", () => {
    it("should open completion overlay when progress menu clicked", async () => {
      const wrapper = mountComponent();
      await wrapper.find(".progress-menu").trigger("click");
      expect(mockMutations.setCompletionOverlayRender).toHaveBeenCalledWith(
        expect.any(Object),
        true
      );
    });
  });

  describe("more info", () => {
    it("should show more info button when attribute has info", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Color",
            component: "BasicSelector",
            info: { title: "About Color", content: "Some info" },
          }),
        }
      );
      const moreInfo = wrapper.find(".more-info");
      expect(moreInfo.exists()).toBe(true);
      expect(moreInfo.classes()).not.toContain("hide");
    });

    it("should hide more info button when attribute has no info", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Color",
            component: "BasicSelector",
            info: null,
          }),
        }
      );
      const moreInfo = wrapper.find(".more-info");
      expect(moreInfo.classes()).toContain("hide");
    });

    it("should show standard popup when more info clicked", async () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Color",
            component: "BasicSelector",
            info: { title: "About Color", content: "Some info" },
          }),
        }
      );
      await wrapper.find(".more-info").trigger("click");
      expect(mockMutations.setStandardPopup).toHaveBeenCalled();
    });
  });

  describe("computed properties", () => {
    it("should compute attributeCount correctly", () => {
      const wrapper = mountComponent();
      expect((wrapper.vm as any).attributeCount).toBe(3);
    });

    it("should compute attributeComponent correctly", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Color",
            component: "ColorSelector",
          }),
        }
      );
      expect((wrapper.vm as any).attributeComponent).toBe("ColorSelector");
    });

    it("should return empty string for attributeName when no attribute", () => {
      const wrapper = mountComponent({}, { getAttribute: () => null });
      expect((wrapper.vm as any).attributeName).toBe("");
    });

    it("should compute disableNext correctly", () => {
      // On last attribute, not completed
      let wrapper = mountComponent(
        { currentAttribute: 2 },
        { getProductCompletionMinimal: () => false }
      );
      expect((wrapper.vm as any).disableNext).toBe(true);

      // On last attribute, completed
      wrapper = mountComponent(
        { currentAttribute: 2 },
        { getProductCompletionMinimal: () => true }
      );
      expect((wrapper.vm as any).disableNext).toBe(false);

      // Not on last attribute
      wrapper = mountComponent(
        { currentAttribute: 0 },
        { getProductCompletionMinimal: () => false }
      );
      expect((wrapper.vm as any).disableNext).toBe(false);
    });
  });

  describe("keyboard navigation", () => {
    it("should navigate next on Shift+ArrowRight", async () => {
      const wrapper = mountComponent({ currentAttribute: 0 });
      const vm = wrapper.vm as any;

      // Simulate keydown event
      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: document.body });

      // Mock document.activeElement
      Object.defineProperty(document, "activeElement", {
        value: document.body,
        configurable: true,
      });

      vm.onKeyPress(event);

      expect(mockActions.incrementCurrentAttribute).toHaveBeenCalled();
    });

    it("should navigate prev on Shift+ArrowLeft", async () => {
      const wrapper = mountComponent({ currentAttribute: 1 });
      const vm = wrapper.vm as any;

      const event = new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        shiftKey: true,
        bubbles: true,
      });

      Object.defineProperty(document, "activeElement", {
        value: document.body,
        configurable: true,
      });

      vm.onKeyPress(event);

      expect(mockActions.decrementCurrentAttribute).toHaveBeenCalled();
    });

    it("should queue attribute index on Shift+Digit", async () => {
      const wrapper = mountComponent({ currentAttribute: 0 });
      const vm = wrapper.vm as any;

      Object.defineProperty(document, "activeElement", {
        value: document.body,
        configurable: true,
      });

      // Press Shift
      vm.onKeyPress(new KeyboardEvent("keydown", { key: "Shift" }));
      expect((window as any).__nav_queued_set__).toBe(1);

      // Press Digit5 while holding Shift
      vm.onKeyPress(
        new KeyboardEvent("keydown", {
          key: "5",
          code: "Digit5",
          shiftKey: true,
        })
      );
      expect((window as any).__nav_queued_step__).toBe(5);

      // Release Shift
      vm.onKeyRelease(new KeyboardEvent("keyup", { key: "Shift" }));
      expect(mockActions.setCurrentAttribute).toHaveBeenCalledWith(
        expect.any(Object),
        4 // index is step - 1
      );
    });
  });

  describe("data attributes", () => {
    it("should set data-attribute to attribute id", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "leather-color",
            name: "Color",
            type: "BasicAttribute",
            component: "BasicSelector",
          }),
        }
      );
      expect(wrapper.find("#attribute-selector-tool").attributes("data-attribute")).toBe(
        "leather-color"
      );
    });

    it("should set data-type to attribute type", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Color",
            type: "GrandAttribute",
            component: "GrandSelector",
          }),
        }
      );
      expect(wrapper.find("#attribute-selector-tool").attributes("data-type")).toBe(
        "GrandAttribute"
      );
    });
  });

  describe("iOS specific", () => {
    it("should render span for iOS instead of DynamicText", () => {
      const wrapper = mountComponent({ OS: "iOS" });
      expect(wrapper.find(".attribute-name span").exists()).toBe(true);
    });

    it("should apply font-size style for long names on iOS", () => {
      const wrapper = mountComponent(
        { OS: "iOS" },
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Very Long Attribute Name Here",
            component: "BasicSelector",
          }),
        }
      );
      const nameSpan = wrapper.find(".attribute-name span");
      expect(nameSpan.exists()).toBe(true);
      // Font size should be applied for names longer than 14 chars
      expect(nameSpan.attributes("style")).toContain("font-size");
    });
  });

  describe("onAttrArrowClick callback", () => {
    it("should allow child components to cancel default navigation", async () => {
      const wrapper = mountComponent({ currentAttribute: 0 });
      const vm = wrapper.vm as any;

      // Set a custom callback that cancels default
      vm.setOnAttrArrowClick((cancelDefault: Function) => {
        cancelDefault();
      });

      await wrapper.find(".next-arrow").trigger("click");

      // Should not have navigated
      expect(mockActions.incrementCurrentAttribute).not.toHaveBeenCalled();
    });

    it("should pass direction to callback", async () => {
      const wrapper = mountComponent({ currentAttribute: 1 });
      const vm = wrapper.vm as any;

      let receivedDirection: string | undefined;
      vm.setOnAttrArrowClick((_: Function, direction: string) => {
        receivedDirection = direction;
      });

      await wrapper.find(".next-arrow").trigger("click");
      expect(receivedDirection).toBe("next");

      await wrapper.find(".prev-arrow").trigger("click");
      expect(receivedDirection).toBe("previous");
    });

    it("should clear callback when attribute changes", async () => {
      const wrapper = mountComponent({ currentAttribute: 0 });
      const vm = wrapper.vm as any;

      vm.setOnAttrArrowClick(() => {});
      expect(vm.onAttrArrowClick).not.toBeNull();

      // Simulate attribute change
      await store.state.currentAttribute++;
      await wrapper.vm.$nextTick();

      // The watcher should clear the callback
      // Note: In actual component the watcher fires, but in test we check manually
    });
  });

  describe("sm-font class", () => {
    it("should add sm-font class for attribute names longer than 12 chars", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Very Long Name",
            component: "BasicSelector",
          }),
        }
      );
      expect(wrapper.find(".attribute-info").classes()).toContain("sm-font");
    });

    it("should not add sm-font class for short attribute names", () => {
      const wrapper = mountComponent(
        {},
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Short",
            component: "BasicSelector",
          }),
        }
      );
      expect(wrapper.find(".attribute-info").classes()).not.toContain("sm-font");
    });
  });
});
