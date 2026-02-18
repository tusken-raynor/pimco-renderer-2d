/**
 * Virtual Slave Module.
 *
 * Virtual slaves are main-thread implementations of render slaves that provide
 * the same MessagePort interface as real Web Workers. They are used as fallbacks
 * when OffscreenCanvas is not available (scenarios C and F).
 *
 * Key features:
 * - Same message protocol as real workers (init, batch, abort)
 * - Use HTMLCanvasElement instead of OffscreenCanvas
 * - Synchronous or microtask-deferred message handling
 * - Direct asset registration (no MessageChannel needed)
 *
 * Virtual slaves are designed to be interchangeable with Worker instances
 * from the RenderMaster's perspective.
 */

export { VirtualStandardSlave } from './virtual-standard-slave';
export { VirtualTextSlave } from './virtual-text-slave';
export type { VirtualSlavePort, VirtualSlaveOptions } from './types';
