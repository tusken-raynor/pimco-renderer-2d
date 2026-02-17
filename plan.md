# Multi-Threaded 2D Product Image Renderer — Implementation Plan

## Scope

Build a multi-threaded 2D compositing renderer that takes an ordered array of `ProductImageComponent` objects (called "pimcos") and produces a single composited `ImageBitmap`. The renderer runs in the browser using Web Workers, OffscreenCanvas, and WebGL2. It replaces a legacy single-threaded renderer.

The system consists of four components:

- **Render Master** — orchestrator, designed to run in a worker thread (can also run on main thread)
- **Standard Render Slaves** — process conventional image layers, run in Web Workers (or virtualized on main thread)
- **Text Render Slaves** — process text/effect layers, run in Web Workers (or virtualized on main thread)
- **Asset Manager** — loads, caches, distributes assets, always runs in its own Web Worker

The entire renderer module is designed to run in worker threads. The only main-thread code in the codebase is the **virtual slave bundle** — an isolated entry point that creates virtualized slaves using `HTMLCanvasElement` when the browser cannot support the full worker pipeline. The rendering logic is shared between real and virtual slaves in the unbundled source.

Language: TypeScript. No frameworks. No build-time dependencies beyond the TypeScript compiler.

---

## Input Data

The input is `ProductImageComponent[]`, sorted by the `order` field (float, ascending = back to front). Each pimco represents a render layer. The full type definition is in the existing `types.ts` file. The relevant fields for rendering are:

```ts
type ProductImageComponent = {
  id: string;
  name: string;
  mode: "color" | "image";
  color?: string | string[] | { [idx: string]: string };
  texture?: string; // URL, used when mode is "image"
  alpha: number; // intra-layer blend opacity
  blend: BlendMode; // intra-layer blend mode (how color/texture applies to base)
  mask: string | PimcoMaskSubstitutionCompiled; // URL string = image mask, object = text layer
  image: string; // base image URL
  order?: number; // z-sort key (float)
  hlimage1?: string; // highlight 1 image URL
  hlalpha1?: number;
  hlblend1?: BlendMode;
  hlimage2?: string; // highlight 2 image URL
  hlalpha2?: number;
  hlblend2?: BlendMode;
  eindex?: number; // engraving/hotstamp opacity index override
  compositemode?: CanvasCompositeOperation; // inter-layer composite mode (default: "source-over")
  compositealpha?: number; // inter-layer composite opacity (default: 1.0) — ADD THIS TO TYPES
  placement?: ImagePlacementDefinition;
};
```

**`compositealpha`** must be added to the `ProductImageComponent` type. The legacy renderer accesses it via bracket notation `pimco['compositealpha']` with a fallback to `1.0`. It controls the opacity when a finished layer is composited onto the stack.

A layer is a **text layer** if `mask` is an object (`PimcoMaskSubstitutionCompiled`). Otherwise it is a **standard layer** with `mask` being an image URL string.

---

## Render Master

### API

```ts
class RenderMaster {
  constructor(options: {
    width?: number;
    height?: number;
    slaveCount?: number; // default: navigator.hardwareConcurrency clamped to a reasonable max
    textSlaveCount?: number; // default: 1-2
    mainThreadPort?: MessagePort; // optional, for fallback virtualization when Master is in a worker
  });
  render(layers: ProductImageComponent[], width: number, height: number): Promise<ImageBitmap>;
  preload(urls: string[]): Promise<void>;
  destroy(): void;
}
```

`render()` accepts sorted pimco layers and output dimensions, and returns a composited bitmap. The dimensions are passed through to slaves with each batch, so they can change between render calls. The Master does not own a display canvas. If `render()` is called while a previous render is still in progress, the in-progress render is aborted first — slaves receive an abort message and discard current work, pending results are discarded — then the new render begins.

### Startup and Capability Detection

1. Spawn the Asset Manager worker. Establish a `MessagePort` pair for communication. The Asset Manager always runs in its own worker regardless of fallback state.
2. Spawn one Standard Render Slave worker as a **probe**. On init, this slave tests:
   - Can an `OffscreenCanvas` be created with a `2d` context?
   - Can an `OffscreenCanvas` be created with a `webgl2` context?
     It reports results back to the Master via `{ type: "capabilities", offscreenCanvas: boolean, webgl2: boolean }`.
3. Based on the probe results and whether the Master is on the main thread or in a worker, follow one of the six fallback scenarios (see Fallback section).

### Environment Detection

The Master determines whether it is running on the main thread or in a worker by checking for the existence of `globalThis.window`. If `window` exists, the Master is on the main thread and can create `HTMLCanvasElement` and virtualized slaves directly. If not, the Master is in a worker and must use the `mainThreadPort` for virtualization (if needed). In any Canvas creation scenario, attempt to use an `OffscreenCanvas` and fallback to `HTMLCanvasElement`.

