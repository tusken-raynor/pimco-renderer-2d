
import wasmUrl from "./configurator_wasm_bg.wasm?url";
import init from ".";

let INIT = false;

export function initWasm(callback?: () => void) {
  // If already initialized, just call the callback
  if (INIT) {
    if (callback) {
      callback();
    }
    return;
  }
  // Asyncronously initialize the wasm module
  // then call the callback
  init(wasmUrl).then(() => {
    INIT = true;
    if (callback) {
      callback();
    }
  });
}