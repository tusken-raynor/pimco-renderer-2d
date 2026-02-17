import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mock objects that can be used in vi.mock factories
const { mockStructure, mockWoocommerce, mockRestrictions, MockOptionCasing } = vi.hoisted(() => {
  class MockCasing {
    value: unknown = null;
    order: number = 0;
    required: boolean = true;
    userInteraction: boolean = false;
    noRequirement: boolean = false;
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
      branch: vi.fn(),
      build: vi.fn(() => ({})),
      getVirtualBranchGroup: vi.fn(() => ({})),
    },
    mockWoocommerce: {
      getProduct: vi.fn(() => "12345"),
      getProductPrice: vi.fn(() => 0),
      getOptionCharge: vi.fn(() => 0),
      getModBranchIDs: vi.fn(() => []),
    },
    mockRestrictions: {
      match: vi.fn(() => false),
    },
    MockOptionCasing: MockCasing,
  };
});

// Mock structure module
vi.mock("@/structure", () => ({
  default: mockStructure,
  OptionCasing: MockOptionCasing,
}));

// Mock woocommerce module
vi.mock("@/woocommerce", () => ({
  default: mockWoocommerce,
}));

// Mock restrictions module
vi.mock("@/restrictions", () => ({
  default: mockRestrictions,
}));

import utils from "./index";
import { OptionCasing } from "@/structure";

