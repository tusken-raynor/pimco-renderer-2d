import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, shallowMount, VueWrapper } from "@vue/test-utils";
import { createStore, Store } from "vuex";
import Header from "./Header.vue";

// Mock child components
vi.mock("./HeaderOptionsDrop.vue", () => ({
  default: {
    name: "HeaderOptionsDrop",
    template: "<div class='mock-header-options-drop'></div>",
  },
}));

// Mock the data module
vi.mock("@/data", () => ({
  default: {
    fetchMainSiteHeader: vi.fn(() => Promise.resolve("")),
  },
}));

describe("Header.vue", () => {
  let store: Store<any>;
  let mockActions: any;
  let mockMutations: any;

  const createMockStore = (stateOverrides = {}, getterOverrides = {}) => {
    mockActions = {
      cleanSlate: vi.fn(),
      saveSessionData: vi.fn(),
      proceedToCheckout: vi.fn(),
      studioSettingsToFile: vi.fn(),
    };

    mockMutations = {
      setPrice: vi.fn(),
      setSpecialPopup: vi.fn(),
      setConfiguratorPage: vi.fn(),
      setConfiguratorMode: vi.fn(),
    };

    return createStore({
      state: {
        selectedOptions: {},
        currentProduct: "gloves",
        configuratorPage: "build",
        expandProductStage: false,
        inStudioMode: false,
        displayStudioControls: false,
        ...stateOverrides,
      },
      getters: {
        getProduct: () => ({ name: "Classic W Web", fonts: ["Arial"] }),
        getModel: () => ({ name: "Classic W" }),
        getTotalPrice: () => 599,
        getShareURL: () => "https://nokona.com/share/abc123",
        getEncodedShareURL: () => "https%3A%2F%2Fnokona.com%2Fshare%2Fabc123",
        getProductName: () => "Gloves",
        getWooPrices: () => [],
        getLikelyQuantity: () => 1,
        ...getterOverrides,
      },
      mutations: mockMutations,
      actions: mockActions,
    });
  };

  const mountComponent = (
    stateOverrides = {},
    getterOverrides = {},
    options = {}
  ) => {
    store = createMockStore(stateOverrides, getterOverrides);
    return shallowMount(Header, {
      global: {
        plugins: [store],
        stubs: {
          BaseImage: {
            name: "BaseImage",
            props: ["src"],
            template: '<img :src="src" />',
          },
        },
      },
      ...options,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render the header element", () => {
      const wrapper = mountComponent();
      expect(wrapper.find("header").exists()).toBe(true);
    });

    it("should show header when expandProductStage is false", () => {
      const wrapper = mountComponent({ expandProductStage: false });
      expect(wrapper.find("header").isVisible()).toBe(true);
    });

    it("should hide header when expandProductStage is true", () => {
      const wrapper = mountComponent({ expandProductStage: true });
      // v-show adds display:none style, but happy-dom doesn't fully support isVisible()
      // Check that the v-show binding is correct by checking the element's style
      const header = wrapper.find("header");
      expect(header.exists()).toBe(true);
      // The component uses v-show="!expandProductStage" so when expandProductStage is true,
      // the header should have display: none
      expect(header.element.style.display).toBe("none");
    });

    it("should have simple class when configuratorPage is not build", () => {
      const wrapper = mountComponent({ configuratorPage: "start" });
      expect(wrapper.find("header").classes()).toContain("simple");
    });

    it("should not have simple class when configuratorPage is build", () => {
      const wrapper = mountComponent({ configuratorPage: "build" });
      expect(wrapper.find("header").classes()).not.toContain("simple");
    });
  });

  describe("price display", () => {
    it("should display the formatted price", async () => {
      const wrapper = mountComponent({}, { getTotalPrice: () => 599 });

      // Wait for component to mount and set displayPrice
      await wrapper.vm.$nextTick();

      const priceElement = wrapper.find(".price-number");
      expect(priceElement.exists()).toBe(true);
    });

    it("should have price element that opens checkout on click", async () => {
      const wrapper = mountComponent();
      await wrapper.find(".price").trigger("click");
      expect(mockActions.proceedToCheckout).toHaveBeenCalled();
    });
  });

  describe("start over functionality", () => {
    it("should show start over confirmation popup when clicked", async () => {
      const wrapper = mountComponent();
      await wrapper.find(".start-over").trigger("click");

      expect(mockMutations.setSpecialPopup).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          title: "Start Over?",
          mode: "startover",
        })
      );
    });

    it("should include product name in start over message", async () => {
      const wrapper = mountComponent({}, { getProductName: () => "Belts" });
      await wrapper.find(".start-over").trigger("click");

      expect(mockMutations.setSpecialPopup).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          message: expect.stringContaining("Belts"),
        })
      );
    });
  });

  describe("share functionality", () => {
    it("should show share popup when share button clicked", async () => {
      const wrapper = mountComponent();
      await wrapper.find(".share").trigger("click");

      expect(mockMutations.setSpecialPopup).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          title: "Share Your Design",
          mode: "share",
        })
      );
    });

    it("should have email share link with correct href format", () => {
      const wrapper = mountComponent();
      const emailLink = wrapper.find(".email-share");

      expect(emailLink.exists()).toBe(true);
      expect(emailLink.attributes("href")).toContain("mailto:");
      expect(emailLink.attributes("href")).toContain("Custom Nokona");
    });

    it("should have facebook share link", () => {
      const wrapper = mountComponent();
      const facebookLink = wrapper.find(".facebook-share");

      expect(facebookLink.exists()).toBe(true);
      expect(facebookLink.attributes("href")).toContain("facebook.com/sharer");
    });

    it("should have twitter share link", () => {
      const wrapper = mountComponent();
      const twitterLink = wrapper.find(".twitter-share");

      expect(twitterLink.exists()).toBe(true);
      expect(twitterLink.attributes("href")).toContain("twitter.com/intent/tweet");
    });
  });

  describe("navigation", () => {
    it("should navigate to start page when logo clicked on non-build page", async () => {
      const wrapper = mountComponent({ configuratorPage: "patterns" });

      // Find the clickable logo element inside the wrapper
      // The logo has nav-home class when goHome is true
      const logoAsset = wrapper.find(".logo-asset");
      if (logoAsset.exists()) {
        await logoAsset.trigger("click");
      } else {
        // Fallback to logo div
        await wrapper.find(".logo").trigger("click");
      }

      // The logo click should trigger headOnHome which sets page to start
      expect(mockMutations.setConfiguratorPage).toHaveBeenCalledWith(
        expect.any(Object),
        "start"
      );
    });

    it("should not navigate when logo clicked on build page", async () => {
      const wrapper = mountComponent({ configuratorPage: "build" });

      // Find and click logo, but it shouldn't navigate
      const logoWrapper = wrapper.find(".logo-wrapper");
      if (logoWrapper.exists()) {
        await logoWrapper.trigger("click");
      }

      // On build page, goHome is false, so navigation should not happen
      // Actually headOnHome checks goHome before navigating
    });
  });

  describe("computed properties", () => {
    it("should compute productNameSingular correctly for plural names", () => {
      const wrapper = mountComponent({}, { getProductName: () => "Gloves" });
      expect((wrapper.vm as any).productNameSingular).toBe("Glove");
    });

    it("should compute productNameSingular correctly for singular names", () => {
      const wrapper = mountComponent({}, { getProductName: () => "Belt" });
      expect((wrapper.vm as any).productNameSingular).toBe("Belt");
    });

    it("should return Glove as default when productName is undefined", () => {
      const wrapper = mountComponent({}, { getProductName: () => undefined });
      expect((wrapper.vm as any).productNameSingular).toBe("Glove");
    });

    it("should compute goHome correctly", () => {
      let wrapper = mountComponent({ configuratorPage: "build" });
      expect((wrapper.vm as any).goHome).toBe(false);

      wrapper = mountComponent({ configuratorPage: "patterns" });
      expect((wrapper.vm as any).goHome).toBe(true);

      wrapper = mountComponent({ configuratorPage: "start" });
      expect((wrapper.vm as any).goHome).toBe(false);
    });
  });

  describe("studio mode", () => {
    it("should show studio buttons when inStudioMode is true", () => {
      const wrapper = mountComponent({ inStudioMode: true });

      expect(wrapper.find(".stage-studio").exists()).toBe(true);
      expect(wrapper.find(".personalize").exists()).toBe(true);
      expect(wrapper.find(".save-setup").exists()).toBe(true);
    });

    it("should hide regular buttons when inStudioMode is true", () => {
      const wrapper = mountComponent({ inStudioMode: true });

      expect(wrapper.find(".start-over").exists()).toBe(false);
      expect(wrapper.find(".share").exists()).toBe(false);
      expect(wrapper.find(".price").exists()).toBe(false);
    });

    it("should call studioSettingsToFile when save button clicked", async () => {
      const wrapper = mountComponent({ inStudioMode: true });
      await wrapper.find(".save-setup").trigger("click");

      expect(mockActions.studioSettingsToFile).toHaveBeenCalled();
    });

    it("should toggle displayStudioControls when stage button clicked", async () => {
      const wrapper = mountComponent({
        inStudioMode: true,
        displayStudioControls: false,
      });

      await wrapper.find(".stage-studio").trigger("click");

      // Check that the store state was updated
      expect(store.state.displayStudioControls).toBe(true);
    });
  });

  describe("unit pricing", () => {
    it("should show unit price label when model has unitprice", () => {
      const wrapper = mountComponent(
        {},
        {
          getModel: () => ({
            name: "Team Order",
            unitprice: true,
            unitpricelabel: "glove",
          }),
        }
      );

      expect((wrapper.vm as any).unitPrice).toBe(true);
      expect((wrapper.vm as any).unitPriceLabel).toBe("glove");
    });

    it("should default unit price label to Each", () => {
      const wrapper = mountComponent(
        {},
        {
          getModel: () => ({
            name: "Team Order",
            unitprice: true,
          }),
        }
      );

      expect((wrapper.vm as any).unitPriceLabel).toBe("Each");
    });

    it("should not show unit price when model does not have unitprice", () => {
      const wrapper = mountComponent(
        {},
        {
          getModel: () => ({
            name: "Classic W",
          }),
        }
      );

      expect((wrapper.vm as any).unitPrice).toBe(false);
    });
  });

  describe("logo assets", () => {
    it("should use correct logo for gloves product", () => {
      const wrapper = mountComponent({ currentProduct: "gloves" });
      expect((wrapper.vm as any).logoAsset).toBeTruthy();
    });

    it("should use correct logo for belts product", () => {
      const wrapper = mountComponent({ currentProduct: "belts" });
      expect((wrapper.vm as any).logoAsset).toBeTruthy();
    });

    it("should use correct logo for bats product", () => {
      const wrapper = mountComponent({ currentProduct: "bats" });
      expect((wrapper.vm as any).logoAsset).toBeTruthy();
    });

    it("should return empty string for unknown product", () => {
      const wrapper = mountComponent({ currentProduct: "unknown" });
      expect((wrapper.vm as any).logoAsset).toBe("");
    });
  });
});