### Asset ID Map

The Master maintains a `Map<string, number>` mapping asset URLs to incrementing numeric IDs starting at 0. When it encounters a new URL in the layer data, it assigns the next integer ID. All messages between Master, Asset Manager, and Slaves use numeric IDs exclusively. The Asset Manager only receives a URL when the Master sends a fetch instruction (which includes both the URL and the assigned ID).

When an asset fails to load, the Master sets that URL's value to `-1` in the map. When building batches, the Master checks each layer's required asset IDs — if any essential asset (base `image` or `mask` for standard layers) maps to `-1`, that layer is dropped from the job entirely.

### Distribution Mode Selection

On the first `render()` call, the Master determines whether to use GPU Mode or Pool Mode for asset distribution (see Asset Manager section). This decision is made once and locked for the lifetime of the Render Master — subsequent renders reuse the same mode without re-checking.

### Render Flow

Given a sorted `ProductImageComponent[]`:

1. **Abort check**: if a previous render is in progress, abort it (send abort to all slaves, discard pending results).
2. **Classify layers**: separate into standard layers (`mask` is string) and text layers (`mask` is object).
3. **Extract asset manifest**: walk all layers, collect every URL (image, mask, texture, hlimage1, hlimage2, postmask, mesh, font). Assign numeric IDs to any new URLs. Send the full manifest to the Asset Manager with fetch instructions for any uncached assets. Wait for all fetches to complete.
4. **Check for failed assets**: check the asset ID map for `-1` values. Drop any layer whose base `image` or `mask` (for standard layers) maps to `-1`.
5. **Distribute standard layers to Standard Slaves**: divide layers across available slaves. Distribution is by workload, not by composite mode — slaves handle mixed composite modes internally. Text layers are sent to Text Slaves (typically one layer per text slave, since they are expensive).
6. **Instruct Asset Manager**: Render Master sends an instruction to the Asset Manager listing which assets must be delivered to what slaves, by asset ID.
7. **Send batch assignments**: post each slave its ordered list of layers.
8. **Collect results**: each slave returns an ordered list of `ImageBitmap`s, each tagged with `compositemode` and `compositealpha`. The Master also collects text slave results.
9. **Final composition**: the Master draws all returned bitmaps in global layer order onto its composition canvas using each bitmap's tagged `compositemode` as `globalCompositeOperation` and `compositealpha` as `globalAlpha`. The result is extracted as an `ImageBitmap` and returned to the caller. If the Master has no local canvas (Scenario F), it uses the software compositing fallback — reading `ImageData` from each bitmap, applying composite operations as per-pixel math, and producing the final `ImageBitmap` from the result.

---

## Standard Render Slave

### Resources

- Two `OffscreenCanvas` instances with `2d` contexts, sized to render dimensions, for ping-pong compositing
- A `MessagePort` to the Render Master
- A `MessagePort` to the Asset Manager

### Capability Probe

The first Standard Slave spawned acts as a probe. It tests `OffscreenCanvas` (2D) and `WebGL2` in the worker environment and reports results via `{ type: "capabilities", offscreenCanvas: boolean, webgl2: boolean }`. If the probe fails, it is terminated by the Master.

### Intra-Layer Pipeline

Each layer flows through these steps. The slave ping-pongs between its two canvases as needed.

**Step 1 — Base Image**
Draw the layer's `image` asset onto canvas A. Apply `placement` if defined (position, size, fit mode, transform sequence).

Placement transforms support: `translate`, `rotate`, `scale`, `skew`. Units can be `%` (of placement dimensions), `vw`/`vh` (of canvas dimensions), `px`, `deg`. Transforms are applied as a sequence centered on the placement rect's center. The legacy `derivePlacement` and `applyTransformSequence` functions define the exact behavior.

**Step 2 — Color/Texture Application**
If `alpha === 0`, skip this step entirely (pass-through — used for buckles, logos, shadows, etc.).

Otherwise, fork on `mode`:

- `"color"`: set `globalCompositeOperation` to `blend`, set `globalAlpha` to `alpha`, fill a solid rect with `color` over the base image.
- `"image"`: set `globalCompositeOperation` to `blend`, set `globalAlpha` to `alpha`, draw the `texture` asset over the base image.

When `color` is a string, use it directly. When it's an array or object, extract the first value as the color string.

**Step 3 — Highlight 1**
If `hlimage1` is defined and `hlalpha1 > 0`: draw `hlimage1` with `hlblend1` as `globalCompositeOperation` and `hlalpha1` as `globalAlpha`.

