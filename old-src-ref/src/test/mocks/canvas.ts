import { vi } from "vitest";

/**
 * Create a mock 2D canvas rendering context
 */
export function createMockContext2D() {
  return {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    canvas: { width: 1350, height: 1350 },

    // Drawing methods
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(1350 * 1350 * 4),
      width: 1350,
      height: 1350,
    })),
    putImageData: vi.fn(),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    })),

    // Path methods
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    clip: vi.fn(),
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),

    // Transform methods
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    transform: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),

    // Text methods
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn((text: string) => ({
      width: text.length * 10,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 10,
      fontBoundingBoxAscent: 10,
      fontBoundingBoxDescent: 2,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    })),

    // Gradient/pattern
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createConicGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createPattern: vi.fn(() => null),

    // Compositing
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),

    // Shadow
    shadowBlur: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowOffsetX: 0,
    shadowOffsetY: 0,

    // Image smoothing
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
  };
}

/**
 * Create a mock canvas element
 */
export function createMockCanvas(width = 1350, height = 1350) {
  const context = createMockContext2D();
  context.canvas = { width, height } as HTMLCanvasElement;

  return {
    width,
    height,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob())),
    toDataURL: vi.fn(() => "data:image/png;base64,mock"),
    transferControlToOffscreen: vi.fn(() => ({
      width,
      height,
      getContext: vi.fn(() => context),
    })),
    getBoundingClientRect: vi.fn(() => ({
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
    })),
    _context: context, // Expose for assertions
  };
}

/**
 * Mock WebGL context for 3D rendering tests
 */
export function createMockWebGLContext() {
  return {
    canvas: { width: 1350, height: 1350 },
    drawingBufferWidth: 1350,
    drawingBufferHeight: 1350,

    // WebGL methods
    getExtension: vi.fn(() => null),
    getParameter: vi.fn(() => null),
    getShaderPrecisionFormat: vi.fn(() => ({ precision: 23 })),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    createFramebuffer: vi.fn(() => ({})),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    viewport: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    drawArrays: vi.fn(),
    drawElements: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform4f: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    blendFuncSeparate: vi.fn(),
    depthFunc: vi.fn(),
    cullFace: vi.fn(),
    frontFace: vi.fn(),
    activeTexture: vi.fn(),
    generateMipmap: vi.fn(),
    pixelStorei: vi.fn(),
    readPixels: vi.fn(),
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteFramebuffer: vi.fn(),

    // Constants
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,
    FLOAT: 5126,
    UNSIGNED_SHORT: 5123,
    TRIANGLES: 4,
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_MIN_FILTER: 10241,
    LINEAR: 9729,
    NEAREST: 9728,
    FRAMEBUFFER: 36160,
    COLOR_ATTACHMENT0: 36064,
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    DEPTH_TEST: 2929,
    BLEND: 3042,
    CULL_FACE: 2884,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    LESS: 513,
    LEQUAL: 515,
    BACK: 1029,
    CCW: 2305,
    TEXTURE0: 33984,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
  };
}
