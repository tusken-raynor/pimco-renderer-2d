/**
 * PIMCO Renderer Dev App
 * A lightweight development environment for testing the 2D compositing renderer.
 *
 * Features:
 * - JSON file upload for layer configuration
 * - Example file selection
 * - Configurable canvas dimensions
 * - Render timing display
 * - Error display
 * - Console logging for debugging
 */

import type { ProductImageComponent, FontFamilyDescription } from '../js/types';
import { RenderMaster, type PimcoLayerEvent } from '../js/renderer';

// DOM Elements
const jsonUploadInput = document.getElementById('json-upload') as HTMLInputElement;
const exampleSelect = document.getElementById('example-select') as HTMLSelectElement;
const scenarioSelect = document.getElementById('scenario-select') as HTMLSelectElement;
const canvasWidthInput = document.getElementById('canvas-width') as HTMLInputElement;
const canvasHeightInput = document.getElementById('canvas-height') as HTMLInputElement;
const renderBtn = document.getElementById('render-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const renderCanvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const renderTimeDisplay = document.getElementById('render-time') as HTMLSpanElement;
const layerCountDisplay = document.getElementById('layer-count') as HTMLSpanElement;
const statusMessage = document.getElementById('status-message') as HTMLDivElement;
const errorDisplay = document.getElementById('error-display') as HTMLDivElement;
const jsonPreview = document.getElementById('json-preview') as HTMLPreElement;
const debugSnapshotsContainer = document.getElementById('debug-snapshots') as HTMLDivElement;
const debugClearBtn = document.getElementById('debug-clear-btn') as HTMLButtonElement;
const engravingTextCanvas = document.getElementById('engraving-text-canvas') as HTMLCanvasElement;
const engravingTextMeta = document.getElementById('engraving-text-meta') as HTMLDivElement;
const embroideryHighlightCanvas = document.getElementById(
  'embroidery-highlight-canvas'
) as HTMLCanvasElement;
const embroideryHighlightMeta = document.getElementById(
  'embroidery-highlight-meta'
) as HTMLDivElement;

// State
let currentLayers: ProductImageComponent[] | null = null;
let renderMaster: RenderMaster | null = null;
let isRendering = false;

/**
 * Font families the dev app has been told about (via loaded JSON). Keyed by
 * family name so re-loading the same family overwrites earlier registrations.
 *
 * Font registrations live on the `RenderMaster` instance — destroying the
 * master (via `resetRenderMaster()` on scenario change) wipes them. We keep
 * our own copy here so the next master can be re-populated via
 * `ensureFontsLoaded()`.
 */
const loadedFontFamilies = new Map<string, FontFamilyDescription>();

/**
 * Tracks which family-name has been loaded onto which master, so we can call
 * `master.loadFontFamily` exactly once per (master, family) pair. The
 * RenderMaster value is reset whenever the master is destroyed; an entry's
 * value matching `renderMaster` means "already loaded on the current master".
 */
const loadedOnMaster = new Map<string, RenderMaster>();

/**
 * Set status message with optional type for styling.
 */
function setStatus(message: string, type: 'info' | 'loading' | 'success' | 'error' = 'info'): void {
  statusMessage.textContent = message;
  statusMessage.className = 'dev-app__status-message';
  if (type === 'loading') {
    statusMessage.classList.add('dev-app__status-message--loading');
  } else if (type === 'success') {
    statusMessage.classList.add('dev-app__status-message--success');
  }
}

/**
 * Show error message.
 */
function showError(error: Error | string): void {
  const message = error instanceof Error ? error.message : error;
  errorDisplay.textContent = message;
  errorDisplay.hidden = false;
  console.error('[DevApp Error]', error);
}

/**
 * Hide error message.
 */
function hideError(): void {
  errorDisplay.hidden = true;
  errorDisplay.textContent = '';
}

/**
 * Update render button state based on whether layers are loaded.
 */
function updateRenderButtonState(): void {
  renderBtn.disabled = currentLayers === null || currentLayers.length === 0;
}

/**
 * Update JSON preview display.
 */
function updateJsonPreview(layers: ProductImageComponent[] | null): void {
  if (layers === null) {
    jsonPreview.textContent = 'No JSON loaded';
    layerCountDisplay.textContent = '--';
  } else {
    // Truncate for display if very large
    const jsonStr = JSON.stringify(layers, null, 2);
    const maxLength = 10000;
    if (jsonStr.length > maxLength) {
      jsonPreview.textContent = jsonStr.slice(0, maxLength) + '\n\n... (truncated)';
    } else {
      jsonPreview.textContent = jsonStr;
    }
    layerCountDisplay.textContent = String(layers.length);
  }
}

/**
 * Update canvas dimensions from input fields.
 */
function updateCanvasDimensions(): void {
  const width = parseInt(canvasWidthInput.value, 10) || 800;
  const height = parseInt(canvasHeightInput.value, 10) || 800;

  renderCanvas.width = width;
  renderCanvas.height = height;

  // eslint-disable-next-line no-console
  console.log(`[DevApp] Canvas dimensions set to ${String(width)}x${String(height)}`);
}

/**
 * Apply dimensions from JSON to the canvas size inputs and update the canvas.
 *
 * Does NOT recreate the RenderMaster — `render(layers, width, height)` accepts
 * dimensions per-call, so the master persists across canvas resizes.
 */
function applyDimensions(dimensions: [number, number]): void {
  canvasWidthInput.value = String(dimensions[0]);
  canvasHeightInput.value = String(dimensions[1]);
  updateCanvasDimensions();
}

/**
 * Extract layers, dimensions, and preload list from loaded JSON data.
 * Supports both the new wrapper format ({ dimensions, preload, pimcos })
 * and a bare array of layers for backward compatibility.
 */
function parseExampleData(data: unknown): {
  layers: ProductImageComponent[];
  dimensions: [number, number] | null;
  preload: string[] | null;
  fonts: FontFamilyDescription[] | null;
} {
  // New wrapper format
  if (
    typeof data === 'object' &&
    data !== null &&
    !Array.isArray(data) &&
    'pimcos' in data
  ) {
    const wrapper = data as Record<string, unknown>;
    const layers = parseLayerData(wrapper.pimcos);

    const dimensions =
      Array.isArray(wrapper.dimensions) && wrapper.dimensions.length === 2
        ? (wrapper.dimensions as [number, number])
        : null;

    const preload =
      Array.isArray(wrapper.preload) && wrapper.preload.length > 0
        ? (wrapper.preload as string[])
        : null;

    const fonts =
      Array.isArray(wrapper.fonts) && wrapper.fonts.length > 0
        ? (wrapper.fonts as FontFamilyDescription[])
        : null;

    return { layers, dimensions, preload, fonts };
  }

  // Legacy bare array format
  return { layers: parseLayerData(data), dimensions: null, preload: null, fonts: null };
}

/**
 * Parse and validate layer data from JSON.
 */
function parseLayerData(data: unknown): ProductImageComponent[] {
  if (!Array.isArray(data)) {
    throw new Error('JSON must be an array of layer objects');
  }

  // Basic validation - ensure each item has required fields
  const layers = data.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Layer at index ${String(index)} is not an object`);
    }

    const layer = item as Record<string, unknown>;

    // Check for required fields (with some flexibility for test data)
    if (typeof layer.id !== 'string' && typeof layer.name !== 'string') {
      console.warn(
        `[DevApp] Layer at index ${String(index)} missing id or name, generating default`
      );
      layer.id = layer.id ?? `layer-${String(index)}`;
      layer.name = layer.name ?? `Layer ${String(index)}`;
    }

    if (typeof layer.mode !== 'string') {
      console.warn(`[DevApp] Layer at index ${String(index)} missing mode, defaulting to 'color'`);
      layer.mode = 'color';
    }

    if (typeof layer.alpha !== 'number') {
      console.warn(`[DevApp] Layer at index ${String(index)} missing alpha, defaulting to 1`);
      layer.alpha = 1;
    }

    if (typeof layer.blend !== 'string') {
      console.warn(
        `[DevApp] Layer at index ${String(index)} missing blend, defaulting to 'normal'`
      );
      layer.blend = 'normal';
    }

    return layer as unknown as ProductImageComponent;
  });

  return layers;
}

/**
 * Load JSON from a file.
 */
async function loadFromFile(file: File): Promise<void> {
  hideError();
  setStatus('Loading JSON file...', 'loading');

  try {
    const text = await file.text();
    const data = JSON.parse(text) as unknown;
    const result = parseExampleData(data);

    currentLayers = result.layers;

    if (result.dimensions) {
      applyDimensions(result.dimensions);
    }

    if (result.preload) {
      // eslint-disable-next-line no-console
      console.log(`[DevApp] Preloading ${String(result.preload.length)} assets`);
      const master = ensureRenderMaster();
      void master.preload(result.preload);
    }

    if (result.fonts) {
      // eslint-disable-next-line no-console
      console.log(`[DevApp] Loading ${String(result.fonts.length)} font families`);
      // Update the dev-app cache so the families re-register on every fresh
      // master (scenario change). Then ensureFontsLoaded does the actual
      // master.loadFontFamily work, deduped per (master, family).
      for (const f of result.fonts) {
        loadedFontFamilies.set(f.family, f);
      }
      ensureRenderMaster();
      await ensureFontsLoaded();
    }

    updateJsonPreview(currentLayers);
    updateRenderButtonState();
    setStatus(`Loaded ${String(currentLayers.length)} layers from ${file.name}`, 'success');
    // eslint-disable-next-line no-console
    console.log(`[DevApp] Loaded ${String(currentLayers.length)} layers from file: ${file.name}`);
  } catch (error) {
    currentLayers = null;
    updateJsonPreview(null);
    updateRenderButtonState();
    setStatus('Failed to load JSON', 'error');
    showError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Load JSON from example file URL.
 */
async function loadFromExample(filename: string): Promise<void> {
  hideError();
  setStatus(`Loading example: ${filename}...`, 'loading');

  try {
    // Example files are served from the public folder
    const response = await fetch(`/${filename}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${filename}: ${String(response.status)} ${response.statusText}`
      );
    }

    const data = (await response.json()) as unknown;
    const result = parseExampleData(data);

    currentLayers = result.layers;

    if (result.dimensions) {
      applyDimensions(result.dimensions);
    }

    if (result.preload) {
      // eslint-disable-next-line no-console
      console.log(`[DevApp] Preloading ${String(result.preload.length)} assets`);
      const master = ensureRenderMaster();
      void master.preload(result.preload);
    }

    if (result.fonts) {
      // eslint-disable-next-line no-console
      console.log(`[DevApp] Loading ${String(result.fonts.length)} font families`);
      // Update the dev-app cache so the families re-register on every fresh
      // master (scenario change). Then ensureFontsLoaded does the actual
      // master.loadFontFamily work, deduped per (master, family).
      for (const f of result.fonts) {
        loadedFontFamilies.set(f.family, f);
      }
      ensureRenderMaster();
      await ensureFontsLoaded();
    }

    updateJsonPreview(currentLayers);
    updateRenderButtonState();
    setStatus(`Loaded ${String(currentLayers.length)} layers from ${filename}`, 'success');
    // eslint-disable-next-line no-console
    console.log(`[DevApp] Loaded ${String(currentLayers.length)} layers from example: ${filename}`);
  } catch (error) {
    currentLayers = null;
    updateJsonPreview(null);
    updateRenderButtonState();
    setStatus('Failed to load example', 'error');
    showError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Clear the canvas.
 */
function clearCanvas(): void {
  const ctx = renderCanvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
  }
  renderTimeDisplay.textContent = '--';
}

/**
 * Destroy and recreate RenderMaster (e.g., after canvas size change).
 */
function resetRenderMaster(): void {
  if (renderMaster) {
    renderMaster.destroy();
    renderMaster = null;
    // The destroyed master's loaded-fonts state is now invalid; subsequent
    // ensureFontsLoaded() calls will re-load every cached family onto the
    // next master. Cache itself (`loadedFontFamilies`) is preserved.
    loadedOnMaster.clear();
    // eslint-disable-next-line no-console
    console.log('[DevApp] RenderMaster destroyed for reset');
  }
}

/**
 * Ensure every cached font family is loaded on the current master, exactly
 * once per (master, family) pair. Cheap on the warm path: same master + same
 * cache → empty work list. Returns when every required `loadFontFamily`
 * promise has resolved (failures are logged and the family is left
 * unregistered so text falls back to a system font).
 *
 * Must be called after the master has been created (ensureRenderMaster).
 */
async function ensureFontsLoaded(): Promise<void> {
  if (!renderMaster) return;
  const master = renderMaster;
  const tasks: Promise<void>[] = [];
  for (const [family, desc] of loadedFontFamilies) {
    if (loadedOnMaster.get(family) === master) continue;
    // Mark as loaded BEFORE awaiting so concurrent calls don't double-fire.
    loadedOnMaster.set(family, master);
    tasks.push(
      master.loadFontFamily(desc).catch((err: unknown) => {
        console.warn(`[DevApp] Failed to load font family '${family}':`, err);
        // Roll back so a future call can retry.
        if (loadedOnMaster.get(family) === master) {
          loadedOnMaster.delete(family);
        }
      })
    );
  }
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

/**
 * Append a tile (canvas + caption) to the debug strip for a pimco lifecycle
 * event. Each tile owns a small canvas drawn at the bitmap's native size,
 * plus a caption with the topic label, dimensions, and any meta JSON.
 */
function appendPimcoEventTile(label: string, event: PimcoLayerEvent): void {
  const { pimcoId, bitmap, meta } = event;
  const tile = document.createElement('div');
  tile.className = 'dev-app__debug-snapshot';

  const canvas = document.createElement('canvas');
  canvas.className = 'dev-app__debug-snapshot-canvas';
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Sync use only — the master closes the bitmap after dispatch finishes.
    ctx.drawImage(bitmap, 0, 0);
  }

  const caption = document.createElement('div');
  caption.className = 'dev-app__debug-snapshot-meta';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'dev-app__debug-snapshot-kind';
  labelSpan.textContent = label;
  caption.appendChild(labelSpan);

  caption.appendChild(document.createTextNode(` ${String(bitmap.width)}×${String(bitmap.height)}`));
  caption.appendChild(document.createElement('br'));
  caption.appendChild(document.createTextNode(`layer: ${pimcoId}`));
  if (meta) {
    caption.appendChild(document.createElement('br'));
    caption.appendChild(document.createTextNode(JSON.stringify(meta)));
  }

  tile.appendChild(canvas);
  tile.appendChild(caption);
  debugSnapshotsContainer.appendChild(tile);
}

function clearDebugSnapshots(): void {
  debugSnapshotsContainer.replaceChildren();
}

/**
 * Draw an engraving-pipeline intermediate (currently the post-blur highlight
 * handle) into the targeted snapshot canvas at the bottom of the page. Each
 * render replaces the previous snapshot. The canvas resizes to the bitmap's
 * native dimensions so we see it at 1:1 scale.
 */
function drawEngravingTextSnapshot(event: PimcoLayerEvent): void {
  drawTargetedSnapshot(event, engravingTextCanvas, engravingTextMeta);
}

/** Same as drawEngravingTextSnapshot but for the embroidery-highlight topic. */
function drawEmbroideryHighlightSnapshot(event: PimcoLayerEvent): void {
  drawTargetedSnapshot(event, embroideryHighlightCanvas, embroideryHighlightMeta);
}

/** Shared snapshot-drawing routine — resizes the canvas to the bitmap and
 * paints the meta line. Sync use only; the master closes the bitmap after
 * dispatch finishes. */
function drawTargetedSnapshot(
  event: PimcoLayerEvent,
  canvas: HTMLCanvasElement,
  metaEl: HTMLDivElement
): void {
  const { bitmap, meta, part } = event;
  // eslint-disable-next-line no-console
  console.log(
    `[DevApp] pimcoRenderPart:${event.pimcoId}:${part ?? '?'} — ${String(bitmap.width)}×${String(bitmap.height)}`,
    meta
  );
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
  }
  const dims = `${String(bitmap.width)}×${String(bitmap.height)}`;
  const metaStr = meta ? ` — ${JSON.stringify(meta)}` : '';
  metaEl.textContent = `${part ?? '?'} ${dims}${metaStr}`;
}

/**
 * Initialize or get the RenderMaster instance. Subscribes to a few pimco
 * lifecycle topics so mid-render snapshots are visible in the debug strip.
 */
function ensureRenderMaster(): RenderMaster {
  if (!renderMaster) {
    const width = parseInt(canvasWidthInput.value, 10) || 800;
    const height = parseInt(canvasHeightInput.value, 10) || 800;

    // Pull the scenario override from the dropdown (empty value = auto-probe).
    // Only main-thread scenarios are exposed; D-F require master-in-worker.
    const scenarioValue = scenarioSelect.value;
    const forceScenario =
      scenarioValue === 'A' || scenarioValue === 'B' || scenarioValue === 'C'
        ? scenarioValue
        : undefined;

    renderMaster = new RenderMaster({
      width,
      height,
      ...(forceScenario && { forceScenario }),
      // textSlaveCount: 0
    });

    // Subscribe to text rasterizations and final per-layer outputs across all
    // pimcos. As more parts get emitted by future effects, add more `on()`
    // calls (or use broader wildcards).
    renderMaster.on('pimcoRenderPart:*:text', (event) => {
      appendPimcoEventTile('text', event);
    });
    renderMaster.on('pimcoRender:*', (event) => {
      appendPimcoEventTile('render', event);
    });

    // Targeted hook: dump the engraving layer's post-blur emboss highlight
    // (the alpha-encoded edge map that gets composited onto the engraving
    // fill) so we can debug the embossing/shadowing visibility issue. Per-
    // layer subscription (no wildcard) — only triggers for this one pimco.
    renderMaster.on(
      'pimcoRenderPart:pic6ZW25PKu2Vs:engraving-highlight',
      drawEngravingTextSnapshot
    );
    renderMaster.on(
      'pimcoRenderPart:picSN5cezSJ9HN:embroidery-highlight',
      drawEmbroideryHighlightSnapshot
    );

    const capabilities = renderMaster.getCapabilities();
    // eslint-disable-next-line no-console
    console.log('[DevApp] RenderMaster initialized', {
      scenario: capabilities.scenario,
      offscreenCanvas: capabilities.offscreenCanvas,
      webgl2: capabilities.webgl2,
      slaveCount: renderMaster.getSlaveCount(),
    });
    // Note: cached fonts are NOT auto-loaded here. Callers (load flows, the
    // render path) explicitly await `ensureFontsLoaded()` after creating
    // the master, which deduplicates per (master, family) and handles
    // both fresh-master rebuild and incremental cache additions correctly.
  }
  return renderMaster;
}

/**
 * Draw an ImageBitmap to the canvas.
 */
function drawBitmapToCanvas(bitmap: ImageBitmap): void {
  const ctx = renderCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D rendering context');
  }

  // Clear and draw the bitmap
  ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
  ctx.drawImage(bitmap, 0, 0);
}

/**
 * Render the current layers to the canvas using RenderMaster.
 */
async function renderLayers(): Promise<void> {
  if (!currentLayers || currentLayers.length === 0) {
    showError('No layers loaded');
    return;
  }

  if (isRendering) {
    // eslint-disable-next-line no-console
    console.log('[DevApp] Render already in progress, will be aborted by new render');
  }

  hideError();
  setStatus('Rendering...', 'loading');
  renderBtn.disabled = true;
  isRendering = true;
  clearDebugSnapshots();

  const startTime = performance.now();

  try {
    updateCanvasDimensions();

    const width = renderCanvas.width;
    const height = renderCanvas.height;

    // Get or create RenderMaster, then ensure every cached font family is
    // registered on it. On the warm path this is a single lookup that finds
    // every family already loaded and does nothing. After a scenario reset
    // it actually re-registers the families on the new master, so text
    // layers see the right `requiredFontIds` instead of falling back to
    // system fonts.
    const master = ensureRenderMaster();
    await ensureFontsLoaded();

    // Render layers
    const bitmap = await master.render(currentLayers, width, height);

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Draw result to canvas
    drawBitmapToCanvas(bitmap);

    // Close the bitmap after drawing (we no longer need it)
    bitmap.close();

    renderTimeDisplay.textContent = `${duration.toFixed(2)}ms`;
    setStatus(`Render complete in ${duration.toFixed(2)}ms`, 'success');

    // eslint-disable-next-line no-console
    console.log(
      `[DevApp] Render complete in ${duration.toFixed(2)}ms for ${String(currentLayers.length)} layers`
    );
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Check if it's an abort error (user triggered new render)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('abort')) {
      setStatus('Render aborted', 'info');
      // eslint-disable-next-line no-console
      console.log(`[DevApp] Render aborted after ${duration.toFixed(2)}ms`);
    } else {
      setStatus('Render failed', 'error');
      showError(error instanceof Error ? error : new Error(String(error)));
      console.error(`[DevApp] Render failed after ${duration.toFixed(2)}ms:`, error);
    }
  } finally {
    isRendering = false;
    renderBtn.disabled = false;
    updateRenderButtonState();
  }
}

// Event Listeners

jsonUploadInput.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    exampleSelect.value = ''; // Clear example selection
    void loadFromFile(file);
  }
});

exampleSelect.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement;
  const filename = target.value;
  if (filename) {
    jsonUploadInput.value = ''; // Clear file input
    void loadFromExample(filename);
  }
});

// Canvas size changes don't reset the master — `render(layers, w, h)` accepts
// dimensions per-call, so the existing master (and its font registry, asset
// cache, slave pool) keeps working at any size.
canvasWidthInput.addEventListener('change', () => {
  updateCanvasDimensions();
});
canvasHeightInput.addEventListener('change', () => {
  updateCanvasDimensions();
});

scenarioSelect.addEventListener('change', () => {
  // Flipping the scenario destroys the in-flight master so the next render
  // picks up the new option. The setting is read on master construction.
  resetRenderMaster();
});

renderBtn.addEventListener('click', () => {
  void renderLayers();
});

clearBtn.addEventListener('click', () => {
  clearCanvas();
  setStatus('Canvas cleared');
});

debugClearBtn.addEventListener('click', () => {
  clearDebugSnapshots();
});

// Initialize
function init(): void {
  // eslint-disable-next-line no-console
  console.log('[DevApp] PIMCO Renderer Dev App initialized');
  setStatus('Ready - upload JSON or select an example to begin');
  updateRenderButtonState();
  updateCanvasDimensions();
}

init();