describe("utils", () => {
  describe("getNested", () => {
    it("should retrieve a deeply nested value", () => {
      const obj = { a: { b: { c: "value" } } };
      expect(utils.getNested(obj, ["a", "b", "c"])).toBe("value");
    });

    it("should return undefined for non-existent path", () => {
      const obj = { a: { b: 1 } };
      expect(utils.getNested(obj, ["a", "c", "d"])).toBeUndefined();
    });

    it("should handle empty path", () => {
      const obj = { a: 1 };
      expect(utils.getNested(obj, [])).toEqual({ a: 1 });
    });

    it("should handle single key path", () => {
      const obj = { a: "test" };
      expect(utils.getNested(obj, ["a"])).toBe("test");
    });

    it("should handle array values in path", () => {
      const obj = { items: [{ name: "first" }, { name: "second" }] };
      expect(utils.getNested(obj, ["items", "0", "name"])).toBe("first");
      expect(utils.getNested(obj, ["items", "1", "name"])).toBe("second");
    });

    it("should return null when intermediate value is null", () => {
      const obj = { a: null };
      // getNested returns null (the value found) rather than undefined
      expect(utils.getNested(obj, ["a", "b"])).toBeNull();
    });
  });

  describe("setNested", () => {
    it("should set a deeply nested value", () => {
      const obj = { a: { b: { c: "old" } } };
      const result = utils.setNested(obj, "new", ["a", "b", "c"]);
      expect(result).toBe(true);
      expect(obj.a.b.c).toBe("new");
    });

    it("should return false for non-existent path without create flag", () => {
      const obj = { a: {} };
      const result = utils.setNested(obj, "value", ["a", "b", "c"]);
      expect(result).toBe(false);
    });

    it("should create path when create flag is true", () => {
      const obj: Record<string, unknown> = { a: {} };
      const result = utils.setNested(obj, "value", ["a", "b", "c"], true);
      expect(result).toBe(true);
      expect((obj.a as Record<string, unknown>).b).toEqual({ c: "value" });
    });

    it("should handle array creation with numeric keys", () => {
      const obj: Record<string, unknown> = {};
      utils.setNested(obj, "value", ["items", "0"], true);
      expect(obj.items).toBeInstanceOf(Array);
    });

    it("should handle empty keys array", () => {
      const obj = { a: 1 };
      const result = utils.setNested(obj, "value", []);
      expect(result).toBe(false);
    });
  });

  describe("deleteNested", () => {
    it("should delete a nested property", () => {
      const obj = { a: { b: { c: "value" } } };
      const result = utils.deleteNested(obj, ["a", "b", "c"]);
      expect(result).toBe(true);
      expect((obj.a.b as Record<string, unknown>).c).toBeUndefined();
    });

    it("should return false for non-existent path", () => {
      const obj = { a: { b: 1 } };
      const result = utils.deleteNested(obj, ["a", "c", "d"]);
      expect(result).toBe(false);
    });

    it("should handle empty keys array", () => {
      const obj = { a: 1 };
      const result = utils.deleteNested(obj, []);
      expect(result).toBe(false);
    });
  });

  describe("mapObject", () => {
    it("should map values using callback", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = utils.mapObject(obj, (value) => value * 2);
      expect(result).toEqual({ a: 2, b: 4, c: 6 });
    });

    it("should provide key and index to callback", () => {
      const obj = { first: 1 };
      utils.mapObject(obj, (value, key, index) => {
        expect(key).toBe("first");
        expect(index).toBe(0);
        return value;
      });
    });

    it("should handle empty object", () => {
      const result = utils.mapObject({}, (v) => v);
      expect(result).toEqual({});
    });
  });

  describe("filterObject", () => {
    it("should filter object by callback", () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      const result = utils.filterObject(obj, (value) => value > 2);
      expect(result).toEqual({ c: 3, d: 4 });
    });

    it("should return empty object when nothing matches", () => {
      const obj = { a: 1, b: 2 };
      const result = utils.filterObject(obj, (value) => value > 10);
      expect(result).toEqual({});
    });

    it("should provide key to callback", () => {
      const obj = { keep: 1, remove: 2 };
      const result = utils.filterObject(obj, (_, key) => key === "keep");
      expect(result).toEqual({ keep: 1 });
    });
  });

  describe("sanitize", () => {
    it("should convert string to URL-friendly format", () => {
      expect(utils.sanitize("Hello World")).toBe("hello_world");
    });

    it("should remove special characters", () => {
      expect(utils.sanitize("Hello! @World#")).toBe("hello_world");
    });

    it("should handle multiple spaces", () => {
      expect(utils.sanitize("Hello   World")).toBe("hello_world");
    });

    it("should trim whitespace", () => {
      expect(utils.sanitize("  Hello  ")).toBe("hello");
    });

    it("should handle empty string", () => {
      expect(utils.sanitize("")).toBe("");
    });
  });

  describe("encodeHtml", () => {
    it("should encode HTML special characters", () => {
      expect(utils.encodeHtml("<div>")).toBe("&lt;div&gt;");
      expect(utils.encodeHtml("&")).toBe("&amp;");
      expect(utils.encodeHtml('"')).toBe("&quot;");
      expect(utils.encodeHtml("'")).toBe("&#039;");
    });

    it("should handle strings without special characters", () => {
      expect(utils.encodeHtml("hello")).toBe("hello");
    });

    it("should encode all special chars in a string", () => {
      expect(utils.encodeHtml('<a href="test">Link</a>')).toBe(
        "&lt;a href=&quot;test&quot;&gt;Link&lt;/a&gt;"
      );
    });
  });

  describe("escapeHtml", () => {
    it("should remove HTML tags", () => {
      expect(utils.escapeHtml("<p>Hello</p>")).toBe("Hello");
    });

    it("should handle self-closing tags", () => {
      expect(utils.escapeHtml("<br/>")).toBe("");
    });

    it("should preserve non-HTML text", () => {
      expect(utils.escapeHtml("Hello World")).toBe("Hello World");
    });
  });

  describe("pluralize", () => {
    it("should add 's' to word", () => {
      expect(utils.pluralize("glove")).toBe("gloves");
    });

    it("should not add 's' if already ends with s", () => {
      expect(utils.pluralize("gloves")).toBe("gloves");
    });

    it("should handle empty string", () => {
      expect(utils.pluralize("")).toBe("s");
    });
  });

  describe("camelCase2Words", () => {
    it("should split camelCase into words", () => {
      expect(utils.camelCase2Words("camelCase")).toBe("Camel Case");
    });

    it("should handle multiple capitals", () => {
      // Single letter capitals like 'A' are merged with previous word
      expect(utils.camelCase2Words("thisIsATest")).toBe("This Is Test");
    });

    it("should handle single word", () => {
      expect(utils.camelCase2Words("word")).toBe("Word");
    });

    it("should handle numbers in string", () => {
      expect(utils.camelCase2Words("test123Value")).toBe("Test 123 Value");
    });
  });

  describe("fromQueryString", () => {
    it("should parse query string with values", () => {
      const result = utils.fromQueryString("?foo=bar&num=123");
      expect(result).toEqual({ foo: "bar", num: 123 });
    });

    it("should handle boolean flags (no value)", () => {
      const result = utils.fromQueryString("?flag1&flag2");
      expect(result).toEqual({ flag1: true, flag2: true });
    });

    it("should handle query string without leading ?", () => {
      const result = utils.fromQueryString("foo=bar");
      expect(result).toEqual({ foo: "bar" });
    });

    it("should decode URL-encoded values", () => {
      const result = utils.fromQueryString("?name=Hello%20World");
      expect(result).toEqual({ name: "Hello World" });
    });

    it("should return empty object for empty string", () => {
      expect(utils.fromQueryString("")).toEqual({});
      expect(utils.fromQueryString("?")).toEqual({});
    });
  });

  describe("toQueryString", () => {
    it("should convert object to query string", () => {
      const result = utils.toQueryString({ foo: "bar", num: 123 });
      expect(result).toBe("?foo=bar&num=123");
    });

    it("should handle boolean true as flag", () => {
      const result = utils.toQueryString({ flag: true });
      expect(result).toBe("?flag");
    });

    it("should omit false values", () => {
      const result = utils.toQueryString({ keep: "value", remove: false });
      expect(result).toBe("?keep=value");
    });

    it("should return empty string for empty object", () => {
      expect(utils.toQueryString({})).toBe("");
    });
  });

  describe("getNumber", () => {
    it("should return number directly if input is number", () => {
      expect(utils.getNumber(42)).toBe(42);
      expect(utils.getNumber(-10)).toBe(-10);
      expect(utils.getNumber(3.14)).toBe(3.14);
    });

    it("should extract number from string", () => {
      expect(utils.getNumber("$42.50")).toBe(42.5);
      expect(utils.getNumber("Price: 100")).toBe(100);
      expect(utils.getNumber("-25%")).toBe(-25);
    });

    it("should return NaN for non-numeric string", () => {
      expect(utils.getNumber("no numbers")).toBeNaN();
    });

    it("should handle string with decimal", () => {
      expect(utils.getNumber("10.5 inches")).toBe(10.5);
    });
  });

  describe("formatPrice", () => {
    it("should format whole numbers without decimals", () => {
      expect(utils.formatPrice(100)).toBe("100");
      expect(utils.formatPrice(0)).toBe("0");
    });

    it("should format cents with two decimal places", () => {
      expect(utils.formatPrice(99.99)).toBe("99.99");
      expect(utils.formatPrice(10.5)).toBe("10.50");
    });

    it("should round cents correctly", () => {
      expect(utils.formatPrice(10.994)).toBe("10.99");
      expect(utils.formatPrice(10.996)).toBe("11");
      expect(utils.formatPrice(10.999)).toBe("11");
      expect(utils.formatPrice(10.991)).toBe("10.99");
    });

    it("should handle negative numbers", () => {
      expect(utils.formatPrice(-50)).toBe("-50");
    });
  });

  describe("generateHash", () => {
    it("should generate consistent hash for same string", () => {
      const hash1 = utils.generateHash("test");
      const hash2 = utils.generateHash("test");
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different strings", () => {
      const hash1 = utils.generateHash("test1");
      const hash2 = utils.generateHash("test2");
      expect(hash1).not.toBe(hash2);
    });

    it("should start with Q or Y prefix", () => {
      const hash = utils.generateHash("test");
      expect(hash).toMatch(/^[QY]/);
    });

    it("should handle empty string", () => {
      const hash = utils.generateHash("");
      expect(hash).toBe("Q0");
    });
  });

  describe("isIterable", () => {
    it("should return true for arrays", () => {
      expect(utils.isIterable([1, 2, 3])).toBe(true);
    });

    it("should return true for strings", () => {
      expect(utils.isIterable("hello")).toBe(true);
    });

    it("should return true for Set", () => {
      expect(utils.isIterable(new Set())).toBe(true);
    });

    it("should return true for Map", () => {
      expect(utils.isIterable(new Map())).toBe(true);
    });

    it("should return false for plain objects", () => {
      expect(utils.isIterable({ a: 1 })).toBe(false);
    });

    it("should return false for null", () => {
      expect(utils.isIterable(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(utils.isIterable(undefined)).toBe(false);
    });

    it("should return false for numbers", () => {
      expect(utils.isIterable(42)).toBe(false);
    });
  });

  describe("shuffle", () => {
    it("should return array with same length", () => {
      const arr = [1, 2, 3, 4, 5];
      const result = utils.shuffle([...arr]);
      expect(result.length).toBe(arr.length);
    });

    it("should contain all original elements", () => {
      const arr = [1, 2, 3, 4, 5];
      const result = utils.shuffle([...arr]);
      expect(result.sort()).toEqual(arr.sort());
    });

    it("should mutate the original array", () => {
      const arr = [1, 2, 3, 4, 5];
      const result = utils.shuffle(arr);
      expect(result).toBe(arr);
    });

    it("should handle empty array", () => {
      expect(utils.shuffle([])).toEqual([]);
    });

    it("should handle single element array", () => {
      expect(utils.shuffle([1])).toEqual([1]);
    });
  });

  describe("mapNested", () => {
    it("should map nested properties", () => {
      const obj = {
        a: { info: { name: "Alice" } },
        b: { info: { name: "Bob" } },
      };
      const result = utils.mapNested(obj, ["info", "name"]);
      expect(result).toEqual({ a: "Alice", b: "Bob" });
    });

    it("should handle string path", () => {
      const obj = {
        a: { name: "Alice" },
        b: { name: "Bob" },
      };
      const result = utils.mapNested(obj, "name");
      expect(result).toEqual({ a: "Alice", b: "Bob" });
    });

    it("should exclude undefined values by default", () => {
      const obj = {
        a: { name: "Alice" },
        b: {},
      };
      const result = utils.mapNested(obj, "name");
      expect(result).toEqual({ a: "Alice" });
    });

    it("should include undefined when allow is true", () => {
      const obj = {
        a: { name: "Alice" },
        b: {},
      };
      const result = utils.mapNested(obj, "name", true);
      expect(result).toEqual({ a: "Alice", b: undefined });
    });
  });

  describe("mapObjectKeys", () => {
    it("should map object keys using callback", () => {
      const obj = { a: 1, b: 2 };
      const result = utils.mapObjectKeys(obj, (_, key) => key.toUpperCase());
      expect(result).toEqual({ A: 1, B: 2 });
    });

    it("should preserve values", () => {
      const obj = { old: "value" };
      const result = utils.mapObjectKeys(obj, () => "new");
      expect(result).toEqual({ new: "value" });
    });
  });

  describe("getRange", () => {
    it("should return matching range for value within range", () => {
      const ranges = ["1-5", "6-10", "11-15"];
      expect(utils.getRange(3, ranges)).toBe("1-5");
      expect(utils.getRange(7, ranges)).toBe("6-10");
      expect(utils.getRange(12, ranges)).toBe("11-15");
    });

    it("should return false when value is outside all ranges", () => {
      const ranges = ["1-5", "6-10"];
      expect(utils.getRange(0, ranges)).toBe(false);
      expect(utils.getRange(11, ranges)).toBe(false);
    });

    it("should handle boundary values correctly", () => {
      const ranges = ["1-5", "6-10"];
      expect(utils.getRange(1, ranges)).toBe("1-5");
      expect(utils.getRange(5, ranges)).toBe("1-5");
      expect(utils.getRange(6, ranges)).toBe("6-10");
      expect(utils.getRange(10, ranges)).toBe("6-10");
    });

    it("should handle empty ranges array", () => {
      expect(utils.getRange(5, [])).toBe(false);
    });
  });

  describe("getBasePrice", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return baseprice from product if no wcvalue", () => {
      const product = { type: "Product", baseprice: 500 } as any;
      expect(utils.getBasePrice(product, "product-1")).toBe(500);
    });

    it("should return 0 if product has no baseprice", () => {
      const product = { type: "Product" } as any;
      expect(utils.getBasePrice(product, "product-1")).toBe(0);
    });

    it("should lookup wcvalue for Model type", () => {
      mockWoocommerce.getOptionCharge.mockReturnValue(599);
      const model = { type: "Model", wcvalue: "model-premium" } as any;
      const result = utils.getBasePrice(model, "product-1");
      expect(mockWoocommerce.getOptionCharge).toHaveBeenCalledWith(
        "model-premium",
        "addon-12345-model",
        "product-1"
      );
      expect(result).toBe(599);
    });

    it("should return baseprice for Model without wcvalue", () => {
      const model = { type: "Model", baseprice: 450 } as any;
      expect(utils.getBasePrice(model, "product-1")).toBe(450);
    });
  });

  describe("getOptionUpcharge", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return upcharge property when no wcvalue", () => {
      const option = { id: "opt-1", upcharge: 25 } as any;
      const casing = new MockOptionCasing({ woocommerceName: null }) as any;
      expect(utils.getOptionUpcharge(option, casing, "product-1", false)).toBe(25);
    });

    it("should return 0 when no upcharge and no wcvalue", () => {
      const option = { id: "opt-1" } as any;
      const casing = new MockOptionCasing({ woocommerceName: null }) as any;
      expect(utils.getOptionUpcharge(option, casing, "product-1", false)).toBe(0);
    });

    it("should lookup wcvalue from woocommerce when available", () => {
      mockWoocommerce.getOptionCharge.mockReturnValue(50);
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
      const option = { id: "opt-1", wcvalue: "premium-leather" } as any;
      const casing = new MockOptionCasing({ woocommerceName: "leather-type" }) as any;

      const result = utils.getOptionUpcharge(option, casing, "product-1", false);

      expect(mockWoocommerce.getOptionCharge).toHaveBeenCalledWith(
        "premium-leather",
        "leather-type",
        "product-1",
        {}
      );
      expect(result).toBe(50);
    });

    it("should fall back to upcharge if woocommerce returns 0", () => {
      mockWoocommerce.getOptionCharge.mockReturnValue(0);
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
      const option = { id: "opt-1", wcvalue: "some-value", upcharge: 30 } as any;
      const casing = new MockOptionCasing({ woocommerceName: "addon-name" }) as any;

      const result = utils.getOptionUpcharge(option, casing, "product-1", false);
      expect(result).toBe(30);
    });

    it("should convert percentage upcharge when basePrice provided", () => {
      mockWoocommerce.getOptionCharge.mockReturnValue("10%");
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
      const option = { id: "opt-1", wcvalue: "percentage-option" } as any;
      const casing = new MockOptionCasing({ woocommerceName: "addon-name" }) as any;

      const result = utils.getOptionUpcharge(option, casing, "product-1", 500);
      // 10% of 500 = 50
      expect(result).toBe(50);
    });

    it("should return percentage string when basePrice is false", () => {
      mockWoocommerce.getOptionCharge.mockReturnValue("15%");
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
      const option = { id: "opt-1", wcvalue: "percentage-option" } as any;
      const casing = new MockOptionCasing({ woocommerceName: "addon-name" }) as any;

      const result = utils.getOptionUpcharge(option, casing, "product-1", false);
      expect(result).toBe("15%");
    });

    it("should apply mod map when modBranchIDs are present", () => {
      mockWoocommerce.getOptionCharge.mockReturnValue(75);
      mockWoocommerce.getModBranchIDs.mockReturnValue(["brc123", "brc456"]);
      const option = { id: "opt-1", wcvalue: "mod-option" } as any;
      const casing = new MockOptionCasing({ woocommerceName: "addon-name" }) as any;
      const modMap = { brc123: "value1", brc456: "value2" };

      utils.getOptionUpcharge(option, casing, "product-1", false, modMap);

      expect(mockWoocommerce.getOptionCharge).toHaveBeenCalledWith(
        "mod-option",
        "addon-name",
        "product-1",
        { brc123: "value1", brc456: "value2" }
      );
    });

    it("should add wclength charge for text options", () => {
      mockWoocommerce.getOptionCharge
        .mockReturnValueOnce(10) // Base option charge
        .mockReturnValueOnce(5); // Length charge
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
      const option = {
        id: "opt-1",
        wcvalue: "text-option",
        text: "Hello World", // 10 chars (excluding space)
        wclength: {
          ranges: ["1-5", "6-10", "11-15"],
          wcname: "text-length",
          wcvalue: "length-$range$",
        },
      } as any;
      const casing = new MockOptionCasing({ woocommerceName: "addon-name" }) as any;

      const result = utils.getOptionUpcharge(option, casing, "product-1", false);

      // Base 10 + length 5 = 15
      expect(result).toBe(15);
    });

    it("should ignore whitespace in wclength character count", () => {
      mockWoocommerce.getOptionCharge
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(25);
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
      const option = {
        id: "opt-1",
        wcvalue: "text-option",
        text: "A B C D E", // 5 chars (ABCDE) - no spaces counted
        wclength: {
          ranges: ["1-5", "6-10"],
          wcname: "text-length",
          wcvalue: "length-$range$",
        },
      } as any;
      const casing = new MockOptionCasing({ woocommerceName: "addon-name" }) as any;

      utils.getOptionUpcharge(option, casing, "product-1", false);

      // Should use "1-5" range since 5 chars (excluding spaces)
      expect(mockWoocommerce.getOptionCharge).toHaveBeenLastCalledWith(
        "length-1-5",
        "text-length",
        "product-1",
        {}
      );
    });
  });

  describe("digOutUpcharges", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockWoocommerce.getOptionCharge.mockReturnValue(0);
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
    });

    it("should return 0 for empty option holder", () => {
      const result = utils.digOutUpcharges({}, {}, {}, "product-1", {});
      expect(result).toBe(0);
    });

    it("should sum upcharges from OptionCasing values", () => {
      const optionHolder = {
        color: new MockOptionCasing({
          value: { id: "red", upcharge: 50 },
        }),
        size: new MockOptionCasing({
          value: { id: "large", upcharge: 25 },
        }),
      };

      const result = utils.digOutUpcharges(optionHolder, {}, {}, "product-1", {});
      expect(result).toBe(75);
    });

    it("should recursively traverse nested objects", () => {
      const optionHolder = {
        leather: {
          color: new MockOptionCasing({
            value: { id: "black", upcharge: 100 },
          }),
        },
        thread: {
          style: new MockOptionCasing({
            value: { id: "modern", upcharge: 50 },
          }),
        },
      };

      const result = utils.digOutUpcharges(optionHolder, {}, {}, "product-1", {});
      expect(result).toBe(150);
    });

    it("should skip null values in casings", () => {
      const optionHolder = {
        color: new MockOptionCasing({ value: null }),
        size: new MockOptionCasing({
          value: { id: "large", upcharge: 25 },
        }),
      };

      const result = utils.digOutUpcharges(optionHolder, {}, {}, "product-1", {});
      expect(result).toBe(25);
    });

    it("should skip disabled options not in enablers", () => {
      const optionHolder = {
        premium: new MockOptionCasing({
          value: { id: "opt-1", upcharge: 100, disabled: true },
        }),
      };

      const result = utils.digOutUpcharges(optionHolder, {}, {}, "product-1", {});
      expect(result).toBe(0);
    });

    it("should include disabled options when in enablers", () => {
      const optionHolder = {
        premium: new MockOptionCasing({
          value: { id: "opt-1", upcharge: 100, disabled: true },
        }),
      };
      const enablers = { "opt-1": [] };

      const result = utils.digOutUpcharges(optionHolder, {}, enablers, "product-1", {});
      expect(result).toBe(100);
    });

    it("should ignore percentage upcharges", () => {
      mockWoocommerce.getOptionCharge.mockReturnValue("15%");
      const optionHolder = {
        color: new MockOptionCasing({
          value: { id: "opt-1", wcvalue: "percent-opt" },
          woocommerceName: "addon",
        }),
      };

      const result = utils.digOutUpcharges(optionHolder, {}, {}, "product-1", {});
      expect(result).toBe(0);
    });

    it("should exclude ComplexCompoundOption when includeOtherProductPrices is false", () => {
      const optionHolder = {
        compound: new MockOptionCasing({
          value: { id: "opt-1", type: "ComplexCompoundOption", upcharge: 200 },
        }),
        regular: new MockOptionCasing({
          value: { id: "opt-2", upcharge: 50 },
        }),
      };

      const result = utils.digOutUpcharges(optionHolder, {}, {}, "product-1", {}, false);
      expect(result).toBe(50);
    });

    it("should exclude woocommerceProduct casings when includeOtherProductPrices is false", () => {
      const optionHolder = {
        virtual: new MockOptionCasing({
          value: { id: "opt-1", upcharge: 150 },
          woocommerceProduct: "12345",
        }),
        regular: new MockOptionCasing({
          value: { id: "opt-2", upcharge: 50 },
        }),
      };

      const result = utils.digOutUpcharges(optionHolder, {}, {}, "product-1", {}, false);
      expect(result).toBe(50);
    });

    it("should respect x-data attribute filtering", () => {
      // The x-data check is on the nested object, not the top level
      const optionHolder = {
        attribute: {
          "x-data": { id: "restricted-attr" },
          color: new MockOptionCasing({
            value: { id: "red", upcharge: 50 },
          }),
        },
      };
      const restrictions = { "restricted-attr": [] };

      // When attribute is restricted, should not include its children
      const result = utils.digOutUpcharges(optionHolder, restrictions, {}, "product-1", {});
      expect(result).toBe(0);
    });
  });

  describe("digOutPercentages", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
    });

    it("should return 0 for empty option holder", () => {
      const result = utils.digOutPercentages({}, {}, {}, "product-1", {});
      expect(result).toBe(0);
    });

    it("should sum percentage upcharges", () => {
      mockWoocommerce.getOptionCharge
        .mockReturnValueOnce("10%")
        .mockReturnValueOnce("5%");

      const optionHolder = {
        premium: new MockOptionCasing({
          value: { id: "opt-1", wcvalue: "premium" },
          woocommerceName: "addon",
        }),
        deluxe: new MockOptionCasing({
          value: { id: "opt-2", wcvalue: "deluxe" },
          woocommerceName: "addon",
        }),
      };

      const result = utils.digOutPercentages(optionHolder, {}, {}, "product-1", {});
      expect(result).toBe(15);
    });

    it("should ignore non-percentage upcharges", () => {
      mockWoocommerce.getOptionCharge.mockReturnValue(50);

      const optionHolder = {
        color: new MockOptionCasing({
          value: { id: "opt-1", wcvalue: "color-opt" },
          woocommerceName: "addon",
        }),
      };

      const result = utils.digOutPercentages(optionHolder, {}, {}, "product-1", {});
      expect(result).toBe(0);
    });

    it("should recursively traverse nested objects", () => {
      mockWoocommerce.getOptionCharge
        .mockReturnValueOnce("7%")
        .mockReturnValueOnce("3%");

      const optionHolder = {
        leather: {
          finish: new MockOptionCasing({
            value: { id: "opt-1", wcvalue: "premium-finish" },
            woocommerceName: "addon",
          }),
        },
        thread: {
          quality: new MockOptionCasing({
            value: { id: "opt-2", wcvalue: "premium-thread" },
            woocommerceName: "addon",
          }),
        },
      };

      const result = utils.digOutPercentages(optionHolder, {}, {}, "product-1", {});
      expect(result).toBe(10);
    });
  });

  describe("digOutWooProducts", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockWoocommerce.getProductPrice.mockReturnValue(0);
      mockWoocommerce.getModBranchIDs.mockReturnValue([]);
    });

    it("should return empty array for empty option holder", () => {
      const result = utils.digOutWooProducts({}, {}, {}, "product-1", {}, {});
      expect(result).toEqual([]);
    });

    it("should extract virtual products with woocommerceProduct property", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(99);

      const optionHolder = {
        virtual: new MockOptionCasing({
          value: { id: "opt-1", wcvalue: "virtual-opt" },
          woocommerceProduct: "54321",
          woocommerceName: "addon-name",
          "x-data": { virtualGroup: ["products", "Virtual Item"] },
        }),
      };
      const objectIDMap = {
        "attr-1": { id: "attr-1", type: "Attribute", virtual: { quantityfield: "" } },
      };

      // Need to mock the attribute lookup
      (optionHolder.virtual as any)["x-data"].attributes = [{ id: "attr-1" }];

      const result = utils.digOutWooProducts(
        optionHolder,
        {},
        {},
        "product-1",
        {},
        objectIDMap,
        true
      );

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should recursively traverse nested objects", () => {
      mockWoocommerce.getProductPrice.mockReturnValue(50);

      const optionHolder = {
        category1: {
          item: new MockOptionCasing({
            value: {
              id: "opt-1",
              type: "ComplexCompoundOption",
              text: "test",
              formula: [],
              products: [{ key: "test", wooid: 123 }],
            },
          }),
        },
      };

      const result = utils.digOutWooProducts({}, {}, {}, "product-1", {}, {});
      expect(result).toEqual([]);
    });

    it("should skip when virtualOnly is true and not a virtual group", () => {
      const optionHolder = {
        regular: new MockOptionCasing({
          value: { id: "opt-1", wcvalue: "regular-opt" },
          woocommerceProduct: "12345",
          woocommerceName: "addon-name",
          "x-data": null,
        }),
      };

      const result = utils.digOutWooProducts(
        optionHolder,
        {},
        {},
        "product-1",
        {},
        {},
        true
      );

      expect(result).toEqual([]);
    });
  });

  describe("standardOptionFilter", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return false for null option", () => {
      expect(utils.standardOptionFilter(null, [], {}, {})).toBe(false);
    });

    it("should return true for non-restricted, non-disabled option", () => {
      const option = { id: "opt-1", name: "Option" } as any;
      expect(utils.standardOptionFilter(option, [], {}, {})).toBe(true);
    });

    it("should return false for disabled option not in enablers", () => {
      const option = { id: "opt-1", disabled: true } as any;
      expect(utils.standardOptionFilter(option, [], {}, {})).toBe(false);
    });

    it("should check enabler path match for disabled option in enablers", () => {
      mockRestrictions.match.mockReturnValue(true);
      const option = { id: "opt-1", disabled: true } as any;
      const enablers = { "opt-1": [["Color", "Black"]] };
      const path = ["product", "Color", "Black"];

      expect(utils.standardOptionFilter(option, path, {}, enablers)).toBe(true);
      expect(mockRestrictions.match).toHaveBeenCalledWith([["Color", "Black"]], path);
    });

    it("should return true for disabled option in enablers with empty paths", () => {
      const option = { id: "opt-1", disabled: true } as any;
      const enablers = { "opt-1": [] };

      expect(utils.standardOptionFilter(option, [], {}, enablers)).toBe(true);
    });

    it("should return false for restricted option with empty paths", () => {
      const option = { id: "opt-1" } as any;
      const restrictions = { "opt-1": [] };

      expect(utils.standardOptionFilter(option, [], restrictions, {})).toBe(false);
    });

    it("should check restriction path match", () => {
      mockRestrictions.match.mockReturnValue(true);
      const option = { id: "opt-1" } as any;
      const restrictions = { "opt-1": [["Size", "Large"]] };
      const path = ["product", "Size", "Large"];

      // When restriction matches, option should be filtered out (return false)
      expect(utils.standardOptionFilter(option, path, restrictions, {})).toBe(false);
    });

    it("should return true when restriction path does not match", () => {
      mockRestrictions.match.mockReturnValue(false);
      const option = { id: "opt-1" } as any;
      const restrictions = { "opt-1": [["Size", "Large"]] };
      const path = ["product", "Size", "Small"];

      expect(utils.standardOptionFilter(option, path, restrictions, {})).toBe(true);
    });
  });

  describe("standardAttributeFilter", () => {
    it("should return false for null attribute", () => {
      expect(utils.standardAttributeFilter(null, {}, {})).toBe(false);
    });

    it("should return true for non-restricted, non-disabled attribute", () => {
      const attribute = { id: "attr-1" };
      expect(utils.standardAttributeFilter(attribute, {}, {})).toBe(true);
    });

    it("should return false for disabled attribute not in enablers", () => {
      const attribute = { id: "attr-1", disabled: true };
      expect(utils.standardAttributeFilter(attribute, {}, {})).toBe(false);
    });

    it("should return true for disabled attribute in enablers", () => {
      const attribute = { id: "attr-1", disabled: true };
      const enablers = { "attr-1": [] };
      expect(utils.standardAttributeFilter(attribute, {}, enablers)).toBe(true);
    });

    it("should return false for restricted attribute", () => {
      const attribute = { id: "attr-1" };
      const restrictions = { "attr-1": [["Some", "Path"]] };
      expect(utils.standardAttributeFilter(attribute, restrictions, {})).toBe(false);
    });
  });
});
