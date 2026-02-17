# Virtual Slaves Module

## Overview

Virtual slaves are main-thread implementations of render slaves that provide the same
MessagePort interface as real Web Workers. They are used as fallbacks when OffscreenCanvas
or WebGL2 is not available in the browser (scenarios B, C, E, and F).

## Architecture

### Fallback Scenarios

The renderer supports 6 fallback scenarios based on browser capabilities:

| Scenario | Master Context | Standard Slaves | Text Slaves | When Used |
|----------|---------------|-----------------|-------------|-----------|
| A | Main thread | Workers | Workers | OffscreenCanvas + WebGL2 |
| B | Main thread | Workers | Virtual | OffscreenCanvas, no WebGL2 |
| C | Main thread | Virtual | Virtual | No OffscreenCanvas |
| D | Worker | Workers | Workers | OffscreenCanvas + WebGL2, worker master |
| E | Worker | Workers | Virtual | OffscreenCanvas, no WebGL2, worker master |
| F | Worker | Virtual | Virtual | No OffscreenCanvas, worker master |

Virtual slaves are used when:
- **Standard slaves**: OffscreenCanvas is not available (scenarios C, F)
- **Text slaves**: WebGL2 is not available or OffscreenCanvas is not available (scenarios B, C, E, F)

### Key Design Principles

1. **MessagePort Interface Compatibility**: Virtual slaves implement the same interface
   as Web Workers (`postMessage`, `onmessage`, `terminate`, `addEventListener`, etc.)

2. **Same Message Protocol**: They respond to the same messages (init, batch, abort)
   and emit the same responses (capabilities, ready, result, error)

3. **HTMLCanvasElement Usage**: They use HTMLCanvasElement instead of OffscreenCanvas
   for rendering, ensuring compatibility with browsers lacking OffscreenCanvas support

4. **Deferred Execution**: Messages can be optionally deferred to microtasks to avoid
   blocking the main thread during heavy rendering operations

## Classes

### VirtualStandardSlave

Main-thread implementation of the standard render slave.

```typescript
import { VirtualStandardSlave } from './virtual-slaves';

const slave = new VirtualStandardSlave({ deferMessages: true });

// Same interface as Worker
slave.onmessage = (event) => {
  console.log('Message received:', event.data);
};

// Send init message (like Worker.postMessage)
slave.postMessage({ type: 'init' });

// Terminate when done
slave.terminate();
```

### VirtualTextSlave

Main-thread implementation of the text render slave with effect support.

```typescript
import { VirtualTextSlave } from './virtual-slaves';

const textSlave = new VirtualTextSlave({ deferMessages: true });

// Same interface as Worker
textSlave.onmessage = (event) => {
  console.log('Message received:', event.data);
};

// Send init message
textSlave.postMessage({ type: 'init' });

// Terminate when done
textSlave.terminate();
```

## Configuration Options

Both virtual slave classes accept a `VirtualSlaveOptions` configuration object:

```typescript
interface VirtualSlaveOptions {
  /** Whether to defer message handling to the next microtask (default: true) */
  deferMessages?: boolean;
}
```

- **deferMessages: true** (default): Message handling is deferred to microtasks,
  preventing blocking of the main thread during heavy rendering. Recommended for
  production use.

- **deferMessages: false**: Messages are handled synchronously. Useful for testing
  where predictable timing is needed.

## Message Protocol

Virtual slaves implement the same message protocol as real workers:

### Incoming Messages (Master → Slave)

| Message Type | Description |
|--------------|-------------|
| `init` | Initialize the slave, triggers capabilities and ready responses |
| `batch` | Process a batch of layers |
| `abort` | Cancel current rendering operation |

### Outgoing Messages (Slave → Master)

| Message Type | Description |
|--------------|-------------|
| `capabilities` | Reports OffscreenCanvas and WebGL2 availability |
| `ready` | Slave is ready to receive work |
| `result` | Rendering complete, contains RenderSegment array |
| `error` | Error occurred during rendering |

## Direct Asset Registration

Virtual slaves provide direct asset registration methods for testing or when not
using the Asset Manager:

```typescript
// Register image asset directly (bypasses MessagePort)
slave.registerAssetDirect(assetId, imageBitmap);

// For text slaves, also register fonts
textSlave.registerFontDirect(fontId, 'FontFamily', fontArrayBuffer);
```

## Effect Handling (Text Slave)

The VirtualTextSlave handles all supported effects, with WebGL2 fallbacks:

| Effect | WebGL2 Required | Fallback |
|--------|-----------------|----------|
| no-effect | No | N/A |
| shadow | No | N/A |
| engraving | No | N/A |
| hotstamp | No | N/A |
| metal | No | N/A |
| painted | No | N/A |
| embroidery | Yes | no-effect |
| foil | Yes | no-effect |
| normal | Yes | no-effect |

When WebGL2 is not available, effects that require it fall back to the simpler
no-effect pipeline with a console warning.

## Integration with RenderMaster

The RenderMaster automatically creates virtual slaves when needed based on the
detected fallback scenario. The integration is transparent - virtual slaves
behave identically to real workers from the master's perspective.

```typescript
// In RenderMaster initialization (scenarios C, F for standard, B/C/E/F for text)
if (shouldUseVirtualStandardSlaves) {
  const virtualSlave = new VirtualStandardSlave();
  // Use virtualSlave.postMessage() instead of worker.postMessage()
}
```

## Testing

Unit tests cover:
- Initialization and capability reporting
- Termination and resource cleanup
- Event listener management (addEventListener/removeEventListener)
- Abort handling
- Deferred vs synchronous message processing
- Direct asset registration
- Empty batch handling

Run tests with:
```bash
npm run test:unit -- src/js/virtual-slaves/
```

## Files

- `index.ts` - Module exports
- `types.ts` - Type definitions and helpers
- `virtual-standard-slave.ts` - VirtualStandardSlave class
- `virtual-text-slave.ts` - VirtualTextSlave class
- `virtual-standard-slave.test.ts` - Standard slave tests
- `virtual-text-slave.test.ts` - Text slave tests
