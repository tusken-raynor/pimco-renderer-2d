import utils, { type WorkerSuite } from "@/utils";
import { sobelNormalMap } from "@/wasm";
import EffectsWorker from "./worker?worker";
import WebGLPostProcessor, { Uniforms } from "webgl-postprocessor";
import alphaErodeFragmentSrc from "@/shaders/alpha_erode.frag.glsl?raw";
import embroidFuzzFragmentSrc from "@/shaders/embroidery_fuzz.frag.glsl?raw";
import specCrossfadeFragmentSrc from "@/shaders/special_crossfade.frag.glsl?raw";

const TILED_IMAGES: { [key: string]: HTMLCanvasElement } = {};
const SAVED_IMAGES: { [key: string]: HTMLImageElement } = {};
let Worker: WorkerSuite | null = null;

let WebGLBuddy: WebGLPostProcessor = null as any;

export default {
  tile(
    image: string | HTMLImageElement | HTMLCanvasElement,
    width: number,
    height: number,
    key?: string,
  ): Promise<HTMLCanvasElement | null> {
    return new Promise((resolve, reject) => {
      // Create an image key that will be unique for each image
      const imgKey =
        key ||
        (image instanceof HTMLCanvasElement ? "" : (image instanceof Image ? image.src : image) + width + height);
      // If we saved the last time, just return that
      if (TILED_IMAGES[imgKey]) {
        resolve(TILED_IMAGES[imgKey]);
        return;
      }
      // Create the new canvas that will be returned
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      // Create the tile pattern function to be called later so we don't have to duplicate code
      const tileImage = () => {
        if (image instanceof Object) {
          const pattern = context.createPattern(image, "repeat");
          if (pattern) {
            context.fillStyle = pattern;
            context.fillRect(0, 0, canvas.width, canvas.height);
            // If there's a unique key for the tiled pattern save it for performance
            if (imgKey) {
              TILED_IMAGES[imgKey] = canvas;
            }
            resolve(canvas);
            return;
          }
        }
        resolve(null);
      };
      // Check to see if the image was already saved, and we don't have to load it
      const originalSrc = image instanceof HTMLCanvasElement ? "" : image instanceof Image ? image.src : image;
      if (SAVED_IMAGES[originalSrc]) {
        image = SAVED_IMAGES[originalSrc];
        tileImage();
        return;
      }
      // If the image is a string, create an Image Element and set the src
      if (typeof image === "string") {
        var src = image;
        image = new Image();
        image.src = src;
      }
      if (image instanceof Image) {
        // Tile the image on load
        image.addEventListener("load", () => {
          if (originalSrc) {
            SAVED_IMAGES[originalSrc] = image as HTMLImageElement;
          }
          tileImage();
        });
        // If the image is no bueno, return null
        image.addEventListener("error", () => {
          resolve(null);
        });
        // Set the src again in case the image parameter was an Image Element
        image.src = image.src;
        return;
      } else {
        // If it's a canvas, just start tiling
        tileImage();
        return;
      }
    });
  },
  emboss(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    invertedMatrix: number[][] | boolean = false,
  ) {
    const matrix =
      invertedMatrix === false
        ? [
            [0, -1, -1],
            [0, -1, 1],
            [1, 1, 0],
          ]
        : invertedMatrix === true
          ? [
              [0, 1, 1],
              [1, -1, 0],
              [-1, -1, 0],
            ]
          : invertedMatrix;
    const imageData = context.getImageData(0, 0, width, height);
    let nImageData = context.createImageData(width, height);
    nImageData = convolute(imageData, matrix, nImageData, 0, 0, width, height);
    context.putImageData(nImageData, 0, 0);
  },
  fuzz(context: CanvasRenderingContext2D, fuzzScale = 1.0) {
    const buddy = myWebGLBuddy()?.wake();
    if (!buddy) {
      console.warn("WebGL2 is not supported in this browser, skipping fuzz effect");
      return;
    }
    if (buddy.hasProgram("embroid_fuzz")) {
      buddy.useProgram("embroid_fuzz");
    } else {
      buddy.newProgram("embroid_fuzz", {
        fragmentSrc: embroidFuzzFragmentSrc,
        fragmentKey: "f_embroid_fuzz",
      });
    }
    buddy.setResolution(context.canvas.width, context.canvas.height);
    buddy
      .setUniforms({
        uFuzzScale: {
          type: Uniforms.FLOAT1,
          value: fuzzScale,
        },
        uTexelSizeX: {
          type: Uniforms.FLOAT1,
          value: 1.0 / context.canvas.width,
        },
        uSeedOffset: {
          type: Uniforms.INT1,
          value: Math.random() * 1000,
        },
        uInput: {
          type: Uniforms.TEXTURE2D,
          value: context.canvas,
        },
      })
      .to(context);
    // Remove the input texture from GPU memory and go back to sleep
    buddy.unsetTextureUniforms("uInput").sleep();
  },
  invert(context: CanvasRenderingContext2D, width: number, height: number) {
    const imageData = context.getImageData(0, 0, width, height);
    var data = imageData.data;
    var length = data.length;
    for (var idx = 0; idx < length; idx += 4) {
      data[idx] = 255 - data[idx]; // red channel
      data[idx + 1] = 255 - data[idx + 1]; // green channel
      data[idx + 2] = 255 - data[idx + 2]; // blue channel
      // data[idx + 3] = (data[idx]+data[idx + 1]+data[idx + 2])/3;
    }
    context.putImageData(imageData, 0, 0);
  },
  blackToAlpha(context: CanvasRenderingContext2D, width: number, height: number) {
    const imageData = context.getImageData(0, 0, width, height);
    var data = imageData.data;
    var length = data.length;
    for (var idx = 0; idx < length; idx += 4) {
      // if (!(idx%6)) console.log("VALUE:", data[idx], data[idx+1], data[idx+2]);
      var alpha = data[idx];
      data[idx] = 255; // red channel
      data[idx + 1] = 255; // green channel
      data[idx + 2] = 255; // blue channel
      data[idx + 3] = alpha;
    }
    context.putImageData(imageData, 0, 0);
  },
  whiteToAlpha(context: CanvasRenderingContext2D, width: number, height: number) {
    const imageData = context.getImageData(0, 0, width, height);
    var data = imageData.data;
    var length = data.length;
    for (var idx = 0; idx < length; idx += 4) {
      var alpha = 255 - data[idx];
      data[idx] = 0; // red channel
      data[idx + 1] = 0; // green channel
      data[idx + 2] = 0; // blue channel
      data[idx + 3] = alpha;
    }
    context.putImageData(imageData, 0, 0);
  },
  colorBurn(ctx: CanvasRenderingContext2D, width: number, height: number, colorArray: number[]) {
    const imageData = ctx.getImageData(0, 0, width, height);
    var data = imageData.data;
    var length = data.length;
    for (var idx = 0; idx < length; idx += 4) {
      const color = highlightSaturate([data[idx], data[idx + 1], data[idx + 2]], colorArray);
      data[idx] = color[0]; // red channel
      data[idx + 1] = color[1]; // green channel
      data[idx + 2] = color[2]; // blue channel
    }
    ctx.putImageData(imageData, 0, 0);
  },
  normalMap(context: CanvasRenderingContext2D, width: number, height: number, direction = "N") {
    const data = context.getImageData(0, 0, width, height).data;
    const directionIndex = Math.max(["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(direction.toUpperCase()), 0);
    const normalData = sobelNormalMap(new Uint8Array(data), width, height, directionIndex);
    context.putImageData(new ImageData(new Uint8ClampedArray(normalData), width, height), 0, 0);
  },
  colorScale(context: CanvasRenderingContext2D, width: number, height: number, intensity: number) {
    const imageData = context.getImageData(0, 0, width, height);
    var data = imageData.data;
    for (var idx = 0; idx < data.length; idx += 4) {
      data[idx] = (data[idx] - 128) * intensity + 128;
      data[idx + 1] = (data[idx + 1] - 128) * intensity + 128;
      data[idx + 2] = (data[idx + 2] - 128) * intensity + 128;
    }
    context.putImageData(imageData, 0, 0);
  },
  /**
   * Apply a blur filter to the canvas in browser that doesn't support Canvas Context filters
   * @param canvas
   * @param blurAmount
   */
  applyFilter(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, filter: string) {
    return new Promise<void>(async (resolve) => {
      const canvas = context.canvas;

      const filterString = generateSVGFilters(filter);
      if (!filterString) {
        resolve();
        return;
      }

      const img = new Image();
      img.addEventListener("load", () => {
        const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
            <defs>
              <filter id="d-svg-generated-filter" x="0" y="0">${filterString}</filter>
            </defs>
            <image x="0" y="0" width="${canvas.width}" height="${canvas.height}" href="${img.src}" filter="url(#d-svg-generated-filter)"/>
          </svg>`;
        const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const svgUrl = URL.createObjectURL(svgBlob);
        // Create the data URL
        // const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        // console.log(svg);
        // console.log(svgUrl);
        const svgImg = new Image();
        svgImg.src = svgUrl;
        // document.body.appendChild(svgImg);

        svgImg.onload = () => {
          // Unfortunately, we have to wait a bit longer to garantuee the image loads in certain browsers
          setTimeout(() => {
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(svgImg, 0, 0);

            URL.revokeObjectURL(svgUrl);
            resolve();
          }, 5);
        };
      });
      img.src = await utils.imageDataOrCanvasToDataURL(canvas);
    });
  },
  processRenderedImage(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const tasks: Array<{ type: string; [key: string]: any }> = [];
    return {
      crop() {
        tasks.push({ type: "crop" });
        return this;
      },
      frame(width: number, height: number) {
        tasks.push({ type: "frame", width, height });
        return this;
      },
      resize(width: number, height: number) {
        tasks.push({ type: "resize", width, height });
        return this;
      },
      execute(): Promise<void> {
        return new Promise(async (res) => {
          if (!Worker) {
            Worker = utils.createWorkerSuite(new EffectsWorker());
          }
          const processedImage = await Worker.post({ tasks, imageData }, [imageData.data.buffer]);
          // Put the new image data back onto the canvas
          ctx.canvas.width = processedImage.width;
          ctx.canvas.height = processedImage.height;
          ctx.putImageData(processedImage, 0, 0);
          res();
        });
      },
    };
  },
  alphaErode: alphaErode,
  myWebGLBuddy,
  startSpecialCrossFadeAnimation,
};

function highlightSaturate(colorArray: [number, number, number], multiplyColor: number[]): [number, number, number] {
  let newRed = colorArray[0] << 1;
  let newGreen = colorArray[1] << 1;
  let newBlue = colorArray[2] << 1;
  // If any of the colors are greater than 255, subtract the difference from the others
  // Also Divide by for to distribute the extra color to the other channels
  let extraRed = Math.max(0, newRed - 255) >> 1;
  let extraGreen = Math.max(0, newGreen - 255) >> 1;
  let extraBlue = Math.max(0, newBlue - 255) >> 1;
  newRed = (Math.min(255, newRed) * multiplyColor[0]) >> 8;
  newGreen = (Math.min(255, newGreen) * multiplyColor[1]) >> 8;
  newBlue = (Math.min(255, newBlue) * multiplyColor[2]) >> 8;
  // Distribute the extra color to the other channels
  newRed += extraGreen + extraBlue;
  newGreen += extraRed + extraBlue;
  newBlue += extraRed + extraGreen;
  return [Math.min(newRed, 255), Math.min(newGreen, 255), Math.min(newBlue, 255)];
}

/**
 * This function was extracted from source code of a demonstration online
 * so it is not very human readable.
 */
function convolute(
  input: ImageData,
  matrix: number[][],
  output: ImageData,
  xPos: number,
  yPos: number,
  width: number,
  height: number,
) {
  for (
    var a,
      u,
      l,
      c,
      f,
      h = matrix.length,
      d = Math.floor(h / 2),
      p = boundCoordinates(xPos, yPos, width, height, input.width, input.height),
      m = p.height,
      v = p.width,
      y = input.data,
      x = 0,
      b = p.top,
      w = p.left,
      S = [0, 0, 0, 255],
      C = output.data,
      T = m + b,
      E = v + w,
      A = b;
    A < T;
    A++
  ) {
    ((c = A - d), (x = 4 * (A * v + w)));
    for (var M = w; M < E; M++) {
      ((f = M - d), (S[0] = S[1] = S[2] = 0));
      for (var k = 0; k < h; k++) {
        l = (c + k) * v;
        for (var N = 0; N < h; N++) {
          ((u = f + N), (a = 4 * (l + u)));
          var I = y[a];
          if (!isNaN(I)) {
            var D = matrix[k][N];
            ((S[0] += I * D), (S[1] += y[a + 1] * D), (S[2] += y[a + 2] * D));
          }
        }
      }
      ((C[x] = S[0]), (C[x + 1] = S[1]), (C[x + 2] = S[2]), (C[x + 3] = 255), (x += 4));
    }
  }
  return output;
}

function boundCoordinates(t: number, e: number, n: number, r: number, i: number, o: number) {
  return (
    (t = u(t || 0, i)),
    (e = u(e || 0, o)),
    (r = Math.min(o - e, r || o)),
    (n = Math.min(i - t, n || i)),
    { left: t, top: e, height: r, width: n }
  );
}

function u(t: number, e: number) {
  return t - e * (l(e) * Math.floor(t / Math.abs(e)));
}

function l(t: number) {
  return t >= 0 ? 1 : -1;
}

const SVG_FILTERS = {
  blur: (amount: number) => `<feGaussianBlur in="SourceGraphic" stdDeviation="${amount}" />`,
  contrast: (amount: number) => {
    const intercept = 0.5 * (1 - amount);
    return `<feComponentTransfer>
      <feFuncR type="linear" slope="${amount}" intercept="${intercept}" />
      <feFuncG type="linear" slope="${amount}" intercept="${intercept}" />
      <feFuncB type="linear" slope="${amount}" intercept="${intercept}" />
    </feComponentTransfer>`;
  },
  brightness: (amount: number) => {
    return `<feComponentTransfer>
      <feFuncR type="linear" slope="${amount}" />
      <feFuncG type="linear" slope="${amount}" />
      <feFuncB type="linear" slope="${amount}" />
    </feComponentTransfer>`;
  },
};
function generateSVGFilters(filterString: string) {
  const filters = filterString.match(/(\w+)\(([^)]+)\)/g);
  if (!filters?.length) return "";
  let filtersSVGString = "";
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const [_, filterName, args] = filter.match(/(\w+)\(([^)]+)\)/)!;
    const filterFunction = SVG_FILTERS[filterName];
    if (filterFunction) {
      filtersSVGString += filterFunction(
        ...args.split(",").map((arg) => {
          const wasPercentage = arg.endsWith("%");
          const value = parseFloat(arg);
          if (isNaN(value)) return arg;
          return wasPercentage ? value / 100 : value;
        }),
      );
    }
  }
  return filtersSVGString;
}

function alphaErode(
  radius: number,
  input: HTMLCanvasElement | OffscreenCanvas,
  target: HTMLCanvasElement | OffscreenCanvas,
) {
  // Use the webgl buddy to shrink the mask by one pixel
  const buddy = myWebGLBuddy()?.wake();
  if (!buddy) {
    console.warn("WebGL2 is not supported in this browser, skipping alpha erode effect");
    return;
  }
  if (buddy.hasProgram("alpha_erode")) {
    buddy.useProgram("alpha_erode");
  } else {
    buddy.newProgram("alpha_erode", {
      fragmentSrc: alphaErodeFragmentSrc,
      fragmentKey: "f_alpha_erode",
    });
  }
  const start = Math.ceil(-radius);
  const end = Math.ceil(radius);
  const texelSizeX = 1.0 / input.width;
  const texelSizeY = 1.0 / input.height;
  buddy.setResolution(input.width, input.height);
  buddy
    .setUniforms({
      uStart: {
        type: Uniforms.INT1,
        value: start,
      },
      uEnd: {
        type: Uniforms.INT1,
        value: end,
      },
      uTexelSizeX: {
        type: Uniforms.FLOAT1,
        value: texelSizeX,
      },
      uTexelSizeY: {
        type: Uniforms.FLOAT1,
        value: texelSizeY,
      },
      uInput: {
        type: Uniforms.TEXTURE2D,
        value: input,
      },
    })
    .to(target);
  // Remove the input texture from GPU memory and go back to sleep
  buddy.unsetTextureUniforms("uInput").sleep();
}

function startSpecialCrossFadeAnimation(
  input1: HTMLCanvasElement | OffscreenCanvas,
  input2: HTMLCanvasElement | OffscreenCanvas,
  target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
) {
  const buddy = myWebGLBuddy()?.wake();
  if (!buddy) {
    console.warn("WebGL2 is not supported in this browser, skipping cross fade animation");
    return {
      step() {},
      end() {},
    };
  }
  if (buddy.hasProgram("cross_fade")) {
    buddy.useProgram("cross_fade");
  } else {
    buddy.newProgram("cross_fade", {
      fragmentKey: "f_cross_fade",
      fragmentSrc: specCrossfadeFragmentSrc,
    });
  }
  buddy.setResolution(target.canvas.width, target.canvas.height).setUniforms({
    uInput1: {
      type: Uniforms.TEXTURE2D,
      value: input1,
    },
    uInput2: {
      type: Uniforms.TEXTURE2D,
      value: input2,
    },
  });
  return {
    step(progress: number) {
      buddy.setResolution(target.canvas.width, target.canvas.height);
      buddy
        .setUniforms({
          uProgress: {
            type: Uniforms.FLOAT1,
            value: progress,
          },
        })
        .to(target);
    },
    end() {
      buddy.unsetTextureUniforms("uInput1");
      buddy.unsetTextureUniforms("uInput2").sleep();
    },
  };
}

function myWebGLBuddy() {
  if (!WebGLPostProcessor.isWebGL2Supported()) {
    return null;
  }
  if (!WebGLBuddy) {
    WebGLBuddy = new WebGLPostProcessor();
  }
  return WebGLBuddy;
}
