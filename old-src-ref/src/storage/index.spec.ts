import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Unmock the storage module so we can test the real implementation
vi.unmock("@/storage");
vi.unmock("./index");

// Use vi.hoisted to define mock objects
const { mockStructure, mockUtils, MockOptionCasing } = vi.hoisted(() => {
  class MockCasing {
    value: any = null;
    userInteraction: boolean = false;
    meta: Record<string, any> = {};
    getMetaData(key: string) {
      return this.meta[key];
    }
  }

  return {
    mockStructure: {
      traverse: vi.fn(),
      createVirtualBranchGroup: vi.fn(),
    },
    mockUtils: {
      setNested: vi.fn(() => true),
      getNested: vi.fn(() => null),
    },
    MockOptionCasing: MockCasing,
  };
});

// Mock dependencies (but not the storage module itself)
vi.mock("@/structure", () => ({
  default: mockStructure,
  OptionCasing: MockOptionCasing,
}));

vi.mock("@/utils", () => ({
  default: mockUtils,
}));

// Import after mocking
import storage from "./index";
import { OptionCasing } from "@/structure";

describe("storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear sessionStorage before each test
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe("saveValue", () => {
    it("should save string value directly", () => {
      storage.saveValue("testKey", "testValue");

      expect(sessionStorage.getItem("testKey")).toBe("testValue");
    });

    it("should serialize object to JSON", () => {
      const obj = { name: "test", count: 42 };
      storage.saveValue("testKey", obj);

      expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify(obj));
    });

    it("should serialize array to JSON", () => {
      const arr = [1, 2, 3];
      storage.saveValue("testKey", arr);

      expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify(arr));
    });

    it("should serialize number to JSON", () => {
      storage.saveValue("testKey", 42);

      expect(sessionStorage.getItem("testKey")).toBe("42");
    });

    it("should serialize boolean to JSON", () => {
      storage.saveValue("testKey", true);

      expect(sessionStorage.getItem("testKey")).toBe("true");
    });

    it("should handle null value", () => {
      storage.saveValue("testKey", null);

      expect(sessionStorage.getItem("testKey")).toBe("null");
    });
  });

  describe("getValue", () => {
    it("should retrieve and parse JSON object", () => {
      const obj = { name: "test", count: 42 };
      sessionStorage.setItem("testKey", JSON.stringify(obj));

      const result = storage.getValue("testKey");

      expect(result).toEqual(obj);
    });

    it("should retrieve and parse JSON array", () => {
      const arr = [1, 2, 3];
      sessionStorage.setItem("testKey", JSON.stringify(arr));

      const result = storage.getValue("testKey");

      expect(result).toEqual(arr);
    });

    it("should return raw string if not valid JSON", () => {
      sessionStorage.setItem("testKey", "not-valid-json");

      const result = storage.getValue("testKey");

      expect(result).toBe("not-valid-json");
    });

    it("should return empty string for non-existent key", () => {
      const result = storage.getValue("nonexistent");

      expect(result).toBe("");
    });

    it("should return parsed number", () => {
      sessionStorage.setItem("testKey", "42");

      const result = storage.getValue("testKey");

      expect(result).toBe(42);
    });

    it("should return parsed boolean", () => {
      sessionStorage.setItem("testKey", "true");

      const result = storage.getValue("testKey");

      expect(result).toBe(true);
    });

    it("should return null for stored null", () => {
      sessionStorage.setItem("testKey", "null");

      const result = storage.getValue("testKey");

      expect(result).toBeNull();
    });
  });

  describe("deleteValue", () => {
    it("should remove item from sessionStorage", () => {
      sessionStorage.setItem("testKey", "testValue");

      storage.deleteValue("testKey");

      expect(sessionStorage.getItem("testKey")).toBeNull();
    });

    it("should not throw for non-existent key", () => {
      expect(() => storage.deleteValue("nonexistent")).not.toThrow();
    });
  });

  describe("evaluateSelections", () => {
    it("should traverse stored selections and apply values", () => {
      const storedSelections = {
        "product-1": {
          selections: {
            Color: {
              value: "opt-red",
              userInteraction: true,
            },
          },
        },
      };
      const selectionsObject = {
        "product-1": {
          selections: {
            Color: {},
          },
        },
      };
      const optionsMap = {
        "opt-red": { id: "opt-red", name: "Red" },
      };

      // Mock the traverse to call the callback with a casing
      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(
          { value: "opt-red", userInteraction: true },
          ["product-1", "selections", "Color"],
          "Color"
        );
      });

      storage.evaluateSelections(storedSelections, selectionsObject, optionsMap as any);

      expect(mockStructure.traverse).toHaveBeenCalled();
      expect(mockUtils.setNested).toHaveBeenCalled();
    });

    it("should handle stored value with text", () => {
      const storedSelections = {};
      const selectionsObject = {};
      const optionsMap = {
        "opt-text": { id: "opt-text", name: "Text Option" },
      };

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(
          { value: { id: "opt-text", text: "Custom text" }, userInteraction: true },
          ["product-1", "selections", "Engraving"],
          "Engraving"
        );
      });

      storage.evaluateSelections(storedSelections, selectionsObject, optionsMap as any);

      expect(mockUtils.setNested).toHaveBeenCalled();
    });

    it("should handle stored value with metadata", () => {
      const storedSelections = {};
      const selectionsObject = {};
      const optionsMap = {
        "opt-1": { id: "opt-1", name: "Option 1" },
      };

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(
          { value: "opt-1", userInteraction: true, meta: { "+custom": "data" } },
          ["product-1", "selections", "Custom"],
          "Custom"
        );
      });

      storage.evaluateSelections(storedSelections, selectionsObject, optionsMap as any);

      // Should call setNested for metadata
      expect(mockUtils.setNested).toHaveBeenCalled();
    });

    it("should create virtual branch groups if virtuals are present", () => {
      const storedSelections = {
        "product-1": {
          selections: {},
          virtuals: [
            { path: ["product-1", "selections", "Logo 1"], template: "Logo $i", virtualOrder: 1 },
          ],
        },
      };
      const selectionsObject = {
        "product-1": {
          selections: {},
        },
      };

      mockStructure.traverse.mockImplementation(() => {});

      storage.evaluateSelections(storedSelections, selectionsObject, {});

      expect(mockStructure.createVirtualBranchGroup).toHaveBeenCalled();
    });

    it("should skip cloneMeta entries and set them directly", () => {
      const storedSelections = {};
      const selectionsObject = {};

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(
          { someCloneData: true },
          ["product-1", "cloneMeta"],
          "cloneMeta"
        );
      });

      storage.evaluateSelections(storedSelections, selectionsObject, {});

      // For cloneMeta, should call setNested with the whole object
      expect(mockUtils.setNested).toHaveBeenCalledWith(
        selectionsObject,
        { someCloneData: true },
        ["product-1", "cloneMeta"],
        true
      );
    });

    it("should not set userInteraction if casing requires value but has none", () => {
      const storedSelections = {};
      const selectionsObject = {};
      const optionsMap = {};

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(
          { value: null, userInteraction: true, required: true },
          ["product-1", "selections", "Required"],
          "Required"
        );
      });

      storage.evaluateSelections(storedSelections, selectionsObject, optionsMap);

      // Should not set userInteraction since required but no option
      const calls = mockUtils.setNested.mock.calls;
      const hasUserInteractionCall = calls.some(
        (call: any[]) => call[2]?.includes("userInteraction")
      );
      expect(hasUserInteractionCall).toBe(false);
    });
  });

  describe("formatSelections", () => {
    it("should format OptionCasing to minimal data", () => {
      const selections = {};

      // Create a mock OptionCasing instance
      const mockCasing = new MockOptionCasing();
      mockCasing.value = { id: "opt-1" };
      mockCasing.userInteraction = true;
      mockCasing.meta = {};

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(mockCasing, ["product-1", "selections", "Color"], "Color");
      });

      storage.formatSelections(selections);

      expect(mockStructure.traverse).toHaveBeenCalled();
      expect(mockUtils.setNested).toHaveBeenCalled();
    });

    it("should include text in formatted value if present", () => {
      const selections = {};

      const mockCasing = new MockOptionCasing();
      mockCasing.value = { id: "opt-1", text: "Custom text" };
      mockCasing.userInteraction = true;
      mockCasing.meta = {};

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(mockCasing, ["product-1", "selections", "Engraving"], "Engraving");
      });

      storage.formatSelections(selections);

      // Check that setNested was called with text included
      expect(mockUtils.setNested).toHaveBeenCalled();
      const lastCall = mockUtils.setNested.mock.calls[0];
      expect(lastCall[1].value).toEqual({ id: "opt-1", text: "Custom text" });
    });

    it("should include meta keys that start with +", () => {
      const selections = {};

      const mockCasing = new MockOptionCasing();
      mockCasing.value = { id: "opt-1" };
      mockCasing.userInteraction = true;
      mockCasing.meta = { "+persist": true, "ignored": "value" };

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(mockCasing, ["product-1", "selections", "Custom"], "Custom");
      });

      storage.formatSelections(selections);

      const lastCall = mockUtils.setNested.mock.calls[0];
      expect(lastCall[1].meta).toEqual({ "+persist": true });
    });

    it("should handle null value", () => {
      const selections = {};

      const mockCasing = new MockOptionCasing();
      mockCasing.value = null;
      mockCasing.userInteraction = false;
      mockCasing.meta = {};

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(mockCasing, ["product-1", "selections", "Optional"], "Optional");
      });

      storage.formatSelections(selections);

      const lastCall = mockUtils.setNested.mock.calls[0];
      expect(lastCall[1].value).toBeNull();
    });

    it("should pass through non-OptionCasing objects", () => {
      const selections = {};
      const plainObject = { model: "model-1" };

      mockStructure.traverse.mockImplementation((obj, callback) => {
        callback(plainObject, ["product-1", "model"], "model");
      });

      storage.formatSelections(selections);

      const lastCall = mockUtils.setNested.mock.calls[0];
      expect(lastCall[1]).toEqual(plainObject);
    });
  });

  describe("saveSelections", () => {
    it("should save formatted selections to sessionStorage", () => {
      const formattedSelections = {
        "product-1": {
          selections: {
            Color: { value: "opt-red", userInteraction: true },
          },
        },
      };

      storage.saveSelections(formattedSelections);

      const saved = sessionStorage.getItem("selections");
      expect(saved).toBe(JSON.stringify(formattedSelections));
    });
  });

  describe("round-trip", () => {
    it("should save and retrieve the same value", () => {
      const data = {
        nested: {
          array: [1, 2, 3],
          object: { a: 1, b: 2 },
        },
        string: "test",
        number: 42,
        boolean: true,
      };

      storage.saveValue("roundtrip", data);
      const retrieved = storage.getValue("roundtrip");

      expect(retrieved).toEqual(data);
    });
  });
});
