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
    currentLayers = parseLayerData(data);
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
    currentLayers = parseLayerData(data);
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
 * Render the current layers to the canvas.
 * NOTE: This is a placeholder implementation until RenderMaster is complete.
 * Currently displays layer info and a placeholder graphic.
 */
function renderLayers(): void {
  if (!currentLayers || currentLayers.length === 0) {
    showError('No layers loaded');
    return;
  }

  hideError();
  setStatus('Rendering...', 'loading');
  renderBtn.disabled = true;

  const startTime = performance.now();

  try {
    updateCanvasDimensions();

    const ctx = renderCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }

    // Clear canvas
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);

    // TODO: Replace this placeholder with actual RenderMaster integration
    // For now, display a placeholder showing layer information

    // Draw placeholder background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

    // Draw centered text showing layer count
    ctx.fillStyle = '#333';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = renderCanvas.width / 2;
    const centerY = renderCanvas.height / 2;

    ctx.fillText('PIMCO Renderer Placeholder', centerX, centerY - 60);

    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`${String(currentLayers.length)} layers loaded`, centerX, centerY - 20);

    // Draw small boxes representing layers
    const boxSize = 30;
    const gap = 10;
    const maxBoxes = Math.min(currentLayers.length, 20);
    const totalWidth = maxBoxes * (boxSize + gap) - gap;
    const startX = centerX - totalWidth / 2;

    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';

    for (let i = 0; i < maxBoxes; i++) {
      const layer = currentLayers[i];
      const x = startX + i * (boxSize + gap);
      const y = centerY + 20;

      // Use layer color if available, otherwise generate one
      let fillColor = '#888';
      if (typeof layer.color === 'string' && layer.color) {
        fillColor = layer.color;
      } else {
        // Generate color based on index
        const hue = (i * 360) / maxBoxes;
        fillColor = `hsl(${String(hue)}, 60%, 50%)`;
      }

      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, boxSize, boxSize);

      // Draw border
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, boxSize, boxSize);
    }

    if (currentLayers.length > maxBoxes) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`+ ${String(currentLayers.length - maxBoxes)} more`, centerX, centerY + 80);
    }

    // Draw note about placeholder
    ctx.fillStyle = '#888';
    ctx.font = 'italic 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('(RenderMaster not yet integrated)', centerX, centerY + 120);

    const endTime = performance.now();
    const duration = endTime - startTime;

    renderTimeDisplay.textContent = `${duration.toFixed(2)}ms`;
    setStatus('Render complete (placeholder)', 'success');

    // eslint-disable-next-line no-console
    console.log(
      `[DevApp] Placeholder render complete in ${duration.toFixed(2)}ms for ${String(currentLayers.length)} layers`
    );
  } catch (error) {
    setStatus('Render failed', 'error');
    showError(error instanceof Error ? error : new Error(String(error)));
  } finally {
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

canvasWidthInput.addEventListener('change', updateCanvasDimensions);
canvasHeightInput.addEventListener('change', updateCanvasDimensions);

renderBtn.addEventListener('click', () => {
  renderLayers();
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
