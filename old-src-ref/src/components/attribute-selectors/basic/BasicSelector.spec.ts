import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createStore, Store } from "vuex";
import BasicSelector from "./BasicSelector.vue";

// Use vi.hoisted for mock definitions
const { mockUtils, mockStructure } = vi.hoisted(() => ({
  mockUtils: {
    standardOptionFilter: vi.fn(() => true),
    getNested: vi.fn(),
    getOptionUpcharge: vi.fn(() => 0),
    scrollPresent: vi.fn(),
  },
  mockStructure: {
    branch: vi.fn(() => null),
  },
}));

// Mock dependencies
vi.mock("@/utils", () => ({
  default: mockUtils,
}));

vi.mock("@/structure", () => ({
  default: mockStructure,
  OptionCasing: class MockOptionCasing {
    value: any = null;
    userInteraction = false;
  },
}));

describe("BasicSelector.vue", () => {
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
          "opt-1": { id: "opt-1", name: "Red", graphic: "/red.png" },
          "opt-2": { id: "opt-2", name: "Blue", graphic: "/blue.png" },
          "opt-3": { id: "opt-3", name: "Green", graphic: "/green.png" },
        },
        selectedOptions: {
          gloves: {
            model: "model-1",
            selections: {
              Color: {
                value: { id: "opt-1", name: "Red" },
                userInteraction: false,
              },
            },
          },
        },
        ...stateOverrides,
      },
      getters: {
        getRestrictions: () => ({}),
        getAttribute: () => ({
          id: "attr-color",
          name: "Color",
          type: "BasicAttribute",
          options: ["opt-1", "opt-2", "opt-3"],
        }),
        getIndexedEnablers: () => ({}),
        getWoocommerceMods: () => ({}),
        getBasePrice: () => 599,
        ...getterOverrides,
      },
      mutations: mockMutations,
    });
  };

  const mountComponent = (stateOverrides = {}, getterOverrides = {}) => {
    store = createMockStore(stateOverrides, getterOverrides);
    return shallowMount(BasicSelector, {
      global: {
        plugins: [store],
        stubs: {
          BaseImage: {
            name: "BaseImage",
            props: ["src", "alt"],
            template: '<img :src="src" :alt="alt" />',
          },
        },
      },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  describe("rendering", () => {
    it("should render the basic selector container", () => {
      const wrapper = mountComponent();
      expect(wrapper.find(".basic-selector").exists()).toBe(true);
    });

    it("should render all filtered options", () => {
      const wrapper = mountComponent();
      const options = wrapper.findAll(".option");
      expect(options.length).toBe(3);
    });

    it("should display option names", () => {
      const wrapper = mountComponent();
      const names = wrapper.findAll(".name");
      expect(names[0].text()).toBe("Red");
      expect(names[1].text()).toBe("Blue");
      expect(names[2].text()).toBe("Green");
    });

    it("should render option graphics", () => {
      const wrapper = mountComponent();
      const images = wrapper.findAll(".swatch img");
      expect(images[0].attributes("src")).toBe("/red.png");
    });

    it("should correctly compute selectedOption for marking selection", () => {
      // Mock getNested to return the selected option
      mockUtils.getNested.mockReturnValue({
        value: { id: "opt-1", name: "Red" },
      });

      const wrapper = mountComponent();

      // Test that the computed selectedOption returns the correct value
      expect((wrapper.vm as any).selectedOption).toEqual({
        id: "opt-1",
        name: "Red",
      });
    });

    it("should display nickname when available instead of name", () => {
      const wrapper = mountComponent(
        {
          objectIDMap: {
            "opt-1": { id: "opt-1", name: "Full Name", nickname: "Short", graphic: "/img.png" },
          },
        },
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Test",
            options: ["opt-1"],
          }),
        }
      );
      const name = wrapper.find(".name");
      expect(name.html()).toContain("Short");
    });
  });

  describe("option selection", () => {
    it("should call setSelectedOption when option clicked", async () => {
      const wrapper = mountComponent();
      const option = wrapper.findAll(".option")[1];
      await option.trigger("click");

      expect(mockMutations.setSelectedOption).toHaveBeenCalledWith(
        expect.any(Object),
        {
          attribute: "Color",
          value: { id: "opt-2", name: "Blue", graphic: "/blue.png" },
        }
      );
    });

    it("should select first option when clicked", async () => {
      const wrapper = mountComponent();
      await wrapper.findAll(".option")[0].trigger("click");

      expect(mockMutations.setSelectedOption).toHaveBeenCalledWith(
        expect.any(Object),
        {
          attribute: "Color",
          value: { id: "opt-1", name: "Red", graphic: "/red.png" },
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
          attribute: "Color",
          value: true,
        }
      );
    });

    it("should not set interaction if unmounted before timeout", () => {
      const wrapper = mountComponent();

      // Advance time partially
      vi.advanceTimersByTime(400);

      // Unmount before timer completes
      wrapper.unmount();

      // Advance past the full timer
      vi.advanceTimersByTime(500);

      expect(mockMutations.setOptionInteraction).not.toHaveBeenCalled();
    });
  });

  describe("post title rendering", () => {
    it("should add taller class when any option has posttitle", () => {
      const wrapper = mountComponent(
        {
          objectIDMap: {
            "opt-1": { id: "opt-1", name: "Red", graphic: "/red.png", posttitle: "+$10" },
          },
        },
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Color",
            options: ["opt-1"],
          }),
        }
      );
      expect(wrapper.find(".basic-selector").classes()).toContain("taller");
    });

    it("should not add taller class when no options have posttitle", () => {
      const wrapper = mountComponent();
      expect(wrapper.find(".basic-selector").classes()).not.toContain("taller");
    });

    it("should render post-title div when option has posttitle", () => {
      const wrapper = mountComponent(
        {
          objectIDMap: {
            "opt-1": { id: "opt-1", name: "Red", graphic: "/red.png", posttitle: "+$10" },
          },
        },
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Color",
            options: ["opt-1"],
          }),
        }
      );
      expect(wrapper.find(".post-title").exists()).toBe(true);
      expect(wrapper.find(".post-title").html()).toContain("+$10");
    });
  });

  describe("computed properties", () => {
    it("should return correct attributeKey from attribute name", () => {
      const wrapper = mountComponent();
      expect((wrapper.vm as any).attributeKey).toBe("Color");
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

    it("should return casing when available", () => {
      const wrapper = mountComponent();
      expect((wrapper.vm as any).casing).toBeDefined();
    });

    it("should return null for casing when no selectedOptions", () => {
      const wrapper = mountComponent({ selectedOptions: null });
      expect((wrapper.vm as any).casing).toBeNull();
    });
  });

  describe("filtering", () => {
    it("should filter options using standardOptionFilter", () => {
      // Make filter reject opt-2
      mockUtils.standardOptionFilter.mockImplementation((opt: any) => opt && opt.id !== "opt-2");

      const wrapper = mountComponent();
      const options = wrapper.findAll(".option");

      // Should show 2 options (opt-1 and opt-3, not opt-2)
      expect(options.length).toBe(2);
      expect(options[0].attributes("data-id")).toBe("opt-1");
      expect(options[1].attributes("data-id")).toBe("opt-3");
    });
  });

  describe("posttitle special values", () => {
    it("should replace $upcharge$ with calculated upcharge", () => {
      mockUtils.getOptionUpcharge.mockReturnValue(25);
      mockUtils.getNested.mockReturnValue({
        value: { id: "opt-1" },
        userInteraction: false,
      });

      const wrapper = mountComponent(
        {
          objectIDMap: {
            "opt-1": {
              id: "opt-1",
              name: "Premium",
              graphic: "/img.png",
              posttitle: "Add $upcharge$",
            },
          },
        },
        {
          getAttribute: () => ({
            id: "attr-1",
            name: "Color",
            options: ["opt-1"],
          }),
        }
      );

      const vm = wrapper.vm as any;
      const result = vm.posttitle({
        id: "opt-1",
        name: "Premium",
        posttitle: "Add $upcharge$",
      });
      expect(result).toBe("Add $25");
    });

    it("should remove $upcharge$ placeholder when upcharge is 0", () => {
      mockUtils.getOptionUpcharge.mockReturnValue(0);

      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      const result = vm.posttitle({
        id: "opt-1",
        name: "Standard",
        posttitle: "Price: $upcharge$",
      });
      expect(result).toBe("Price: ");
    });

    it("should return empty string for option without posttitle", () => {
      const wrapper = mountComponent();
      const vm = wrapper.vm as any;

      const result = vm.posttitle({ id: "opt-1", name: "Test" });
      expect(result).toBe("");
    });
  });
});
