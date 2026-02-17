import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mock objects that can be used in vi.mock factories
const { mockUtils } = vi.hoisted(() => {
  return {
    mockUtils: {
      generateHash: vi.fn((str: string) => "hash_" + str.slice(0, 10)),
      deepObjectExtend: vi.fn((...objs) => Object.assign({}, ...objs)),
    },
  };
});

// Mock dependencies - these need to be before the import
vi.mock("@/utils", () => ({
  default: mockUtils,
}));

// Mock the structure module that OptionCasing imports from (circular dependency)
vi.mock("@/structure", () => ({
  default: {
    getObject: vi.fn((id: string) => ({ id, name: "Object " + id, type: "BasicOption" })),
    branch: vi.fn(() => null),
  },
}));

// Unmock the module we're testing
vi.unmock("./OptionCasing");

import { OptionCasing, SetterFunction, CertifierFunction } from "./OptionCasing";

describe("OptionCasing", () => {
  // Helper functions
  function createMockSetter(): SetterFunction {
    return vi.fn((value, oldValue, contributions, releaseSetter) => {
      // Simulate setting a releaser
      releaseSetter(() => {});
    });
  }

  function createMockCertifier(returnValue = true): CertifierFunction {
    return vi.fn(() => returnValue);
  }

  function createMockOption(id: string, name?: string) {
    return {
      id,
      name: name || "Option " + id,
      type: "BasicOption",
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create an OptionCasing with basic properties", () => {
      const option = createMockOption("opt-1", "Red");
      const casing = new OptionCasing(
        "brc123",
        option,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.branchID).toBe("brc123");
      expect(casing.order).toBe(0);
      expect(casing.value).toEqual(option);
      expect(casing.defaultValue).toBe("opt-1");
      expect(casing.userInteraction).toBe(false);
      expect(casing.required).toBe(true);
    });

    it("should handle null initial value", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.value).toBeNull();
      expect(casing.defaultValue).toBeNull();
    });

    it("should set parent when provided", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        "attr-parent"
      );

      expect(casing.parent).toBe("attr-parent");
    });

    it("should set storageMode based on store parameter", () => {
      const casingAll = new OptionCasing(
        "brc1",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        true
      );
      expect(casingAll.storageMode).toBe("all");

      const casingNone = new OptionCasing(
        "brc2",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        false
      );
      expect(casingNone.storageMode).toBe("none");

      const casingValue = new OptionCasing(
        "brc3",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        "value"
      );
      expect(casingValue.storageMode).toBe("value");

      const casingInteraction = new OptionCasing(
        "brc4",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        "interaction"
      );
      expect(casingInteraction.storageMode).toBe("interaction");
    });

    it("should initialize empty pimcoContributions by default", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.pimcoContributions).toEqual([]);
    });

    it("should use provided pimcoContributions", () => {
      const contributions = [
        { pimco: "pimco-1", contributer: { frames: [] } as any },
      ];
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        true,
        contributions
      );

      expect(casing.pimcoContributions).toEqual(contributions);
    });

    it("should add default value to allowedValues", () => {
      const option = createMockOption("opt-1");
      const casing = new OptionCasing(
        "brc123",
        option,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.allowedValues.has("opt-1")).toBe(true);
    });

    it("should initialize with woocommerce properties", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.woocommerceName).toBe("");
      expect(casing.woocommerceProduct).toBe("");
    });

    it("should set custom woocommerce values when provided", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        true,
        [],
        false,
        true,
        false,
        "addon-leather-color",
        "12345"
      );

      expect(casing.woocommerceName).toBe("addon-leather-color");
      expect(casing.woocommerceProduct).toBe("12345");
    });
  });

  describe("value setter", () => {
    it("should call setter function when value changes", () => {
      const setter = createMockSetter();
      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");

      const casing = new OptionCasing(
        "brc123",
        option1,
        setter,
        createMockCertifier(),
        0
      );

      casing.addAllowedValue(option2);
      casing.value = option2;

      // Setter is called once during construction and once during assignment
      expect(setter).toHaveBeenCalledTimes(2);
    });

    it("should not change value if not in allowedValues", () => {
      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");

      const casing = new OptionCasing(
        "brc123",
        option1,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      // opt-2 is not allowed
      casing.value = option2;

      expect(casing.value).toEqual(option1);
    });

    it("should not change value if certifier returns false", () => {
      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");

      // Create a certifier that allows the first value but rejects the second
      const certifier = vi.fn((value) => {
        return value === null || value.id === "opt-1";
      });

      const casing = new OptionCasing(
        "brc123",
        option1,
        createMockSetter(),
        certifier,
        0
      );

      casing.addAllowedValue(option2);
      casing.value = option2;

      // Value should not change because certifier rejected opt-2
      expect(casing.value).toEqual(option1);
    });

    it("should allow setting to null", () => {
      const option = createMockOption("opt-1");

      const casing = new OptionCasing(
        "brc123",
        option,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.value = null;

      expect(casing.value).toBeNull();
    });

    it("should not change value when setting same value", () => {
      const setter = createMockSetter();
      const option = createMockOption("opt-1");

      const casing = new OptionCasing(
        "brc123",
        option,
        setter,
        createMockCertifier(),
        0
      );

      // Clear mock calls from constructor
      setter.mockClear();

      // Setting same value should not call setter
      casing.value = option;

      expect(setter).not.toHaveBeenCalled();
    });

    it("should release previous contributions when value changes", () => {
      const releaser = vi.fn();
      const setter: SetterFunction = (value, oldValue, contributions, releaseSetter) => {
        releaseSetter(releaser);
      };

      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");

      const casing = new OptionCasing(
        "brc123",
        option1,
        setter,
        createMockCertifier(),
        0
      );

      casing.addAllowedValue(option2);
      casing.value = option2;

      expect(releaser).toHaveBeenCalled();
    });

    it("should call value change callbacks", () => {
      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");
      const callback = vi.fn();

      const casing = new OptionCasing(
        "brc123",
        option1,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.onValueChange(callback);
      casing.addAllowedValue(option2);
      casing.value = option2;

      expect(callback).toHaveBeenCalledWith(option2);
    });
  });

  describe("previous and next", () => {
    it("should return null by default", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.previous()).toBeNull();
      expect(casing.next()).toBeNull();
    });
  });

  describe("getPath", () => {
    it("should return empty array by default", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.getPath()).toEqual([]);
    });
  });

  describe("addAllowedValue", () => {
    it("should add single option ID", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.addAllowedValue("opt-1");

      expect(casing.allowedValues.has("opt-1")).toBe(true);
    });

    it("should add option object by extracting ID", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.addAllowedValue(createMockOption("opt-2"));

      expect(casing.allowedValues.has("opt-2")).toBe(true);
    });

    it("should add multiple values from array", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.addAllowedValue(["opt-1", "opt-2", createMockOption("opt-3")]);

      expect(casing.allowedValues.has("opt-1")).toBe(true);
      expect(casing.allowedValues.has("opt-2")).toBe(true);
      expect(casing.allowedValues.has("opt-3")).toBe(true);
    });
  });

  describe("onValueChange", () => {
    it("should add one-time callback", () => {
      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");
      const option3 = createMockOption("opt-3");
      const callback = vi.fn();

      const casing = new OptionCasing(
        "brc123",
        option1,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.addAllowedValue([option2, option3]);
      casing.onValueChange(callback, false);

      casing.value = option2;
      expect(callback).toHaveBeenCalledTimes(1);

      casing.value = option3;
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, because it was one-time
    });

    it("should add permanent callback", () => {
      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");
      const option3 = createMockOption("opt-3");
      const callback = vi.fn();

      const casing = new OptionCasing(
        "brc123",
        option1,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.addAllowedValue([option2, option3]);
      casing.onValueChange(callback, true);

      casing.value = option2;
      expect(callback).toHaveBeenCalledTimes(1);

      casing.value = option3;
      expect(callback).toHaveBeenCalledTimes(2); // Called twice
    });
  });

  describe("addPimcoContributions", () => {
    it("should add new contributions", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.addPimcoContributions([
        { pimco: "pimco-1", contributer: { frames: [] } as any },
      ]);

      expect(casing.pimcoContributions.length).toBe(1);
      expect(casing.pimcoContributions[0].pimco).toBe("pimco-1");
    });

    it("should not add duplicate contributions for same pimco with same contributer", () => {
      const contributer = { frames: [] } as any;
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        true,
        [{ pimco: "pimco-1", contributer }]
      );

      casing.addPimcoContributions([
        { pimco: "pimco-1", contributer },
      ]);

      expect(casing.pimcoContributions.length).toBe(1);
    });

    it("should add different contributers for same pimco", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        true,
        [{ pimco: "pimco-1", contributer: { frames: [1] } as any }]
      );

      casing.addPimcoContributions([
        { pimco: "pimco-1", contributer: { frames: [2] } as any },
      ]);

      expect(casing.pimcoContributions.length).toBe(2);
    });
  });

  describe("setDefault", () => {
    it("should update defaultValue", () => {
      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");

      const casing = new OptionCasing(
        "brc123",
        option1,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.addAllowedValue(option2);
      casing.setDefault(option2);

      expect(casing.defaultValue).toBe("opt-2");
    });

    it("should set value when setValue is true", () => {
      const option1 = createMockOption("opt-1");
      const option2 = createMockOption("opt-2");

      const casing = new OptionCasing(
        "brc123",
        option1,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.addAllowedValue(option2);
      casing.setDefault(option2, true);

      expect(casing.value).toEqual(option2);
    });

    it("should handle null default", () => {
      const option1 = createMockOption("opt-1");

      const casing = new OptionCasing(
        "brc123",
        option1,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.setDefault(null);

      expect(casing.defaultValue).toBeNull();
    });
  });

  describe("setMetaData", () => {
    it("should set meta data by key-value", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.setMetaData("testKey", "testValue");

      expect(casing.meta.testKey).toBe("testValue");
    });

    it("should set meta data from object", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.setMetaData({ key1: "value1", key2: "value2" });

      expect(casing.meta.key1).toBe("value1");
      expect(casing.meta.key2).toBe("value2");
    });

    it("should override existing meta when override is true", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.setMetaData("existing", "old");
      casing.setMetaData({ new: "value" }, true);

      expect(casing.meta.existing).toBeUndefined();
      expect(casing.meta.new).toBe("value");
    });
  });

  describe("removeMetaData", () => {
    it("should remove meta data by key", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.setMetaData("testKey", "testValue");
      casing.removeMetaData("testKey");

      expect(casing.meta.testKey).toBeUndefined();
    });
  });

  describe("getMetaData", () => {
    it("should get meta data by key", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.setMetaData("testKey", "testValue");

      expect(casing.getMetaData("testKey")).toBe("testValue");
    });

    it("should return first matching key from multiple keys", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.setMetaData("key2", "value2");

      expect(casing.getMetaData("key1", "key2", "key3")).toBe("value2");
    });

    it("should return undefined for non-existent key", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.getMetaData("nonexistent")).toBeUndefined();
    });
  });

  describe("clone", () => {
    it("should create a clone with new path and branchID", () => {
      const option = createMockOption("opt-1");
      const casing = new OptionCasing(
        "brc123",
        option,
        createMockSetter(),
        createMockCertifier(),
        0,
        "parent-1"
      );

      const newPath = ["product", "Color", "Leather"];
      const clone = casing.clone(newPath);

      expect(clone.branchID).not.toBe(casing.branchID);
      expect(clone.getPath()).toEqual(newPath);
      expect(clone.order).toBe(casing.order);
      expect(clone.parent).toBe(casing.parent);
    });

    it("should reset user interaction and meta on clone", () => {
      const option = createMockOption("opt-1");
      const casing = new OptionCasing(
        "brc123",
        option,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.userInteraction = true;
      casing.setMetaData("key", "value");

      const clone = casing.clone(["new", "path"]);

      expect(clone.userInteraction).toBe(false);
      expect(clone.meta).toEqual({});
    });

    it("should reset callbacks on clone", () => {
      const option = createMockOption("opt-1");
      const casing = new OptionCasing(
        "brc123",
        option,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.onValueChange(() => {}, true);
      casing.onValueChange(() => {}, false);

      const clone = casing.clone(["new", "path"]);

      expect(clone.valueChangeCallbacks.permanent).toEqual([]);
      expect(clone.valueChangeCallbacks.once).toEqual([]);
    });

    it("should have null previous and next on clone", () => {
      const option = createMockOption("opt-1");
      const casing = new OptionCasing(
        "brc123",
        option,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      const clone = casing.clone(["new", "path"]);

      expect(clone.previous()).toBeNull();
      expect(clone.next()).toBeNull();
    });
  });

  describe("getValuePersistance", () => {
    it("should return false when parent not in objectMap", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        "unknown-parent"
      );

      const result = OptionCasing.getValuePersistance(casing, {});

      expect(result).toBe(false);
    });

    it("should return true when parent has persist in options", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        "attr-1"
      );

      const objectMap = {
        "attr-1": {
          id: "attr-1",
          options: {
            options: ["opt-1"],
            persist: true,
          },
        },
      };

      const result = OptionCasing.getValuePersistance(casing, objectMap as any);

      expect(result).toBe(true);
    });

    it("should return true when parent has persist in suboptions", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        "opt-1"
      );

      const objectMap = {
        "opt-1": {
          id: "opt-1",
          suboptions: {
            key: "style",
            options: ["opt-2"],
            persist: true,
          },
        },
      };

      const result = OptionCasing.getValuePersistance(casing, objectMap as any);

      expect(result).toBe(true);
    });

    it("should return false when persist is not set", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        "attr-1"
      );

      const objectMap = {
        "attr-1": {
          id: "attr-1",
          options: {
            options: ["opt-1"],
          },
        },
      };

      const result = OptionCasing.getValuePersistance(casing, objectMap as any);

      expect(result).toBe(false);
    });
  });

  describe("required and noRequirement", () => {
    it("should default required to true and noRequirement to false", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.required).toBe(true);
      expect(casing.noRequirement).toBe(false);
    });

    it("should allow setting required and noRequirement in constructor", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0,
        undefined,
        true,
        [],
        false,
        false,
        true
      );

      expect(casing.required).toBe(false);
      expect(casing.noRequirement).toBe(true);
    });
  });

  describe("hide property", () => {
    it("should default to false", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.hide).toBe(false);
    });

    it("should be settable", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      casing.hide = true;

      expect(casing.hide).toBe(true);
    });
  });

  describe("enableSyncing", () => {
    it("should default to true", () => {
      const casing = new OptionCasing(
        "brc123",
        null,
        createMockSetter(),
        createMockCertifier(),
        0
      );

      expect(casing.enableSyncing).toBe(true);
    });
  });
});
