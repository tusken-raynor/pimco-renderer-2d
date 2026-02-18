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

import type { ProductImageComponent } from '../js/types';
import { RenderMaster } from '../js/renderer';

// DOM Elements
const jsonUploadInput = document.getElementById('json-upload') as HTMLInputElement;
const exampleSelect = document.getElementById('example-select') as HTMLSelectElement;
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

// State
let currentLayers: ProductImageComponent[] | null = null;
let renderMaster: RenderMaster | null = null;
let isRendering = false;

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
 */
function applyDimensions(dimensions: [number, number]): void {
  canvasWidthInput.value = String(dimensions[0]);
  canvasHeightInput.value = String(dimensions[1]);
  updateCanvasDimensions();
  resetRenderMaster();
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

    return { layers, dimensions, preload };
  }

  // Legacy bare array format
  return { layers: parseLayerData(data), dimensions: null, preload: null };
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
    // eslint-disable-next-line no-console
    console.log('[DevApp] RenderMaster destroyed for reset');
  }
}

/**
 * Initialize or get the RenderMaster instance.
 */
function ensureRenderMaster(): RenderMaster {
  if (!renderMaster) {
    const width = parseInt(canvasWidthInput.value, 10) || 800;
    const height = parseInt(canvasHeightInput.value, 10) || 800;

    renderMaster = new RenderMaster({
      width,
      height,
    });

    const capabilities = renderMaster.getCapabilities();
    // eslint-disable-next-line no-console
    console.log('[DevApp] RenderMaster initialized', {
      scenario: capabilities.scenario,
      offscreenCanvas: capabilities.offscreenCanvas,
      webgl2: capabilities.webgl2,
      slaveCount: renderMaster.getSlaveCount(),
    });
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

  const startTime = performance.now();

  try {
    updateCanvasDimensions();

    const width = renderCanvas.width;
    const height = renderCanvas.height;

    // Get or create RenderMaster
    const master = ensureRenderMaster();

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

canvasWidthInput.addEventListener('change', () => {
  updateCanvasDimensions();
  resetRenderMaster();
});
canvasHeightInput.addEventListener('change', () => {
  updateCanvasDimensions();
  resetRenderMaster();
});

renderBtn.addEventListener('click', () => {
  void renderLayers();
});

clearBtn.addEventListener('click', () => {
  clearCanvas();
  setStatus('Canvas cleared');
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