**Step 4 — Highlight 2**
If `hlalpha2 > 0`: draw `hlimage2` (or fall back to `hlimage1` if `hlimage2` is undefined) with `hlblend2` (or fall back to `hlblend1`) as `globalCompositeOperation` and `hlalpha2` as `globalAlpha`.

**Step 5 — Mask Application**
Set `globalCompositeOperation` to `"destination-in"`, `globalAlpha` to `1.0`, draw the mask image. This clips the result to the mask's alpha.

Reset the transform if one was applied in Step 1.

### Batch Segmentation and Output

The slave receives an ordered list of layers that may span different `compositemode` values. It walks through them and segments into output bitmaps:

**Combinable modes**: `source-over`, `screen`, `lighten`, `lighter`. A contiguous run of layers sharing the _same_ combinable mode are drawn together onto one canvas and produce a single `ImageBitmap`. Different combinable modes are NOT merged — a run of `source-over` followed by a run of `lighten` produces two separate bitmaps.

**Non-combinable modes**: everything else (`multiply`, `overlay`, `darken`, `color-burn`, etc.). Each layer with a non-combinable mode produces its own standalone `ImageBitmap`.

For combinable-mode runs, `compositealpha` is applied per-layer as `globalAlpha` when drawing onto the shared segment canvas. For non-combinable standalone bitmaps, `compositealpha` is included in the output metadata.

The slave returns an ordered list of results, each containing:

- `bitmap: ImageBitmap`
- `compositemode: string`
- `compositealpha: number`

Always send compositemode and compositealpha, even when they are defaults. Consistent message shapes keep V8's hidden classes monomorphic.

### Asset Reception and Sync

The slave receives assets and batch data independently (they may arrive in any order over separate MessagePorts). Each reception event triggers a check: "do I have all assets AND my batch assignment?" Once both are complete, rendering begins.

---

## Text Render Slave

### Overview

Processes layers where `mask` is a `PimcoMaskSubstitutionCompiled` object. Does NOT use the standard intra-layer pipeline. Instead, its effect functions internally handle everything — text rasterization, base texture tiling, color application, embossing, masking. The output is a fully finished bitmap.

### Resources

- One `OffscreenCanvas` with a `2d` context for text rasterization (`fillText`, `measureText`). Reused for 2D transforms.
- One `OffscreenCanvas` with a `webgl2` context, shared between `WebGLPostProcessor` (effects) and 3D mesh projection. Effect output textures flow directly into projection without GPU readback.
- Local font cache — fonts delivered once from Asset Manager, retained for slave lifetime.
- Local mesh cache — parsed .obj data in GPU memory, retained for slave lifetime.
- A `MessagePort` to the Render Master
- A `MessagePort` to the Asset Manager

### Initialization

1. Create the 2D text canvas.
2. Create the shared WebGL canvas. Instantiate `WebGLPostProcessor` on it. Register all effect shader programs.
3. Initialize the 3D projection shader program on the same WebGL context.

If WebGL2 context creation fails in the worker, report as an `Error`. This scenario shouldn't occur if the probe
properly detected the incompatibility and triggered slave virtualization.

### Text Layer Pipeline

**Stage 1 — Text Rasterization**

Render `mask.content` as white text on a black background on the 2D text canvas using properties from `mask.type`:

- `fontfamily`, `fontweight` (default "700"), `letterspacing`, `lineheight` (default 0.07 × canvas width), `texttransform` (uppercase/lowercase/capitalize), `widthscale`, `maxwidth`, `heightscale`, `alignment` (center/left/right)

Text measurement: use `measureText()` to get width. If width exceeds `maxwidth × canvasWidth`, scale font size down proportionally. Apply `widthscale` and `heightscale` multipliers. The mask canvas is sized to the measured text dimensions (with a 1.2× height overshoot factor for descenders).

**Path-based text rendering (`mask.type.path`) is SCRAPPED.** If present, ignore the path data and render as standard flat text.

Upload the text canvas to the shared WebGL context as a texture.

**Stage 2 — Effect**

Apply the effect specified by `mask.effect` via `WebGLPostProcessor` shader chains. The text texture is already on the GPU. Effect parameters come from `mask.effectparams`.

The `WebGLPostProcessor` exposes a chainable API. Each shader program is invoked via `useProgram(name)`, configured via `setUniforms(uniforms)`, and output is either rendered to a framebuffer via `toFramebuffer(width, height)` returning a `GPUTextureHandle`, or rendered to a target canvas/context via `to(target)`. Intermediate textures flow between passes as `GPUTextureHandle` values passed into subsequent `setUniforms` calls as `TEXTURE2D` uniforms. This allows multi-pass chains to stay entirely on the GPU with no CPU readback between passes.

Example — a three-pass chain:

