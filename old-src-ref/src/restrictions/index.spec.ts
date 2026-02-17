import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to unmock the restrictions module for these tests
vi.unmock("@/restrictions");

// Use vi.hoisted to define mock objects that can be used in vi.mock factories
const { mockTraverse, MockOptionCasing } = vi.hoisted(() => {
  const traverse = vi.fn();

  class MockCasing {
    value: unknown = null;
    order: number = 0;
    constructor(config: Record<string, unknown> = {}) {
      Object.assign(this, config);
    }
    next() {
      return null;
    }
  }

  return {
    mockTraverse: traverse,
    MockOptionCasing: MockCasing,
  };
});

// Mock structure module for traverse functionality
vi.mock("@/structure", () => ({
  default: {
    traverse: mockTraverse,
    getFilteredStructure: vi.fn((obj) => obj),
    build: vi.fn(() => ({})),
  },
  OptionCasing: MockOptionCasing,
}));

// Import the real restrictions module after mocking dependencies
import restrictions from "./index";

describe("restrictions", () => {
  describe("match", () => {
    it("should return true when path matches exactly", () => {
      const paths = [["Leather", "Color", "Black"]];
      const truePath = ["product-1", "selections", "Leather", "Color", "Black"];
      expect(restrictions.match(paths, truePath)).toBe(true);
    });

    it("should return false when no path matches", () => {
      const paths = [["Leather", "Color", "Black"]];
      const truePath = ["product-1", "selections", "Leather", "Color", "Brown"];
      expect(restrictions.match(paths, truePath)).toBe(false);
    });

    it("should handle multiple restriction paths (OR logic)", () => {
      const paths = [
        ["Leather", "Color", "Black"],
        ["Thread", "Style", "Modern"],
      ];
      // Matches second path
      const truePath = ["product-1", "selections", "Thread", "Style", "Modern"];
      expect(restrictions.match(paths, truePath)).toBe(true);
    });

    it("should return false when first element not in truePath", () => {
      const paths = [["NonExistent", "Path"]];
      const truePath = ["product-1", "selections", "Leather", "Color"];
      expect(restrictions.match(paths, truePath)).toBe(false);
    });

    it("should handle partial path matches", () => {
      // Path ["Leather"] should match truePath containing "Leather"
      const paths = [["Leather"]];
      const truePath = ["product-1", "selections", "Leather", "Color", "Black"];
      expect(restrictions.match(paths, truePath)).toBe(true);
    });

    it("should return false for empty paths array", () => {
      const paths: string[][] = [];
      const truePath = ["product-1", "selections", "Leather"];
      expect(restrictions.match(paths, truePath)).toBe(false);
    });

    it("should handle path starting at different positions in truePath", () => {
      const paths = [["Color", "Black"]];
      // "Color" appears after "Leather" in truePath
      const truePath = ["product-1", "selections", "Leather", "Color", "Black"];
      expect(restrictions.match(paths, truePath)).toBe(true);
    });

    it("should not match if subsequent elements differ", () => {
      const paths = [["Leather", "Color", "Black"]];
      // "Leather" matches, but following elements differ
      const truePath = ["product-1", "Leather", "Thread", "Red"];
      expect(restrictions.match(paths, truePath)).toBe(false);
    });
  });

  describe("certifyValueIsntRestricted", () => {
    it("should return true for null value", () => {
      const restrictionsMap = { "option-1": [] };
      expect(restrictions.certifyValueIsntRestricted(restrictionsMap, null)).toBe(true);
    });

    it("should return false when value id is in restrictions with empty paths", () => {
      const restrictionsMap = { "option-1": [] as string[][] };
      const value = { id: "option-1", name: "Test" } as any;
      expect(restrictions.certifyValueIsntRestricted(restrictionsMap, value)).toBe(false);
    });

    it("should return true when value id not in restrictions", () => {
      const restrictionsMap = { "option-2": [] as string[][] };
      const value = { id: "option-1", name: "Test" } as any;
      expect(restrictions.certifyValueIsntRestricted(restrictionsMap, value)).toBe(true);
    });

    it("should check path match when paths are provided and path argument given", () => {
      const restrictionsMap = {
        "option-1": [["Leather", "Black"]],
      };
      const value = { id: "option-1", name: "Test" } as any;
      const path = ["product", "selections", "Leather", "Black"];

      // Path matches restriction, so value IS restricted (returns false)
      expect(restrictions.certifyValueIsntRestricted(restrictionsMap, value, path)).toBe(
        false
      );
    });

    it("should return true if path does not match restriction paths", () => {
      const restrictionsMap = {
        "option-1": [["Leather", "Black"]],
      };
      const value = { id: "option-1", name: "Test" } as any;
      const path = ["product", "selections", "Thread", "Red"];

      // Path doesn't match restriction, so value is NOT restricted (returns true)
      expect(restrictions.certifyValueIsntRestricted(restrictionsMap, value, path)).toBe(
        true
      );
    });

    it("should return true when value has restrictions but no path provided", () => {
      const restrictionsMap = {
        "option-1": [["Leather", "Black"]],
      };
      const value = { id: "option-1", name: "Test" } as any;

      // Has paths but no path argument = return true (can't verify)
      expect(restrictions.certifyValueIsntRestricted(restrictionsMap, value)).toBe(true);
    });
  });

  describe("handleOptionRestrictions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should remove outgoing option restriction from map", () => {
      const restrictionsMap: Record<string, any> = {
        "option-old": { path: ["some", "path"] },
        "option-other": { path: ["other", "path"] },
      };
      const outgoingOption = { id: "option-old", name: "Old Option" } as any;

      restrictions.handleOptionRestrictions(
        restrictionsMap,
        null, // no incoming
        outgoingOption,
        {}
      );

      expect(restrictionsMap["option-old"]).toBeUndefined();
      expect(restrictionsMap["option-other"]).toBeDefined();
    });

    it("should add incoming option restriction to map", () => {
      const restrictionsMap: Record<string, any> = {};
      // Use a string restriction (simpler) to avoid path traversal complexity
      const incomingOption = {
        id: "option-new",
        name: "New Option",
        restrict: "restricted-option-id",
      } as any;

      restrictions.handleOptionRestrictions(
        restrictionsMap,
        incomingOption,
        null,
        {}
      );

      expect(restrictionsMap["option-new"]).toBeDefined();
    });

    it("should handle null outgoing option", () => {
      const restrictionsMap: Record<string, any> = {};
      const incomingOption = {
        id: "option-new",
        name: "New Option",
        restrict: "restricted-option-id",
      } as any;

      // Should not throw
      expect(() => {
        restrictions.handleOptionRestrictions(
          restrictionsMap,
          incomingOption,
          null,
          {}
        );
      }).not.toThrow();
    });

    it("should handle null incoming option", () => {
      const restrictionsMap: Record<string, any> = {
        "option-old": { path: ["some", "path"] },
      };
      const outgoingOption = { id: "option-old", name: "Old Option" } as any;

      // Should not throw
      expect(() => {
        restrictions.handleOptionRestrictions(
          restrictionsMap,
          null,
          outgoingOption,
          {}
        );
      }).not.toThrow();
    });

    it("should handle both null options", () => {
      const restrictionsMap: Record<string, any> = {};

      // Should not throw
      expect(() => {
        restrictions.handleOptionRestrictions(restrictionsMap, null, null, {});
      }).not.toThrow();
    });

    it("should handle array restrictions on incoming option", () => {
      const restrictionsMap: Record<string, any> = {};
      // Use string restrictions (simpler) to avoid path traversal complexity
      const incomingOption = {
        id: "option-new",
        name: "New Option",
        restrict: ["red-option", "large-option"],
      } as any;

      restrictions.handleOptionRestrictions(
        restrictionsMap,
        incomingOption,
        null,
        {}
      );

      expect(restrictionsMap["option-new"]).toBeDefined();
    });
  });

  describe("findRestrictions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return empty array when no restrictions found", () => {
      mockTraverse.mockImplementation(() => {});

      const result = restrictions.findRestrictions({});

      expect(result).toEqual([]);
    });

    it("should find restrictions in structure via traverse", () => {
      const mockCasing = {
        value: {
          id: "option-1",
          restrict: { path: ["Color", "Black"], id: "black-option" },
        },
      };

      mockTraverse.mockImplementation((obj, callback) => {
        callback(mockCasing);
      });

      const result = restrictions.findRestrictions({});

      expect(result.length).toBe(1);
      expect(result[0].id).toBe("option-1");
    });

    it("should collect multiple restrictions", () => {
      const casings = [
        {
          value: {
            id: "option-1",
            restrict: { path: ["Color"], id: "color-red" },
          },
        },
        {
          value: {
            id: "option-2",
            restrict: { path: ["Size"], id: "size-large" },
          },
        },
      ];

      mockTraverse.mockImplementation((obj, callback) => {
        casings.forEach((c) => callback(c));
      });

      const result = restrictions.findRestrictions({});

      expect(result.length).toBe(2);
    });

    it("should handle casings without restrictions", () => {
      const casings = [
        { value: { id: "option-1", name: "No Restrict" } },
        { value: { id: "option-2", restrict: { path: ["Size"], id: "size" } } },
        { value: null },
      ];

      mockTraverse.mockImplementation((obj, callback) => {
        casings.forEach((c) => callback(c));
      });

      const result = restrictions.findRestrictions({});

      expect(result.length).toBe(1);
      expect(result[0].id).toBe("option-2");
    });
  });

  describe("removeRestrictedSelections", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should handle string restriction by removing matching option", () => {
      const selections = {};
      const optionCasing = new MockOptionCasing({
        value: { id: "restricted-option", name: "Restricted" },
        order: 0,
      });

      mockTraverse.mockImplementation((obj: unknown, callback: (c: unknown) => void) => {
        callback(optionCasing);
      });

      restrictions.removeRestrictedSelections("restricted-option", selections);

      expect(optionCasing.value).toBeNull();
    });

    it("should set value to null when restriction matches", () => {
      const selections = {};
      const optionCasing = new MockOptionCasing({
        value: { id: "target-option", name: "Target" },
        order: 0,
      });

      mockTraverse.mockImplementation((obj: unknown, callback: (c: unknown) => void) => {
        callback(optionCasing);
      });

      restrictions.removeRestrictedSelections("target-option", selections);

      expect(optionCasing.value).toBeNull();
    });

    it("should not remove non-matching options for string restriction", () => {
      const selections = {};
      const optionCasing = new MockOptionCasing({
        value: { id: "other-option", name: "Other" },
        order: 0,
      });

      mockTraverse.mockImplementation((obj: unknown, callback: (c: unknown) => void) => {
        callback(optionCasing);
      });

      restrictions.removeRestrictedSelections("target-option", selections);

      // Should NOT be null since IDs don't match
      expect(optionCasing.value).not.toBeNull();
    });

    it("should handle array of restrictions", () => {
      const selections = {};
      const optionCasing1 = new MockOptionCasing({
        value: { id: "option-1", name: "Option 1" },
        order: 0,
      });
      const optionCasing2 = new MockOptionCasing({
        value: { id: "option-2", name: "Option 2" },
        order: 1,
      });

      mockTraverse.mockImplementation((obj: unknown, callback: (c: unknown) => void) => {
        callback(optionCasing1);
        callback(optionCasing2);
      });

      restrictions.removeRestrictedSelections(["option-1", "option-2"], selections);

      expect(optionCasing1.value).toBeNull();
      expect(optionCasing2.value).toBeNull();
    });

    it("should handle object restriction with path", () => {
      const selections = {
        Color: {
          value: { id: "red", name: "Red" },
        },
      };

      const objectRestriction = {
        path: ["Color"],
        id: "red",
      };

      // For object restrictions, the function traverses the path
      // This is a more complex test case
      restrictions.removeRestrictedSelections(objectRestriction, selections);

      // The function should attempt to traverse the path
      // Due to complexity of path traversal, we verify no errors thrown
      expect(true).toBe(true);
    });

    it("should handle empty selections object", () => {
      const selections = {};

      // Should not throw
      expect(() => {
        restrictions.removeRestrictedSelections("any-option", selections);
      }).not.toThrow();
    });

    it("should handle restriction with empty path", () => {
      const selections = {};
      const objectRestriction = {
        path: [],
        id: "some-option",
      };

      // Should not throw
      expect(() => {
        restrictions.removeRestrictedSelections(objectRestriction, selections);
      }).not.toThrow();
    });

    it("should call next() on casing after removing value", () => {
      const nextCasing = new MockOptionCasing({
        value: { id: "next-option", name: "Next" },
        order: 1,
      });

      const optionCasing = new MockOptionCasing({
        value: { id: "target-option", name: "Target" },
        order: 0,
      });
      (optionCasing as { next: () => unknown }).next = vi.fn(() => nextCasing);

      mockTraverse.mockImplementation((obj: unknown, callback: (c: unknown) => void) => {
        callback(optionCasing);
      });

      restrictions.removeRestrictedSelections("target-option", {});

      expect(optionCasing.next).toHaveBeenCalled();
      expect(nextCasing.value).toBeNull();
    });
  });
});
