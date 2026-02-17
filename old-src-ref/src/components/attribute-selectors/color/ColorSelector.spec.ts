import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createStore, Store } from "vuex";
import ColorSelector from "./ColorSelector.vue";

// Use vi.hoisted for mock definitions
const { mockUtils } = vi.hoisted(() => ({
  mockUtils: {
    standardOptionFilter: vi.fn(() => true),
    getNested: vi.fn(),
    scrollPresent: vi.fn(),
    sanitize: vi.fn((str: string) => str.toLowerCase().replace(/\s+/g, "_")),
  },
}));

// Mock dependencies
vi.mock("@/utils", () => ({
  default: mockUtils,
}));

vi.mock("@/structure", () => ({
  OptionCasing: class MockOptionCasing {
    value: any = null;
    userInteraction = false;
  },
}));

// Note: ColorOption is stubbed by shallowMount, we'll check the component instances

describe("ColorSelector.vue", () => {
  let store: Store<any>;
  let mockMutations: any;

  const createMockStore = (stateOverrides = {}, getterOverrides = {}) => {
    mockMutations = {
      setSelectedOption: vi.fn(),
      setOptionInteraction: vi.fn(),
    };

    return createStore({
      state: {
        currentProduct: "gloves",
        currentAttribute: 0,
        attributes: [],
        products: [{ id: "gloves", name: "Gloves" }],
        objectIDMap: {
          "color-1": { id: "color-1", name: "Red", hex: "#FF0000" },
          "color-2": { id: "color-2", name: "Blue", hex: "#0000FF" },
          "color-3": { id: "color-3", name: "Green", hex: "#00FF00" },
        },
        selectedOptions: {
          gloves: {
            model: "model-1",
            selections: {
              "Thread Color": {
                value: { id: "color-1", name: "Red" },
                userInteraction: false,
              },
            },
          },
        },
        ...stateOverrides,
      },
      getters: {
        getAttribute: () => ({
          id: "attr-thread",
          name: "Thread Color",
          type: "ColorAttribute",
          options: ["color-1", "color-2", "color-3"],
        }),
        getRestrictions: () => ({}),
        getModel: () => ({ name: "Classic W" }),
        getIndexedEnablers: () => ({}),
        ...getterOverrides,
      },
      mutations: mockMutations,
    });
  };

  const mountComponent = (stateOverrides = {}, getterOverrides = {}) => {
    store = createMockStore(stateOverrides, getterOverrides);
    return shallowMount(ColorSelector, {
      global: {
        plugins: [store],
      },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  describe("rendering", () => {
    it("should render the color selector container", () => {
      const wrapper = mountComponent();
      expect(wrapper.find(".color-selector").exists()).toBe(true);
    });

    it("should render all filtered color options", () => {
      const wrapper = mountComponent();
      // When using shallowMount, ColorOption is stubbed - find the stubs
      const options = wrapper.findAllComponents({ name: "color-option" });
      expect(options.length).toBe(3);
    });

    it("should add sanitized attribute key as class", () => {
      const wrapper = mountComponent();
      expect(wrapper.find(".color-selector").classes()).toContain("thread_color");
    });

    it("should have data-component attribute", () => {
      const wrapper = mountComponent();
      expect(wrapper.find(".color-selector").attributes("data-component")).toBeDefined();
    });
  });

  describe("option selection", () => {
    it("should call setSelectedOption when color option clicked", async () => {
      const wrapper = mountComponent();
      const colorOption = wrapper.findAllComponents({ name: "ColorOption" })[1];
      await colorOption.trigger("click");

      expect(mockMutations.setSelectedOption).toHaveBeenCalledWith(
        expect.any(Object),
        {
          attribute: "Thread Color",
          value: { id: "color-2", name: "Blue", hex: "#0000FF" },
        }
      );
    });

    it("should select first color when clicked", async () => {
      const wrapper = mountComponent();
      const colorOption = wrapper.findAllComponents({ name: "ColorOption" })[0];
      await colorOption.trigger("click");

      expect(mockMutations.setSelectedOption).toHaveBeenCalledWith(
        expect.any(Object),
        {
          attribute: "Thread Color",
          value: { id: "color-1", name: "Red", hex: "#FF0000" },
        }
      );
    });
  });

  describe("user interaction tracking", () => {
    it("should set interaction after timeout on mount", async () => {
      mountComponent();

      // Fast-forward past the interaction timer (800ms)
      vi.advanceTimersByTime(800);

      expect(mockMutations.setOptionInteraction).toHaveBeenCalledWith(
        expect.any(Object),
        {
          attribute: "Thread Color",
          value: true,
        }
      );
    });

    it("should not set interaction if unmounted before timeout", () => {
      const wrapper = mountComponent();

      vi.advanceTimersByTime(400);
      wrapper.unmount();
      vi.advanceTimersByTime(500);

      expect(mockMutations.setOptionInteraction).not.toHaveBeenCalled();
    });
  });

  describe("computed properties", () => {
    it("should return correct attributeKey from attribute name", () => {
      const wrapper = mountComponent();
      expect((wrapper.vm as any).attributeKey).toBe("Thread Color");
    });

    it("should return empty string for attributeKey when no attribute", () => {
      const wrapper = mountComponent({}, { getAttribute: () => null });
      expect((wrapper.vm as any).attributeKey).toBe("");
    });

    it("should return empty options array when no attribute", () => {
      const wrapper = mountComponent({}, { getAttribute: () => null });
      expect((wrapper.vm as any).options).toEqual([]);
    });

    it("should return null for selectedOption when no nested value", () => {
      mockUtils.getNested.mockReturnValue(null);

      const wrapper = mountComponent();
      expect((wrapper.vm as any).selectedOption).toBeNull();
    });

    it("should return selected option value when found", () => {
      mockUtils.getNested.mockReturnValue({
        value: { id: "color-2", name: "Blue" },
      });

      const wrapper = mountComponent();
      expect((wrapper.vm as any).selectedOption).toEqual({
        id: "color-2",
        name: "Blue",
      });
    });

    it("should return casing when available", () => {
      const wrapper = mountComponent();
      expect((wrapper.vm as any).casing).toBeDefined();
    });

    it("should return null for casing when no currentProduct", () => {
      const wrapper = mountComponent({ currentProduct: null });
      expect((wrapper.vm as any).casing).toBeNull();
    });

    it("should return null for casing when no selectedOptions", () => {
      const wrapper = mountComponent({ selectedOptions: null });
      expect((wrapper.vm as any).casing).toBeNull();
    });

    it("should return null for casing when no attributeKey", () => {
      const wrapper = mountComponent({}, { getAttribute: () => null });
      expect((wrapper.vm as any).casing).toBeNull();
    });
  });

  describe("filtering", () => {
    it("should filter options using standardOptionFilter", () => {
      // Set up mock before mounting - filter accepts only color-1 and color-3
      mockUtils.standardOptionFilter.mockImplementation((opt: any) =>
        opt && opt.id !== "color-2"
      );

      const wrapper = mountComponent();
      const options = wrapper.findAllComponents({ name: "color-option" });

      // Should show 2 options (color-1 and color-3, not color-2)
      expect(options.length).toBe(2);
    });

    it("should pass current product path to filter", () => {
      // Reset to default accepting filter
      mockUtils.standardOptionFilter.mockImplementation(() => true);
      mountComponent();

      expect(mockUtils.standardOptionFilter).toHaveBeenCalledWith(
        expect.any(Object),
        ["gloves", "selections", "Thread Color"],
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe("selected state", () => {
    it("should correctly compute selectedOption", () => {
      mockUtils.getNested.mockReturnValue({
        value: { id: "color-2", name: "Blue" },
      });

      const wrapper = mountComponent();

      // Test that the computed selectedOption returns the correct value
      expect((wrapper.vm as any).selectedOption).toEqual({
        id: "color-2",
        name: "Blue",
      });
    });
  });

  describe("sanitize method", () => {
    it("should sanitize attribute key for class name", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;
      const result = vm.sanitize("Edge Paint");
      expect(result).toBe("edge_paint");
    });
  });

  describe("props passed to ColorOption", () => {
    it("should pass option prop to ColorOption", () => {
      const wrapper = mountComponent();
      const colorOptions = wrapper.findAllComponents({ name: "color-option" });

      expect(colorOptions[0].props("option")).toEqual({
        id: "color-1",
        name: "Red",
        hex: "#FF0000",
      });
    });

    it("should pass casing prop to ColorOption", () => {
      const wrapper = mountComponent();
      const colorOptions = wrapper.findAllComponents({ name: "color-option" });

      expect(colorOptions[0].props("casing")).toBeDefined();
    });
  });
});