```ts
const embossed = processor
  .useProgram("emboss")
  .setUniforms({ uInput: { type: TEXTURE2D, value: sourceCanvas } })
  .toFramebuffer(w, h);

const fuzzed = processor
  .useProgram("fuzz")
  .setUniforms({ uInput: { type: TEXTURE2D, value: embossed } })
  .toFramebuffer(w, h);

processor
  .useProgram("alpha_erode")
  .setUniforms({ uInput: { type: TEXTURE2D, value: fuzzed } })
  .to(targetCtx);
```

Every shader declares `uniform sampler2D uInput`. Intermediate textures flow forward through return values with no naming conventions or implicit coupling between passes.

Effects to implement as shader chains:

| Effect          | Legacy Pipeline                                                                                                         | Key Params                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `embroidery`    | alpha erode → tile base texture → color multiply → emboss (light+shadow) → fuzz → mask → drop shadow                    | `AlphaErosionRadius`, `EmbroideryFuzziness`            |
| `engraving`     | emboss (shadow) → color-distance opacity curve → multiply → mask                                                        | `eindex` or computed from color distance               |
| `metal`         | dual emboss (custom kernel + standard) → tile texture → color multiply → mask                                           | —                                                      |
| `foil`          | alpha erode → tile texture → color blend → dual emboss → shrink mask → shadow composite                                 | `AlphaErosionRadius`                                   |
| `hotstamp`      | dual emboss → color-distance opacity curve → multiply → mask                                                            | `eindex` or computed                                   |
| `painted`       | edge expand (blur/contrast) → dual emboss → inset shrink (blur/brightness/contrast) → tile texture → color blend → mask | `PaintedInsetShrink`                                   |
| `normal`        | roundness (blur+contrast) → color scale → normal map → directional lighting                                             | `NormalRoundness`, `NormalIntensity`, `NormalLightDir` |
| `shadow`        | spread (blur+brightness+contrast) → white-to-alpha → color fill → blur → multi-pass alpha                               | `ShadowSpread`, `ShadowBlur`                           |
| (none/fallback) | tile base texture → color multiply → mask                                                                               | —                                                      |

Emboss has a minimum text height threshold of 43.5px — below that, embossing steps are skipped.

All effects internally handle: tiling the layer's `image` as a base texture, applying the layer's `color` with `blend` and `alpha`, and masking to the text shape. The output is a `GPUTextureHandle` (or readback to canvas for 2D transform path).

**Stage 3 — Transform or Projection (mutually exclusive)**

If `mask.projection` exists:

- **3D Mesh Projection**: the effect output texture is already on the shared GL context. Bind it as the projection shader's input texture. Render the mesh using:
  - Vertex buffer: interleaved position(3) + normal(3) + UV(2) = stride 8 floats
  - Uniforms: `modelMatrix` (from `projection.transformation`, 4×4), `viewMatrix` (from `mat4.lookAt` with `projection.camera`, target [0,0,0], up [0,1,0]), `projectionMatrix` (perspective from `projection.fov` or orthographic from `projection.rect`)
  - UV controls: `uUVOrigin`, `uMeshUVTextureRatio`, `uUVAutoX`, `uUVAutoY` — computed from `projection.uvorigin`, `projection.uvauto`, `projection.uvmeshratio`
  - GL state: CULL_FACE enabled, DEPTH_TEST enabled, BLEND with ONE/ONE_MINUS_SRC_ALPHA, clear to transparent
  - If `projection.identifier` exists, cache the compiled program and buffers for reuse

Else if `mask.transform` exists:

- **2D Transform**: read the effect result back to the 2D text canvas. Build a DOMMatrix from `transform.translation` (percentages of canvas dimensions, origin at 50%/50%), `transform.rotation` (degrees), `transform.scale` (uniform or [x,y]). Alignment affects origin offset (left = +width/2, right = -width/2). Apply via `setTransform`, draw, `resetTransform`.

Apply `compositemode` and `compositealpha` when drawing result to destination.

**Stage 4 — Post-Mask**

If `mask.postmask` exists, load the postmask image and apply it as `destination-in` over the result. Clips text to product regions.

### Output

Returns a single `ImageBitmap` per text layer, tagged with `compositemode` and `compositealpha`.

---

## Asset Manager

Always runs in its own Web Worker, regardless of whether render slaves are real workers or virtualized. Central authority for all asset loading, caching, and distribution.

### Asset Identification

Numeric IDs only in all messages. The Render Master maintains the URL→ID map and only sends URLs when instructing a fetch. Failed URLs are mapped to `-1` in the Master's map.

### Asset Types

