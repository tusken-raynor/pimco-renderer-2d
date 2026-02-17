import { readFileSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(__dirname, "../../../test-data");

/**
 * Load JSON test data from the test-data directory
 * @param filename - The name of the JSON file (without extension)
 * @returns Parsed JSON data
 */
export function loadTestData<T = unknown>(filename: string): T {
  const filePath = join(TEST_DATA_DIR, `${filename}.json`);
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Load config test data from test-data/config directory
 * @param filename - The name of the JSON file (without extension)
 * @returns Parsed JSON data
 */
export function loadConfigData<T = unknown>(filename: string): T {
  const filePath = join(TEST_DATA_DIR, "config", `${filename}.json`);
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Load pre-config test data from test-data/config/pre-config-data directory
 * @param filename - The name of the JSON file (without extension)
 * @returns Parsed JSON data
 */
export function loadPreConfigData<T = unknown>(filename: string): T {
  const filePath = join(TEST_DATA_DIR, "config", "pre-config-data", `${filename}.json`);
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

// Pre-load common test data for convenience
export const testData = {
  get startData() {
    return loadTestData("start-data");
  },
  get modelData() {
    return loadTestData("model-data");
  },
  get configuratorData() {
    return loadTestData("configurator-data");
  },
  get woocommerceData() {
    return loadTestData("woocommerce-data");
  },
  get misc() {
    return loadTestData("misc");
  },
  get modelWebs() {
    return loadTestData("model-webs");
  },
};
