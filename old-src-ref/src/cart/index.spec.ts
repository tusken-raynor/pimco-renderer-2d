import { describe, it, expect, vi, beforeEach } from "vitest";

// Unmock the cart module for these tests
vi.unmock("@/cart");

// Import after setting up mocks
import cart from "./index";
import woocommerce from "@/woocommerce";
import structure from "@/structure";

describe("cart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addToCart", () => {
    const createMockContext = (overrides = {}) => ({
      woocommerceID: 12345,
      productID: "gloves",
      model: "classic-w",
      objectIDMap: {},
      deviceMeta: "desktop-chrome",
      ...overrides,
    });

    const createMockFilter = () => vi.fn(() => true);

    it("should return html with add-to-cart and quantity inputs", () => {
      // Setup mocks - woocommerce is globally mocked
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext();
      const filter = createMockFilter();

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result).toHaveProperty("html");
      expect(result).toHaveProperty("action");
      expect(result.action).toBe("https://nokona.com/cart/");
      expect(result.html).toContain('name="add-to-cart"');
      expect(result.html).toContain('value="12345"');
      expect(result.html).toContain('name="quantity"');
      expect(result.html).toContain('value="1"');
    });

    it("should include model addon when available", () => {
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-model") return "addon-12345-model-0";
        return null;
      });
      vi.mocked(woocommerce.getOption).mockReturnValue("Classic W Web");
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext();
      const filter = createMockFilter();

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.html).toContain('name="addon-12345-0"');
      expect(result.html).toContain('value="Classic W Web"');
    });

    it("should include series addon when series is provided", () => {
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-series") return "addon-12345-series-0";
        return null;
      });
      vi.mocked(woocommerce.getOption).mockReturnValue("Custom Series");
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext({
        series: {
          name: "Test Series",
          wcvalue: "test-series",
        } as any,
      });
      const filter = createMockFilter();

      cart.addToCart.call(context as any, {}, filter);

      expect(woocommerce.getAddon).toHaveBeenCalledWith("addon-12345-series", "gloves");
    });

    it("should include session ID when provided", () => {
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-configurator-session-id") return "addon-12345-session-0";
        return null;
      });
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext({
        sessionID: "test-session-123",
      });
      const filter = createMockFilter();

      cart.addToCart.call(context as any, {}, filter);

      expect(woocommerce.getAddon).toHaveBeenCalledWith(
        "addon-12345-configurator-session-id",
        "gloves"
      );
    });

    it("should include device meta when addon is available", () => {
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-session-meta") return "addon-12345-meta-0";
        return null;
      });
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext({
        deviceMeta: "mobile-safari",
      });
      const filter = createMockFilter();

      cart.addToCart.call(context as any, {}, filter);

      expect(woocommerce.getAddon).toHaveBeenCalledWith(
        "addon-12345-session-meta",
        "gloves"
      );
    });

    it("should call structure.traverse to process selections", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({ selections: {} });
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext();
      const filter = createMockFilter();
      const productStructure = { selections: { option1: {} } };

      cart.addToCart.call(context as any, productStructure, filter);

      expect(structure.getFilteredStructure).toHaveBeenCalled();
      expect(structure.traverse).toHaveBeenCalled();
    });

    it("should escape quotes in values", () => {
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-model") return "addon-12345-model-0";
        return null;
      });
      vi.mocked(woocommerce.getOption).mockReturnValue('Value with "quotes"');
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext();
      const filter = createMockFilter();

      const result = cart.addToCart.call(context as any, {}, filter);

      // Quotes should be escaped as &quot;
      expect(result.html).toContain("&quot;");
    });

    it("should use new cart endpoint when cartmethod is new", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(woocommerce.getProductName).mockReturnValue("Test Product");
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext({
        objectIDMap: {
          gloves: { name: "Main Product", cartmethod: "new" } as any,
        },
      });
      const filter = createMockFilter();

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.action).toBe("https://nokona.com/wp-json/custom-cart/v1/add-multiple");
      expect(result.body).toBeDefined();
      expect(result.body?.products).toHaveLength(1);
    });

    it("should handle split-product by changing action URL", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext();
      const filter = createMockFilter();

      // Without split product, should use regular cart URL
      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.action).toBe("https://nokona.com/cart/");
    });

    it("should process wcnote from series", () => {
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-note") return "addon-12345-note-0";
        return null;
      });
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext({
        series: {
          name: "Test Series",
          wcvalue: "test-series",
          wcnote: {
            addon: "addon-$pid$-note",
            value: "Special note",
          },
        } as any,
      });
      const filter = createMockFilter();

      cart.addToCart.call(context as any, {}, filter);

      expect(woocommerce.getAddon).toHaveBeenCalledWith("addon-12345-note", "gloves");
    });

    it("should include wcnote value in params when series has wcnote", () => {
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-note") return "addon-12345-note-0";
        return null;
      });
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext({
        series: {
          name: "Test Series",
          wcvalue: "test-series",
          wcnote: {
            addon: "addon-$pid$-note",
            value: "Special note text",
          },
        } as any,
      });
      const filter = createMockFilter();

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.html).toContain('value="Special note text"');
    });
  });

  describe("addToCart return structure", () => {
    it("should always return an object with html and action", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 99999,
        productID: "test-product",
        model: "test-model",
        objectIDMap: {},
        deviceMeta: "",
      };
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(typeof result.html).toBe("string");
      expect(typeof result.action).toBe("string");
      expect(result.action).toMatch(/^https:\/\//);
    });

    it("should format addon names correctly in html output", () => {
      // Test the name transformation: (addon-12345).+(-0)$ -> addon-12345-0
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-model") return "addon-12345-custom-model-option-0";
        return null;
      });
      vi.mocked(woocommerce.getOption).mockReturnValue("Test Value");
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
      };
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      // The regex in the code transforms addon-12345-custom-model-option-0 to addon-12345-0
      expect(result.html).toContain('name="addon-12345-0"');
    });
  });

  describe("new cart method (JSON body)", () => {
    const createMockContext = (overrides = {}) => ({
      woocommerceID: 12345,
      productID: "gloves",
      model: "classic-w",
      objectIDMap: {
        gloves: { name: "Gloves", cartmethod: "new" },
      } as any,
      deviceMeta: "desktop-chrome",
      ...overrides,
    });

    it("should use JSON endpoint when cartmethod is new", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(woocommerce.getProductName).mockReturnValue("Test Product");
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext();
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.action).toBe("https://nokona.com/wp-json/custom-cart/v1/add-multiple");
    });

    it("should return body with products array", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(woocommerce.getProductName).mockReturnValue("Test Product");
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext();
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.body).toBeDefined();
      expect(Array.isArray(result.body?.products)).toBe(true);
      expect(result.body?.products.length).toBeGreaterThanOrEqual(1);
    });

    it("should include product id and quantity in body", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(woocommerce.getProductName).mockReturnValue("Test Product");
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = createMockContext();
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      const mainProduct = result.body?.products[0];
      expect(mainProduct?.id).toBe(12345);
      expect(mainProduct?.quantity).toBe(1);
    });
  });

  describe("virtual products", () => {
    it("should handle options with woocommerceProduct property", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
      };
      const filter = vi.fn(() => true);

      // Should not throw even with complex virtual product scenarios
      expect(() => {
        cart.addToCart.call(context as any, {}, filter);
      }).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle empty objectIDMap", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
      };
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.html).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it("should handle missing series gracefully", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
        series: undefined,
      };
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.html).not.toContain("undefined");
    });

    it("should handle missing sessionID gracefully", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
        sessionID: undefined,
      };
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.html).not.toContain("undefined");
    });

    it("should handle empty product structure", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
      };
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.html).toBeDefined();
    });

    it("should handle modMap when provided", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
        modMap: { "mod-1": "value-1", "mod-2": "value-2" },
      };
      const filter = vi.fn(() => true);

      // Should not throw
      expect(() => {
        cart.addToCart.call(context as any, {}, filter);
      }).not.toThrow();
    });

    it("should handle filter returning false for all options", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({
        color: { value: { id: "red", name: "Red" } },
      });
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
      };
      const filter = vi.fn(() => false); // Filter rejects all

      const result = cart.addToCart.call(context as any, {}, filter);

      expect(result.html).toBeDefined();
    });

    it("should handle special characters in model name", () => {
      vi.mocked(woocommerce.getAddon).mockImplementation((name: string) => {
        if (name === "addon-12345-model") return "addon-12345-model-0";
        return null;
      });
      vi.mocked(woocommerce.getOption).mockReturnValue("Model's \"Special\" Name");
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
      };
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      // Quotes should be escaped
      expect(result.html).toContain("&quot;");
    });

    it("should include all required form fields", () => {
      vi.mocked(woocommerce.getAddon).mockReturnValue(null);
      vi.mocked(structure.getFilteredStructure).mockReturnValue({});
      vi.mocked(structure.traverse).mockImplementation(() => {});

      const context = {
        woocommerceID: 12345,
        productID: "gloves",
        model: "classic-w",
        objectIDMap: {},
        deviceMeta: "",
      };
      const filter = vi.fn(() => true);

      const result = cart.addToCart.call(context as any, {}, filter);

      // Must have add-to-cart and quantity
      expect(result.html).toContain('name="add-to-cart"');
      expect(result.html).toContain('name="quantity"');
    });
  });
});
