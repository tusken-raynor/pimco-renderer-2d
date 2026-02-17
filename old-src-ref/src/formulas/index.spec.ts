import { describe, it, expect, vi, beforeEach } from "vitest";

// Unmock the formulas module for these tests
vi.unmock("@/formulas");

// Import after unmocking
import { createNumericalFormula } from "./index";

describe("formulas", () => {
  describe("createNumericalFormula", () => {
    it("should create a formula that adds a constant", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "add", args: ["$", 10] }],
      });

      expect(formula(5)).toBe(15);
      expect(formula(0)).toBe(10);
      expect(formula(-5)).toBe(5);
    });

    it("should create a formula that multiplies by a constant", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "multiply", args: ["$", 2] }],
      });

      expect(formula(5)).toBe(10);
      expect(formula(0)).toBe(0);
      expect(formula(-3)).toBe(-6);
    });

    it("should create a formula that subtracts", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "subtract", args: ["$", 3] }],
      });

      expect(formula(10)).toBe(7);
      expect(formula(3)).toBe(0);
    });

    it("should create a formula that divides", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "divide", args: ["$", 2] }],
      });

      expect(formula(10)).toBe(5);
      expect(formula(7)).toBe(3.5);
    });

    it("should chain multiple operations", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [
          { name: "multiply", args: ["$", 2] },
          { name: "add", args: ["$", 5] },
        ],
      });

      // (10 * 2) + 5 = 25
      expect(formula(10)).toBe(25);
    });

    it("should support sqrt", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "sqrt", args: ["$"] }],
      });

      expect(formula(16)).toBe(4);
      expect(formula(25)).toBe(5);
      expect(formula(2)).toBeCloseTo(1.414, 2);
    });

    it("should support abs", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "abs", args: ["$"] }],
      });

      expect(formula(-5)).toBe(5);
      expect(formula(5)).toBe(5);
      expect(formula(0)).toBe(0);
    });

    it("should support round", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "round", args: ["$"] }],
      });

      expect(formula(4.4)).toBe(4);
      expect(formula(4.5)).toBe(5);
      expect(formula(4.6)).toBe(5);
    });

    it("should support floor", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "floor", args: ["$"] }],
      });

      expect(formula(4.9)).toBe(4);
      expect(formula(4.1)).toBe(4);
      expect(formula(-4.1)).toBe(-5);
    });

    it("should support ceil", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "ceil", args: ["$"] }],
      });

      expect(formula(4.1)).toBe(5);
      expect(formula(4.9)).toBe(5);
      expect(formula(-4.9)).toBe(-4);
    });

    it("should support min and max", () => {
      const minFormula = createNumericalFormula({
        params: {},
        methods: [{ name: "min", args: ["$", 10] }],
      });

      expect(minFormula(5)).toBe(5);
      expect(minFormula(15)).toBe(10);

      const maxFormula = createNumericalFormula({
        params: {},
        methods: [{ name: "max", args: ["$", 10] }],
      });

      expect(maxFormula(5)).toBe(10);
      expect(maxFormula(15)).toBe(15);
    });

    it("should support pow", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "pow", args: ["$", 2] }],
      });

      expect(formula(3)).toBe(9);
      expect(formula(4)).toBe(16);
    });

    it("should support lerp (linear interpolation)", () => {
      const formula = createNumericalFormula({
        params: { t: 0.5 },
        methods: [{ name: "lerp", args: [0, 100, "t"] }],
      });

      // lerp(0, 100, 0.5) = 0*(1-0.5) + 100*0.5 = 50
      expect(formula(0)).toBe(50);
    });

    it("should support trigonometric functions", () => {
      const sinFormula = createNumericalFormula({
        params: {},
        methods: [{ name: "sin", args: ["$"] }],
      });

      expect(sinFormula(0)).toBe(0);
      expect(sinFormula(Math.PI / 2)).toBeCloseTo(1, 5);

      const cosFormula = createNumericalFormula({
        params: {},
        methods: [{ name: "cos", args: ["$"] }],
      });

      expect(cosFormula(0)).toBe(1);
      expect(cosFormula(Math.PI)).toBeCloseTo(-1, 5);
    });

    it("should support logarithmic functions", () => {
      const logFormula = createNumericalFormula({
        params: {},
        methods: [{ name: "log", args: ["$"] }],
      });

      expect(logFormula(1)).toBe(0);
      expect(logFormula(Math.E)).toBeCloseTo(1, 5);

      const log10Formula = createNumericalFormula({
        params: {},
        methods: [{ name: "log10", args: ["$"] }],
      });

      expect(log10Formula(10)).toBe(1);
      expect(log10Formula(100)).toBe(2);
    });

    it("should use custom params", () => {
      const formula = createNumericalFormula({
        params: { multiplier: 3 },
        methods: [{ name: "multiply", args: ["$", "multiplier"] }],
      });

      expect(formula(5)).toBe(15);
    });

    it("should handle complex formula chains", () => {
      // Calculate: sqrt(abs(x * 2))
      const formula = createNumericalFormula({
        params: {},
        methods: [
          { name: "multiply", args: ["$", 2] },
          { name: "abs", args: ["$"] },
          { name: "sqrt", args: ["$"] },
        ],
      });

      expect(formula(8)).toBe(4); // sqrt(abs(8 * 2)) = sqrt(16) = 4
      expect(formula(-8)).toBe(4); // sqrt(abs(-8 * 2)) = sqrt(16) = 4
    });

    it("should handle formula with no args (defaults to $)", () => {
      const formula = createNumericalFormula({
        params: {},
        methods: [{ name: "abs" }],
      });

      expect(formula(-10)).toBe(10);
    });
  });
});
