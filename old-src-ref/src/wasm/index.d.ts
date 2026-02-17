/* tslint:disable */
/* eslint-disable */
/**
* @param {Uint8Array} image
* @param {Uint8Array} displacement
* @param {number} width
* @param {number} height
* @param {number} scalex
* @param {number} scaley
* @returns {Uint8Array}
*/
export function displaceImage(image: Uint8Array, displacement: Uint8Array, width: number, height: number, scalex: number, scaley: number): Uint8Array;
/**
* @param {string} str
* @returns {string}
*/
export function reverseString(str: string): string;
/**
* @param {number} width
* @param {number} height
* @returns {Uint32Array}
*/
export function getRegionMapDimensions(width: number, height: number): Uint32Array;
/**
* @param {Uint8Array} data_buffer
* @param {number} color
* @returns {Uint8Array}
*/
export function getRegionMapImage(data_buffer: Uint8Array, color: number): Uint8Array;
/**
* @param {string} color
* @returns {number}
*/
export function getBrightness(color: string): number;
/**
* @param {Uint8Array} data_buffer
* @param {number} width
* @param {number} height
* @param {number} direction_index
* @returns {Uint8Array}
*/
export function sobelNormalMap(data_buffer: Uint8Array, width: number, height: number, direction_index: number): Uint8Array;
/**
* @param {string} color
* @returns {number}
*/
export function cssColor2RGBAInt(color: string): number;
/**
* @param {Uint8Array} data
* @returns {string}
*/
export function deserializeSobj(data: Uint8Array): string;
/**
* @param {number} color
* @returns {number}
*/
export function rgb565ToRgb(color: number): number;
/**
* @param {number} color
* @returns {number}
*/
export function rgbToRgb565(color: number): number;
/**
* @param {number} num
* @returns {number}
*/
export function reciprocal(num: number): number;
/**
* @returns {Int32Array}
*/
export function getLUT(): Int32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly displaceImage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly reverseString: (a: number, b: number, c: number) => void;
  readonly getRegionMapDimensions: (a: number, b: number, c: number) => void;
  readonly getRegionMapImage: (a: number, b: number, c: number, d: number) => void;
  readonly getBrightness: (a: number, b: number) => number;
  readonly sobelNormalMap: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly cssColor2RGBAInt: (a: number, b: number) => number;
  readonly deserializeSobj: (a: number, b: number, c: number) => void;
  readonly rgb565ToRgb: (a: number) => number;
  readonly rgbToRgb565: (a: number) => number;
  readonly getLUT: (a: number) => void;
  readonly reciprocal: (a: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