| Type                                              | Loading                           | Cache Format                       | Distribution                      |
| ------------------------------------------------- | --------------------------------- | ---------------------------------- | --------------------------------- |
| Images (base, texture, highlight, mask, postmask) | `fetch()` → `createImageBitmap()` | `ImageBitmap`                      | GPU Mode or Pool Mode             |
| Fonts                                             | `fetch()` → `ArrayBuffer`         | `ArrayBuffer`                      | Sent once per text slave, tracked |
| Meshes (.obj)                                     | `fetch()` → text parse            | `ArrayBuffer` (parsed vertex data) | Sent once per text slave, tracked |

### Distribution Modes

**GPU Mode**: `createImageBitmap(original)` to copy the handle. Nearly free — reference copy with negligible overhead. Asset Manager retains the original in cache and sends copies.

**Pool Mode**: creates a pool of transferable `ImageBitmap` clones on demand. Each pool item has ~10 second TTL. Periodic cleanup destroys unused items; active items stay alive.

The Render Master determines the mode once on the first `render()` call and locks it for the lifetime of the instance.

### Font/Mesh Delivery Tracking

The Asset Manager tracks which fonts and meshes have been delivered to which Text Slaves via a `Map<slaveId, Set<assetId>>`. It never re-sends an asset that a slave already has.

### Orchestration Flow

1. Master sends fetch instructions: `{ assetId: number, url: string }[]`
2. Asset Manager fetches any uncached assets. Reports failures back to Master (list of failed asset IDs).
3. Master sends distribution instructions: `{ slaveId: number, assetIds: number[] }[]`
4. Asset Manager delivers assets to slaves over their dedicated MessagePorts.

### Error Handling

Load failure (404, network, decode) → Asset Manager returns the list of failed asset IDs to Master. Master maps those URLs to `-1` in the asset ID map and drops any layers that depend on them.

### Preloading

`preload(urls)` accepts a list of URLs expected to be needed. The Master submits this before any render job. Asset Manager fetches and caches them proactively.

---

## Main Thread Virtualization Fallback

### Principles

- The Asset Manager always stays in its own worker. Never virtualized.
- Virtualized slaves implement the same `MessagePort` interface as real workers. The Asset Manager has no awareness of whether a slave is real or virtual. The Render Master communicates with virtual slaves over `MessagePort`s (or an identical interface) even when both are on the same thread. This keeps the number of code paths to a minimum.
- The renderer's primary code is designed to run in worker threads. The **virtual slave bundle** is the only file designed for main-thread execution — it is an isolated entry point that creates virtualized slaves using `HTMLCanvasElement` when needed. In the unbundled source, virtual and real slaves share rendering functions. The bundler (Vite or equivalent) is configured with the virtual slave bundle as a separate entry point, producing a standalone file that can be loaded independently.
- Virtualized slaves use `HTMLCanvasElement` (for 2D) and standard `WebGL2RenderingContext` (for text effects/projection) instead of `OffscreenCanvas`.
- When virtualized, only one Standard Slave and one Text Slave are created (sequential, no parallelism).

### Environment Detection

The Master checks `globalThis.window` to determine if it is on the main thread or in a worker.

### The `mainThreadPort`

When the Render Master runs in a worker and needs to virtualize slaves, it requires a way to execute code on the main thread. The constructor accepts an optional `mainThreadPort: MessagePort`. The developer is responsible for setting up the main-thread side of this port so that when it receives a message of this shape:

```ts
{
  type: "load-script",
  url: string,             // URL of a JS file to load on the main thread
  standardSlavePorts?: {
    masterPort: MessagePort,
    assetPort: MessagePort
  },  // ports for the virtual Standard Slave (omit to skip)
  textSlavePorts?: {
    masterPort: MessagePort,
    assetPort: MessagePort
  },  // ports for the virtual Text Slave (omit to skip)
}
```

...it loads the script at `url` (e.g., via a `<script>` tag or `import()`) and passes the transferred ports to it. The script creates the virtual slaves, wires up the ports, and posts `{ type: "virtualized-ready" }` back to the Master through the `mainThreadPort`.

**This port setup is not part of the renderer codebase.** It is documented for developers integrating the renderer. A minimal example:

```ts
// Main thread setup (developer-provided)
const channel = new MessageChannel();
renderMasterWorker.postMessage({ mainThreadPort: channel.port1 }, [channel.port1]);

channel.port2.onmessage = async (e) => {
  if (e.data.type === "load-script") {
    if (importAsModule) {
      const module = await import(e.data.url);
      module.init(e.data); // passes ports, dimensions, etc.
    } else {
      const scriptEl = document.createElement("script");
      scriptEl.addEventListener("load", () => {
        initVirtualRenderSlaves(e.data);
      });
      scriptEl.src = e.data.url;
    }
  }
};
```

### Fallback Scenarios

There are six discrete scenarios based on two axes: where the Render Master runs (main thread vs worker) and the capability level (full, partial, none).

---

