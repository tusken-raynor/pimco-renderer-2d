/**
 * Test utilities and setup for Nokona Configurator tests
 *
 * This module re-exports all test helpers and mocks for convenient importing.
 */

// Mock factories
export * from "./mocks/store";
export * from "./mocks/state";
export * from "./mocks/canvas";
export * from "./mocks/workers";

// Test data helpers
export * from "./helpers/loadTestData";

// Re-export common test utilities
export { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
export { mount, shallowMount, flushPromises } from "@vue/test-utils";