**Scenario A — Master on main thread, full capabilities**
Probe: OffscreenCanvas ✅, WebGL2 ✅

- Standard Slaves: real workers
- Text Slaves: real workers
- Asset Manager: own worker
- Final composition: Master creates an `HTMLCanvasElement` for composition (it's on the main thread)

No fallback needed. Best-case path.

---

**Scenario B — Master on main thread, partial capabilities (OffscreenCanvas but no WebGL2 in workers)**
Probe: OffscreenCanvas ✅, WebGL2 ❌

- Standard Slaves: real workers (2D canvas only — no WebGL needed)
- Text Slaves: virtualized on main thread. Master is already on the main thread, so it directly instantiates the virtual Text Slave by loading the correct code. Communication still goes through `MessagePort` (or an identical synchronous interface) to keep the code path consistent with real workers.
- Initialization: script loading will still happen here, but there is no cross-thread trickery that needs to happen. Master just loads the virutal slave bundle on the main thread directly, and initializes only a text slave variant.
- Asset Manager: own worker. A `MessagePort` to the virtual Text Slave is registered with the Asset Manager as usual.
- Final composition: Master's own Canvas

---

**Scenario C — Master on main thread, no OffscreenCanvas in workers**
Probe: OffscreenCanvas ❌

- Initializing Slaves: both virtualized on main thread. Master directly instantiates one virtual Standard Slave and one virtual Text Slave by loading the slave bundle script directly on the same thread.
- Asset Manager: own worker. Ports to both virtual slaves are registered with it.
- Final composition: Master's own Canvas

All communication still uses `MessagePort` interfaces. Slowest mode (sequential, single-threaded rendering), but functionally complete.

---

**Scenario D — Master in worker, full capabilities**
Probe: OffscreenCanvas ✅, WebGL2 ✅

- Standard Slaves: real workers (spawned as sub-workers, or spawned by the main thread and ports transferred to the Master)
- Text Slaves: real workers
- Asset Manager: own worker
- Final composition: Master creates an `OffscreenCanvas` in its own worker for composition

No fallback needed. Best-case path for worker-hosted Master.

---

**Scenario E — Master in worker, partial capabilities (OffscreenCanvas but no WebGL2 in workers)**
Probe: OffscreenCanvas ✅, WebGL2 ❌

- Standard Slaves: real workers (2D canvas only)
- Text Slaves: must be virtualized on main thread. Master cannot create `HTMLCanvasElement`.
- Asset Manager: own worker
- Final composition: Master's own `OffscreenCanvas` (OffscreenCanvas is available)

Virtualization process:

1. Master checks for `mainThreadPort`. If not provided, Text Slaves are simply not created — text layers are dropped from the job (degraded mode). This should be logged as a warning.
2. Master creates a `MessageChannel` for Master↔TextSlave communication, and another for AssetManager↔TextSlave communication.
3. Master sends a `load-script` message over the `mainThreadPort` with:
   - `url`: path to the virtual slave bundle
   - `textSlavePorts`: one end of the Master↔TextSlave and AssetManager↔TextSlave channels
   - `standardSlavePorts`: omitted (not needed)
4. Master registers the AssetManager-side port with the Asset Manager.
5. Main thread loads the script, creates the virtual Text Slave, wires ports, posts `virtualized-ready`.
6. Master receives confirmation and proceeds normally. The virtual Text Slave is indistinguishable from a real one at the protocol level.

---

**Scenario F — Master in worker, no OffscreenCanvas**
Probe: OffscreenCanvas ❌

- Standard Slaves: must be virtualized on main thread.
- Text Slaves: must be virtualized on main thread.
- Asset Manager: own worker
- Final composition: Master cannot create any canvas (no OffscreenCanvas in worker, no HTMLCanvasElement in worker). Composition is performed in software using `ImageData` pixel manipulation.

Virtualization process:

1. Master checks for `mainThreadPort`. If not provided, rendering is impossible — `render()` rejects with an error explaining the environment lacks OffscreenCanvas and no main thread port was provided.
2. Master creates `MessageChannel` pairs for: Master↔StandardSlave, Master↔TextSlave, AssetManager↔StandardSlave, AssetManager↔TextSlave.
3. Master sends a `load-script` message over the `mainThreadPort` with:
   - `url`: path to the virtual slave bundle
   - `standardSlavePorts`: one end of the Master↔StandardSlave and AssetManager↔StandardSlave channels
   - `textSlavePorts`: one end of the Master↔TextSlave and AssetManager↔TextSlave channels
4. Master registers the AssetManager-side ports with the Asset Manager.
5. Main thread loads the script, creates one virtual Standard Slave and one virtual Text Slave using `HTMLCanvasElement`. Wires ports, posts `virtualized-ready`.
6. Master receives confirmation and proceeds. It orchestrates and collects results from both slaves exactly as in every other scenario. The slaves are indistinguishable from real workers at the protocol level.
7. For final composition, the Master flags at init that it has no local canvas. When compositing, it uses a software compositing path: it reads pixel data from the returned `ImageBitmap`s (via `ImageData`), applies the composite modes and alpha values in software, and produces the final `ImageBitmap` from the composited `ImageData`. This requires implementing the relevant Canvas2D composite operations (`source-over`, `multiply`, `screen`, etc.) as per-pixel math.

This is the slowest and most complex path. The software compositor only needs to handle inter-layer composition (blending finished bitmaps together), not intra-layer work. The number of bitmaps to composite is bounded by the number of output segments from the slaves, which is typically small. It exists to ensure the renderer can function in the worst-case environment where the Master is in a worker but the browser lacks OffscreenCanvas.

---

### Summary Table

| Scenario | Master      | OffscreenCanvas | WebGL2 | Std Slaves         | Text Slaves        | Composition          | Needs mainThreadPort |
| -------- | ----------- | --------------- | ------ | ------------------ | ------------------ | -------------------- | -------------------- |
| A        | main thread | ✅              | ✅     | workers            | workers            | Either Canvas Type   | No                   |
| B        | main thread | ✅              | ❌     | workers            | virtual (direct)   | Either Canvas Type   | No                   |
| C        | main thread | ❌              | —      | virtual (direct)   | virtual (direct)   | Either Canvas Type   | No                   |
| D        | worker      | ✅              | ✅     | workers            | workers            | OffscreenCanvas      | No                   |
| E        | worker      | ✅              | ❌     | workers            | virtual (via port) | OffscreenCanvas      | Yes                  |
| F        | worker      | ❌              | —      | virtual (via port) | virtual (via port) | software (ImageData) | Yes                  |

---

## Message Protocol

All messages are plain objects with a `type` string field. Asset data and bitmaps are transferred via the Transferable mechanism in `postMessage`.

### Master ↔ Standard/Text Slave

```
Master → Slave:
  { type: "init" }
  { type: "batch", layers: LayerDescriptor[], width: number, height: number }
  { type: "abort" }

Slave → Master:
  { type: "ready" }
  { type: "capabilities", offscreenCanvas: boolean, webgl2: boolean }  // probe slave only
  { type: "result", segments: Array<{ bitmap: ImageBitmap, compositemode: string, compositealpha: number }> }
  { type: "error", message: string }
  { type: "webgl-unsupported" }  // text slave only, triggers fallback
```

### Master ↔ Asset Manager

```
Master → AssetManager:
  { type: "fetch", assets: Array<{ id: number, url: string, assetType: "image"|"font"|"mesh" }> }
  { type: "distribute", deliveries: Array<{ slaveId: number, assetIds: number[] }> }
  { type: "preload", assets: Array<{ id: number, url: string }> }
  { type: "cleanup", assetIds: number[] }
  { type: "register-slave", slaveId: number, port: MessagePort }

AssetManager → Master:
  { type: "fetch-complete", failed: number[] }
  { type: "distribute-complete" }
```

### Asset Manager ↔ Slave

```
AssetManager → Slave:
  { type: "image", id: number, data: ImageBitmap, return: boolean }     // image assets
  { type: "font", id: number, data: ArrayBuffer, family: string }  // font assets
  { type: "mesh", id: number, data: ArrayBuffer }             // mesh assets
Slave → AssetManager:
  { type: "return", id: number, data: ImageBitmap, return: boolean }  // return borrowed asset from Pool mode
```

---

## Implementation Phases

### Phase 1 — Foundation

- Add `compositealpha?: number` to `ProductImageComponent` in types.ts
- Add `"shadow"` to `PimcoMaskSubstitutionEffect` union type
- Implement the Asset Manager worker (fetch, cache, distribute, error reporting, font/mesh tracking)
- Implement the Render Master class (spawn workers, probe, port wiring, asset ID map with `-1` failure sentinel, distribution mode selection on first render, render flow with abort-on-reentry, final composition)
- Implement message protocol types
- Implement environment detection (`globalThis.window` check)

### Phase 2 — Standard Render Slave

- Implement capability probe (OffscreenCanvas + WebGL2 detection)
- Implement the intra-layer pipeline (Steps 1–5) with placement/transform support
- Implement batch segmentation logic (combinable vs non-combinable modes)
- Implement asset reception sync (wait for all assets + batch before starting)
- Implement the worker entry point with message handling
- Implement asset returning to asset manager if returning is required
- Test with real pimco data (example1.json, example2.json, example3.json)

### Phase 3 — Text Render Slave

- Implement Stage 1: text rasterization with font metrics, scaling, text transform
- Implement Stage 3: 2D transform path
- Implement Stage 3: 3D mesh projection (vertex buffer construction, shader compilation, matrix setup, UV mapping)
- Implement Stage 4: post-mask application
- Implement the no-effect/fallback path (tile texture + color + mask)
- Implement asset returning to asset manager if returning is required
- Implement font loading in worker via `FontFace` API + `self.fonts.add()`

### Phase 4 — Effect Shaders

- Port each effect to a WebGL shader chain using the `WebGLPostProcessor` + `GPUTextureHandle` chaining pattern
- Implementation order by complexity: no-effect → shadow → engraving → hotstamp → embroidery → metal → foil → painted → normal
- Each effect needs: shader source (GLSL), uniform declarations, multi-pass chain wiring
- The common emboss kernel, alpha erosion, fuzz, blur, and color math operations should be implemented as reusable shader programs

### Phase 5 — Fallback and Polish

- Implement virtualized slave class (same rendering logic as real slaves, `HTMLCanvasElement` instead of `OffscreenCanvas`, `MessagePort` interface)
- Build the virtual slave bundle as a separate entry point (see Build Configuration section)
- Implement Scenarios A–C (Master on main thread — direct virtualization)
- Implement Scenarios D–F (Master in worker — `mainThreadPort` + script loading)
- Implement software compositor for Scenario F (per-pixel composite mode math on `ImageData`)
- Document `mainThreadPort` setup for developers
- Performance testing and tuning (slave count, batch sizing)
- Memory leak audit (ImageBitmap.close() on all intermediate bitmaps, WebGL resource cleanup)

---

## Build Configuration

The project has multiple entry points that must be configured in the bundler (Vite, Rollup, Webpack, etc.):

**Worker entry points** (loaded via `new Worker(url)`):

- `render-slave.worker.ts` — Standard Render Slave
- `text-render-slave.worker.ts` — Text Render Slave
- `asset-manager.worker.ts` — Asset Manager

**Virtual slave bundle** (loaded on main thread via `import()` or `<script>` during fallback):

- `virtual-slaves.ts` — a separate entry point that produces an isolated JavaScript file

The virtual slave bundle exports an `init(config)` function. When called, it creates virtualized Standard and/or Text Slaves on the main thread using `HTMLCanvasElement`, wires the provided `MessagePort`s, and posts `{ type: "virtualized-ready" }` back to the Render Master.

In the unbundled source, virtual and real slaves share all rendering functions. The difference is only in resource creation — `OffscreenCanvas` vs `HTMLCanvasElement`, and how the entry point is structured (worker `onmessage` vs `init()` function). The shared rendering logic (intra-layer pipeline, batch segmentation, text rasterization, effects, projection) lives in importable modules that both the worker entry points and the virtual slave bundle consume.

Example Vite config:

```ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        "render-slave.worker": "src/workers/render-slave.worker.ts",
        "text-render-slave.worker": "src/workers/text-render-slave.worker.ts",
        "asset-manager.worker": "src/workers/asset-manager.worker.ts",
        "virtual-slaves": "src/virtual-slaves.ts",
      },
    },
  },
});
```

The virtual slave bundle URL is what the Render Master sends in the `load-script` message. The developer must ensure this URL is resolvable at runtime (e.g., placed in the public directory or referenced via an import meta URL).

---

## Reference Files

These files from the legacy codebase inform the implementation:

- `types.ts` — all type definitions for ProductImageComponent, PimcoMaskSubstitution\*, BlendMode, CanvasCompositeOperation, ImagePlacementDefinition, etc.
- `index.ts` (the legacy renderer) — contains the full rendering pipeline including: `drawPimcoStack` (standard layer pipeline), `drawSubstitution` (text layer pipeline), `useEffect` (effect dispatcher), all 9 effect functions (`embroideryEffect`, `engravingEffect`, `metalEffect`, `foilEffect`, `hotstampEffect`, `paintedEffect`, `normalEffect`, `shadowEffect`, `noEffect`), `applyWithTransformation` (2D transform), `applyWithProjection` (3D mesh projection), `derivePlacement` + `applyTransformSequence` (placement system), `loadTexture` (WebGL texture loading), `preEffectPathed` (SVG path text — SCRAPPED), pixel displacement (DROPPED — `mask.displace` is ignored)
- `WebGLPostProcessor.ts` — the existing WebGL post-processing utility. Exposes a chainable API: `useProgram()` → `setUniforms()` → `toFramebuffer()` returning `GPUTextureHandle`, or `to()` for final output. Handles are passed as `TEXTURE2D` uniform values to subsequent passes. Assume all needed public functionality exists.
- `example1.json`, `example2.json`, `example3.json` — real pimco layer data for testing
