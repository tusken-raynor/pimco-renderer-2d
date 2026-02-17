import effects from "@/effects";
import params from "@/params";
import {
  ImagePlacementTransform,
  PimcoMaskSubstitution,
  PimcoMaskSubstitutionCompiled,
  PimcoMaskSubstitutionDisplacement,
  PimcoMaskSubstitutionProjection,
  ProductImageComponent,
} from "@/types";
import utils from "@/utils";
import { displaceImage, getBrightness } from "@/wasm";
import CanvasWorkers, { CanvasWorker } from "./canvas-workers";
import store from "@/store";
import { loadObjFile } from "@/model3D";
import projectionVertexShaderCode from "../shaders/mask_sub_projection.vert.glsl?raw";
import projectionFragmentShaderCode from "../shaders/mask_sub_projection.frag.glsl?raw";
import { mat4 } from "gl-matrix";

const LOADED_IMAGES: Map<string, Promise<HTMLImageElement | null>> = new Map();

// Graphical
const gps = utils.filterObject(params.all(), (v, k) => k.startsWith("gr:"));
const settings = {
  displacements: "gr:displacements" in gps ? !!gps["gr:displacements"] : true,
  embroidfuzz: "gr:embroidfuzz" in gps ? !!gps["gr:embroidfuzz"] : true,
  legacydisplace: "gr:legacydisplace" in gps ? !!gps["gr:legacydisplace"] : true,
  debugmasksub: "gr:debugmasksub" in gps ? !!gps["gr:debugmasksub"] : false,
  projections: "gr:projections" in gps ? !!gps["gr:projections"] : true,
};

const dfltWeight = "700";

// These constants are used when rendering a PimcoMaskSubstitution
// They represent fractions of the canvas width
const MW = 35_000; // Default maxWidth of text. Made this number very large to effectively remove the default limit
const LH = 0.07; // Default lineHeight 

// This number is used to add a little extra height to the mask
// so that the text doesn't get cut off
const OVSC = 1.2;

export default {
  /**
   * This will take the latest version of the orderedPimcos value and redraw whatever
   * values in that on to frameCanvas1. Note that it doesn't do anything to the mainCanvas.
   */
  async draw(
    pimcos: Array<ProductImageComponent>,
    destinationContext: CanvasRenderingContext2D,
    width: number,
    height: number,
    layerResultCallback?: (getRslt: () => ImageData, pimco: ProductImageComponent) => void
  ): Promise<void> {
    destinationContext.clearRect(0, 0, width, height);

    await loadImages(pimcos);
    // Create the work canvas and work context
    const work = await CanvasWorkers.request(width, height);
    // Create the color canvas and work context
    const color = await CanvasWorkers.request(width, height);

    // loop through the pimcos indexes and pass that
    // number in to the drawStack() method, await'ing each time.
    for (let i = 0; i < pimcos.length; i++) {
      // Check to see if the pimco image is a data object instead
      if (!(pimcos[i].mask instanceof Object)) {
        await drawPimcoStack(
          pimcos[i],
          destinationContext,
          work,
          color,
          undefined,
          layerResultCallback
        );
      } else {
        // It's an object then? Okay, it should have the nessecary data to render
        // without a mask or any highlights
        await drawSubstitution(pimcos[i], destinationContext, width, height, layerResultCallback);
      }
    }
    // Release the canvas workers
    work.release();
    color.release();
  },
  drawSubstitution,
  preloadImages<T extends boolean = true>(pimcoData: object, top: boolean = true): T extends true ? Promise<void> : Record<string, string>[] {
    // Recursively traverse the pimcos object and preload all the images
    const keys = [
      "mask",
      "image",
      "hlimage1",
      "hlimage2",
      "texture"
    ];
    const list: Record<string, string>[] = [];
    const urlStore: Record<string, string> = {};
    for (const key in pimcoData) {
      const value = pimcoData[key];
      if (keys.includes(key) && typeof value === "string") {
        urlStore[key] = value;
      } else if (typeof value === "object") {
        list.push(...this.preloadImages<false>(value, false));
      }
    }
    if (Object.keys(urlStore).length) {
      list.push(urlStore);
    }
    return (top ? loadImages(list as any as ProductImageComponent[]).then(() => {}) : list) as any;
  }
};

/**
 * This will take care of drawing all of the layers required for a stack onto
 * the workCanvas with its mask so it can then be drawn to the frameCanvas1 canvas
 * only showing the resulting image for this stack.
 * This method can be considered the owner of the workCanvas and colorCanvas so it
 * will take care of clearing them out as it needs to.
 */
async function drawPimcoStack(
  pimco: ProductImageComponent,
  destination: CanvasRenderingContext2D,
  workCvs: CanvasWorker,
  colorCvs: CanvasWorker,
  altColoring = { color: "#00000000", alpha: 0, blend: "multiply" },
  layerResultCallback?: (getRslt: () => ImageData, pimco: ProductImageComponent) => void
): Promise<void> {
  // if (pimco.id == "picdfnqxwyBhx4") console.log("Drawing pimco", pimco);
  workCvs.ctx.globalCompositeOperation = "source-over";
  workCvs.ctx.globalAlpha = 1.0;
  workCvs.ctx.clearRect(0, 0, workCvs.width, workCvs.width);

  // If the pimco doesn't have it's own base image, use the base image from the model
  const workUrl = pimco.image;
  const workImg = await loadImage(workUrl);
  if (!workImg) {
    return;
  }
  const { left, top, width, height, transform } = derivePlacement(pimco, workCvs.width, workCvs.height, workImg.width, workImg.height);

  if (transform) {
    applyTransformSequence(workCvs.ctx, transform);
  }
  workCvs.ctx.drawImage(workImg, left, top, width, height);

  // Set the color or the texture image for the colorCanvas
  colorCvs.ctx.clearRect(0, 0, colorCvs.width, colorCvs.height);
  workCvs.ctx.globalCompositeOperation = pimco.blend as GlobalCompositeOperation;
  workCvs.ctx.globalAlpha = pimco.alpha;
  if (pimco.mode == "color") {
    if (pimco.color && typeof pimco.color == "string") {
      colorCvs.ctx.fillStyle = pimco.color;
    } else {
      // need to use the alternative color setup
      workCvs.ctx.globalCompositeOperation =
        altColoring.blend as GlobalCompositeOperation;
      workCvs.ctx.globalAlpha = altColoring.alpha;
      colorCvs.ctx.fillStyle = altColoring.color;
    }
    colorCvs.ctx.fillRect(0, 0, colorCvs.width, colorCvs.height);
    workCvs.ctx.drawImage(colorCvs.canvas, left, top, width, height);
  } else {
    if (pimco.texture) {
      const textureImage = await loadImage(pimco.texture);
      if (!textureImage) {
        return;
      }
      workCvs.ctx.drawImage(textureImage, left, top, width, height);
    }
  }

  // load up the highlight and draw on to the work canvas with blending and opacity
  if (pimco.hlimage1 && pimco.hlalpha1 && pimco.hlblend1) {
    const highlightImg = await loadImage(pimco.hlimage1);
    if (!highlightImg) {
      return;
    }
    workCvs.ctx.globalCompositeOperation =
      pimco.hlblend1 as GlobalCompositeOperation;
    workCvs.ctx.globalAlpha = pimco.hlalpha1;
    workCvs.ctx.drawImage(highlightImg, left, top, width, height);
    // We'll use the alpha property as the base identifier for the second highlight
    // and fill the other values using values from the first highlight if needed
    if (pimco.hlalpha2) {
      const highlightImg2 = await loadImage(pimco.hlimage2 || pimco.hlimage1);
      if (!highlightImg2) {
        return;
      }
      workCvs.ctx.globalCompositeOperation = (pimco.hlblend2 ||
        pimco.hlblend1) as GlobalCompositeOperation;
      workCvs.ctx.globalAlpha = pimco.hlalpha2;
      workCvs.ctx.drawImage(highlightImg2, left, top, width, height);
    }
  }

  // last get the mask and mask the work canvas out before drawing on to the main canvas
  if (pimco.mask instanceof Object) {
    return;
  }
  const maskImg = await loadImage(pimco.mask);
  if (!maskImg) {
    return;
  }
  workCvs.ctx.globalCompositeOperation = "destination-in";
  workCvs.ctx.globalAlpha = 1.0;
  workCvs.ctx.drawImage(maskImg, left, top, width, height);
  if (transform) {
    workCvs.ctx.resetTransform();
  }

  if (layerResultCallback) {
    layerResultCallback(() => workCvs.ctx.getImageData(0, 0, workCvs.width, workCvs.height), pimco);
  }

  // draw that on to the frame canvas
  destination.globalCompositeOperation = pimco.compositemode || "source-over";
  destination.globalAlpha = pimco['compositealpha'] || 1.0;
  destination.drawImage(workCvs.canvas, 0, 0, workCvs.width, workCvs.height, 0, 0, destination.canvas.width, destination.canvas.height);
  destination.globalCompositeOperation = "source-over";
}

// convenience method for loading images, with a basic in-memory caching mechanism
function loadImage(url: string): Promise<HTMLImageElement | null> {
  // see if we've already loaded this image
  if (LOADED_IMAGES.has(url)) {
    const element = LOADED_IMAGES.get(url);
    if (element !== undefined) {
      // yep we have, just resolve to that
      return element;
    } else {
      console.log("we should not be getting here");
      return Promise.resolve(null);
    }
  } else {
    // not yet, go ahead and load it up
    const p = new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.addEventListener("load", () => {
        // make sure to save it in the cache
        resolve(image);
      });
      image.addEventListener("error", () => {
        resolve(null);
      });
      image.src = url;
    });
    LOADED_IMAGES.set(url, p);
    return p;
  }
}
// I don't like this because we're putting logic in two places but it is necessary
// so we don't have a single request, blocking loading queue of images. This is to
// ensure that all images are preloading before drawing them on the stack and it won't
// block for each image loading request, just make all of them and wait until they're
// all completed.
function loadImages(
  pimcos: Array<ProductImageComponent>
): Promise<Array<HTMLImageElement | null>> {
  const loaders: Array<Promise<HTMLImageElement | null>> = [];
  for (const idx in pimcos) {
    const pimco = pimcos[idx];
    loaders.push(loadImage(pimco.image));
    if (pimco.mode != "color") {
      if (pimco.texture) {
        loaders.push(loadImage(pimco.texture));
      }
    }
    if (pimco.hlimage1) {
      loaders.push(loadImage(pimco.hlimage1));
    }
    if (pimco.hlimage2) {
      loaders.push(loadImage(pimco.hlimage2));
    }
    // Check if the mask is an object, which would mean its a substitution
    if (!(pimco.mask instanceof Object)) {
      loaders.push(loadImage(pimco.mask));
    }
  }
  return Promise.all(loaders);
}

async function drawSubstitution(
  pimco: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layerResultCallback?: (getRslt: () => ImageData, pimco: ProductImageComponent) => void
) {
  let textSource = await useEffect(pimco.mask.effect, pimco, width, height);
  if (textSource) {
    // If we have a displacement map, create a source with only the layer to be displaced
    let oldContext: CanvasRenderingContext2D | null = null;
    const mutateAlternateSource = pimco.mask.displace && settings.displacements || pimco.mask.postmask || layerResultCallback;
    if (mutateAlternateSource) {
      const newCanvas: HTMLCanvasElement = window['__subCanvas'] || document.createElement("canvas");
      newCanvas.width = width;
      newCanvas.height = height;
      oldContext = context;
      context = window['__subContext'] || newCanvas.getContext("2d") as CanvasRenderingContext2D;
      if (!window['__subCanvas']) {
        // Save the canvas and context for later use
        window['__subCanvas'] = newCanvas;
        window['__subContext'] = context;
      }
    }
    if (pimco.mask.projection && settings.projections) {
      await applyWithProjection(context, textSource, pimco as any, context.canvas.width, context.canvas.height, true);
    } else {
      applyWithTransformation(context, textSource!, pimco, width, height);
    }
    if (pimco.mask.displace && settings.displacements) {
      // Apply the displacement onto the layer and then render it to the original canvas
      await applyPixelDisplacement(context, pimco.mask.displace, width, height);
    }
    if (pimco.mask.postmask) {
      // If the mask substitution has a postmask, we need to apply it
      const postMask = await loadImage(pimco.mask.postmask);
      if (postMask) {
        context.globalCompositeOperation = "destination-in";
        context.globalAlpha = 1.0;
        context.drawImage(postMask, 0, 0, width, height);
      }
    }
    if (mutateAlternateSource) {
      const oggco = context.globalCompositeOperation;
      oldContext!.globalCompositeOperation = "source-over";
      if (layerResultCallback) {
        layerResultCallback(() => context.getImageData(0, 0, context.canvas.width, context.canvas.height), pimco);
      }
      oldContext!.drawImage(context.canvas, 0, 0);
      oldContext!.globalCompositeOperation = oggco;
      context = oldContext!;
    }
    // Mount the text canvas to the document for debugging purposes
    if (settings.debugmasksub) {
      const previousCanvas = document.querySelector('#debugmasksub');
      if (previousCanvas) {
        previousCanvas.remove();
      }
      if (textSource instanceof HTMLCanvasElement) {
        textSource.id = 'debugmasksub';
        document.body.appendChild(textSource);
        textSource.style.position = 'absolute';
        textSource.style.top = '0';
        textSource.style.left = '0';
        textSource.style.backgroundColor = '#CCA47F';
      }
    }
  } else if (settings.debugmasksub) {
    const previousCanvas = document.querySelector('#debugmasksub');
    if (previousCanvas) {
      previousCanvas.remove();
    }
  }
}

async function useEffect(
  name: string | undefined,
  pimco: ProductImageComponent & { mask: PimcoMaskSubstitution },
  width: number,
  height: number
) {
  if (name == "engraving") {
    return await engravingEffect(pimco, width, height);
  } else if (name == "embroidery") {
    return await embroideryEffect(pimco, width, height);
  } else if (name == "metal") {
    return await metalEffect(pimco, width, height);
  } else if (name == "foil") {
    return await foilEffect(pimco, width, height);
  } else if (name == "hotstamp") {
    return await hotstampEffect(pimco, width, height);
  } else if (name == "painted") {
    return await paintedEffect(pimco, width, height);
  } else if (name == "normal") {
    return await normalEffect(pimco, width, height);
  } else if (name == "shadow") {
    return await shadowEffect(pimco, width, height);
  } else {
    return await noEffect(pimco, width, height);
  }
}

function preEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  drawWorker: CanvasWorker,
  maskWorker: CanvasWorker,
  workWidth: number,
  workHeight: number
): boolean {
  const text = sub.mask.content || "";
  if (text) {
    // I really hate this next part
    // If the font is AlternateGothicPro-No1 and the OS is iOS, the font weight needs to be 400
    const fontWeight = sub.mask.type?.fontfamily?.includes("AlternateGothicPro-No1") &&
    (window as any).OS == "iOS"
      ? "400"
      : (sub.mask.type?.fontweight || dfltWeight);
    // If the text is to be drawn along a path, we need to send it to the preEffectPathed function
    // so that a dynamic svg can be generated and rendered to the canvas
    if (sub.mask.type?.path) {
      return preEffectPathed(sub, drawWorker, maskWorker, workWidth, workHeight, text, fontWeight);
    }
    // Setup the proper styles
    let height = workWidth * (sub.mask.type?.lineheight || LH);
    drawWorker.ctx.font = `${fontWeight} ${height}px/100% ${
      sub.mask.type?.fontfamily || "sans-serif"
    }`;
    if ("letterSpacing" in drawWorker.ctx) {
      drawWorker.ctx.letterSpacing = sub.mask.type?.letterspacing || "";
    }
    // Measure the width of the text
    let width = drawWorker.ctx.measureText(text).width * (sub.mask.type?.widthscale || 1);
    // Make sure to rescale the text if it is too long
    const textScale = Math.min(
      workWidth * (sub.mask.type?.maxwidth || MW) / width,
      1
    );
    if (textScale !== 1) {
      // We need to adjust all the metrics
      height =
        (workWidth * (sub.mask.type?.lineheight || LH)) * textScale;
      drawWorker.ctx.font = `${fontWeight} ${height}px/100% ${
        sub.mask.type?.fontfamily || "sans-serif"
      }`;
      width = drawWorker.ctx.measureText(text).width * (sub.mask.type?.widthscale || 1);
    }
    width = Math.floor(width * (sub.mask.type?.widthscale || 1));
    height = Math.floor(height * OVSC * (sub.mask.type?.heightscale || 1));
    drawWorker.width = width;
    drawWorker.height = height;
    maskWorker.width = width;
    maskWorker.height = height;
    maskWorker.ctx.font = `${fontWeight} ${height / OVSC}px/100% ${
      sub.mask.type?.fontfamily || "sans-serif"
    }`;
    if ("letterSpacing" in maskWorker.ctx) {
      maskWorker.ctx.letterSpacing = sub.mask.type?.letterspacing || "";
    }
    return true;
  }
  return false;
}

const generatedPathImages: Map<object, HTMLImageElement | Promise<HTMLImageElement>> = new Map();
function preEffectPathed(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  drawWorker: CanvasWorker,
  maskWorker: CanvasWorker,
  workWidth: number,
  workHeight: number,
  text: string,
  fontWeight: string | number
): boolean {
  const path = sub.mask.type?.path!;
  const pathWidthData = typeof path.width == "number" ? { value: path.width, unit: '' } : utils.parseCssNumber(path.width);
  const pathHeightData = typeof path.height == "number" ? { value: path.height, unit: '' } : utils.parseCssNumber(path.height);
  let pathWidth = pathWidthData.value;
  let pathHeight = pathHeightData.value;
  if (pathWidthData.unit == '%') {
    pathWidth = workWidth * pathWidth / 100;
  }
  if (pathHeightData.unit == '%') {
    pathHeight = workHeight * pathHeight / 100;
  }
  let height = path.viewbox[2] * (sub.mask.type?.lineheight || LH);
  let styleString = `font: ${fontWeight} ${height / OVSC}px/100% ${sub.mask.type?.fontfamily || "sans-serif"};`;
  if (sub.mask.type?.letterspacing) {
    styleString += `letter-spacing: ${sub.mask.type.letterspacing};`;
  }
  if (sub.mask.type?.texttransform) {
    styleString += `text-transform: ${sub.mask.type.texttransform};`;
  }
  let fontStyle = '';
  if (sub.mask.type?.fontfamily) {
    fontStyle = sub.mask.type.fontfamily.split(',').map((f) => f.trim()).filter(f => !!fontMap[f]).map(font => {
      return fontMap[font].map(({ url, details, dataUrl }) => {
        const fontPath = dataUrl ? dataUrl : (location.origin + url);
        const fontExtension = url.split('.').pop();
        return `
          @font-face {
            font-family: '${font}';
            ${Object.entries(details).map(([key, value]) => `${key}: ${value}`).join('\n')}
            src: url('${fontPath}') format('${fontExtension}');
          }\n`;
      }).join('');
    }).join('');
  }
  let startOffset = '50%';
  let textAnchor = 'middle';
  if (sub.mask.type?.alignment == "left") {
    startOffset = '0%';
    textAnchor = 'start';
  } else if (sub.mask.type?.alignment == "right") {
    startOffset = '100%';
    textAnchor = 'end';
  }
  let dominantBaseline = sub.mask.type?.path?.baseline || "alphabetic";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${path.viewbox[2]}" height="${path.viewbox[3]}" viewBox="${path.viewbox.join(' ')}">
      <defs>
        <path id="curve" d="${path.data}" fill="transparent" />
        <style>${fontStyle}</style>
      </defs>
      <text 
        style="${styleString.replaceAll('"', '&quot;')}" 
        fill="#000"
        text-anchor="${textAnchor}"
        dominant-baseline="${dominantBaseline}"
      >
        <textPath href="#curve" startOffset="${startOffset}">${text}</textPath>
      </text>
    </svg>`;
  const svgBlob = new Blob([svg], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  // const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  // console.log(svg);
  // console.log(dataUrl);
  // utils.copyToClipboard(svgUrl).then(() => {
  //   console.log('SVG copied to clipboard');
  // });
  const svgImg = new Image();
  svgImg.src = svgUrl;
  const randomId = Math.random().toString(36).substring(2, 15);
  const loadPromise = new Promise<HTMLImageElement>((resolve) => {
    svgImg.addEventListener("load", () => {
      generatedPathImages.set(sub, svgImg);
      resolve(svgImg);
    });
  });
  generatedPathImages.set(sub, loadPromise);
  drawWorker.width = pathWidth;
  drawWorker.height = pathHeight;
  maskWorker.width = pathWidth;
  maskWorker.height = pathHeight;
  return true;
}

async function drawSubstitutionMask(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled }, 
  maskWorker: CanvasWorker
) {
  if (sub.mask.type?.path) {
    const generatedPathImage = await generatedPathImages.get(sub)!;
    generatedPathImages.delete(sub);
    maskWorker.ctx.drawImage(generatedPathImage, 0, 0, generatedPathImage.width, generatedPathImage.height, 0, 0, maskWorker.width, maskWorker.height);
  } else {
    let text = sub.mask.content || "";
    if (sub.mask.type?.texttransform) {
      switch (sub.mask.type.texttransform) {
        case "uppercase":
          text = text.toUpperCase();
          break;
        case "lowercase":
          text = text.toLowerCase();
          break;
        case "capitalize":
          text = text.replace(/\b\w/g, (char) => char.toUpperCase());
          break;
      }
    }
    maskWorker.ctx.fillStyle = "#000";
    maskWorker.ctx.textBaseline = "middle";
    maskWorker.ctx.fillText(sub.mask.content || "", 0, maskWorker.height / 2);
  }
}

async function embroideryEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  mainCanvasWidth: number,
  mainCanvasHeight: number
) {
  const drawWorker = await CanvasWorkers.request(mainCanvasWidth, mainCanvasHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  const proceed = preEffect(sub, drawWorker, maskWorker, mainCanvasWidth, mainCanvasHeight);
  if (!proceed) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  await drawSubstitutionMask(sub, maskWorker);
  const erosionRadius = sub.mask.effectparams?.AlphaErosionRadius ?? 0.0;
  if (erosionRadius > 0) {
    effects.alphaErode(erosionRadius, maskWorker.cvs, maskWorker.cvs);
  }
  // Create the embossing canvases
  const emb1Worker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  const emb2Worker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  // Create the the emboss images, but only the text is above a certain size
  if (drawWorker.height > 43.5) {
    emb1Worker.ctx.fillStyle = "#fff";
    emb1Worker.ctx.fillRect(0, 0, emb1Worker.width, emb1Worker.height);
    emb1Worker.ctx.drawImage(maskWorker.cvs, 0, 0);
    emb2Worker.ctx.drawImage(emb1Worker.cvs, 0, 0);
    effects.emboss(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
    effects.emboss(emb2Worker.ctx, emb2Worker.width, emb2Worker.height, true);
    emb1Worker.ctx.fillStyle = "#000";
    emb2Worker.ctx.fillStyle = "#000";
    emb1Worker.ctx.fillRect(0, 0, emb1Worker.width, 1);
    emb2Worker.ctx.fillRect(0, emb2Worker.height - 2, emb2Worker.width, emb2Worker.height);
    effects.invert(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
    effects.whiteToAlpha(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
    effects.blackToAlpha(emb2Worker.ctx, emb2Worker.width, emb2Worker.height);
  }
  // Fetch the embroidery texture, this step will probably be replaced later
  const baseImage = await effects.tile(
    sub.image,
    Math.floor(drawWorker.width),
    Math.floor(drawWorker.height)
  );
  if (baseImage) {
    drawWorker.ctx.drawImage(baseImage, 0, 0);
  }
  // Add the color to the texture
  const color = extractDfltColorCode(sub.color);
  drawWorker.ctx.fillStyle = color;
  const brightness = getBrightness(color) / 255;
  drawWorker.ctx.globalAlpha = sub.alpha || 1.0;
  drawWorker.ctx.globalCompositeOperation = "multiply";
  drawWorker.ctx.fillRect(0, 0, drawWorker.width, drawWorker.height);
  // If the text is large enough, apply the embossing
  if (drawWorker.height > 43.5) {
    drawWorker.ctx.filter = "blur(4px)";
    drawWorker.ctx.globalAlpha = 0.7;
    drawWorker.ctx.drawImage(emb1Worker.cvs, 0, 0);
    drawWorker.ctx.globalAlpha = 1.0 - brightness;
    drawWorker.ctx.globalCompositeOperation = "lighter";
    drawWorker.ctx.drawImage(emb2Worker.cvs, 0, 0);
    drawWorker.ctx.filter = "none";
  }
  if (settings.embroidfuzz) {
    // Make the embroidery a little fuzzy
    const fuzziness = sub.mask.effectparams?.EmbroideryFuzziness ?? 1.0;
    effects.fuzz(maskWorker.ctx, fuzziness);
  }
  // Now apply the mask
  drawWorker.ctx.globalAlpha = 1;
  drawWorker.ctx.globalCompositeOperation = "destination-in";
  drawWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
  let resultWorker = drawWorker;
  if (drawWorker.height > 43.5) {
    // Apply a drop shadow
    emb1Worker.ctx.clearRect(0, 0, emb1Worker.width, emb1Worker.height);
    emb1Worker.ctx.globalAlpha = brightness * 0.7;
    emb1Worker.ctx.filter = "blur(1px)";
    emb1Worker.ctx.globalCompositeOperation = "source-over";
    emb1Worker.ctx.drawImage(maskWorker.cvs, 0, 0);
    // Overlay the text on top
    emb1Worker.ctx.globalAlpha = 1;
    emb1Worker.ctx.filter = "blur(0px)";
    emb1Worker.ctx.globalCompositeOperation = "source-over";
    emb1Worker.ctx.drawImage(drawWorker.cvs, 0, 0);
    // Return the newly drawn embroidery text
    resultWorker = emb1Worker;
  }
  
  const resultCanvas = resultWorker.cloneCanvas();
  // Release the workers
  drawWorker.release();
  maskWorker.release();
  emb1Worker.release();
  emb2Worker.release();
  // Return the newly drawn embroidery text
  return resultCanvas;
}
async function hotstampEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  mainCanvasWidth: number,
  mainCanvasHeight: number
) {
  const drawWorker = await CanvasWorkers.request(mainCanvasWidth, mainCanvasHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  const setup = preEffect(sub, drawWorker, maskWorker, mainCanvasWidth, mainCanvasHeight);
  if (!setup) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  await drawSubstitutionMask(sub, maskWorker);
  // Create the embossing canvases
  const emb1Worker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  const emb2Worker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  // Create the the emboss images, but only if the text is above a certain size
  if (drawWorker.height > 43.5) {
    emb1Worker.ctx.fillStyle = "#fff";
    emb1Worker.ctx.fillRect(0, 0, emb1Worker.width, emb1Worker.height);
    emb1Worker.ctx.drawImage(maskWorker.cvs, 0, 0);
    emb2Worker.ctx.drawImage(emb1Worker.cvs, 0, 0);
    effects.emboss(emb1Worker.ctx, emb1Worker.width, emb1Worker.height, true);
    effects.emboss(emb2Worker.ctx, emb2Worker.width, emb2Worker.height);
    emb1Worker.ctx.fillStyle = "#000";
    emb2Worker.ctx.fillStyle = "#000";
    emb1Worker.ctx.fillRect(0, 0, emb1Worker.width, 1);
    emb2Worker.ctx.fillRect(0, emb2Worker.height - 2, emb2Worker.width, emb2Worker.height);
    effects.invert(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
    effects.whiteToAlpha(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
    effects.blackToAlpha(emb2Worker.ctx, emb2Worker.width, emb2Worker.height);
  }
  // So, we're about to do some funky math to control the opacity of
  // the text based on what the color is. Basically I've applied some
  // weird bezier curve to get the opacity effect as best as I can so
  // that it looks proper with the corresponding color
  let alpha = sub.eindex;
  let dist: number;
  if (!alpha) {
    dist = utils.colorDist(
      [255, 255, 255],
      extractDfltColorCode(sub.color, "") || [0, 0, 0]
    );
    alpha =
      ((Math.pow(dist * 2.4422495703 - 1, 3) + 1) / 4) * 0.382 + 0.051;
  } else {
    dist =
      (Math.pow(Math.max(((alpha - 0.051) / 0.382) * 4 - 1, 0), 0.333333) +
        1) /
      2.4422495703;
  }
  drawWorker.ctx.fillStyle = `rgba(${35 * Math.max(1 - dist, 0)}, ${
    22 * Math.max(1 - dist, 0)
  }, 0, ${alpha})`;
  drawWorker.ctx.globalAlpha = sub.alpha || 1;
  drawWorker.ctx.globalCompositeOperation = "multiply";
  drawWorker.ctx.fillRect(0, 0, drawWorker.width, drawWorker.height);
  // If the text is large enough, apply the embossing
  if (drawWorker.height > 43.5) {
    // drawWorker.ctx.filter = "blur(0px)";
    drawWorker.ctx.globalAlpha = 0.2;
    drawWorker.ctx.drawImage(emb1Worker.cvs, 0, 0);
    drawWorker.ctx.globalAlpha = 0.2;
    drawWorker.ctx.globalCompositeOperation = "lighter";
    drawWorker.ctx.drawImage(emb2Worker.cvs, 0, 0);
    drawWorker.ctx.filter = "none";
  }
  // Now apply the mask
  drawWorker.ctx.globalAlpha = 1;
  drawWorker.ctx.globalCompositeOperation = "destination-in";
  drawWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
  // Return the newly drawn engraved text
  const drawCanvas = drawWorker.toHTMLCanvasElement();
  // Release the workers
  drawWorker.release();
  maskWorker.release();
  emb1Worker.release();
  emb2Worker.release();
  return drawCanvas;
}

async function engravingEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  mainCanvasWidth: number,
  mainCanvasHeight: number
) {
  const drawWorker = await CanvasWorkers.request(mainCanvasWidth, mainCanvasHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  const proceed = preEffect(sub, drawWorker, maskWorker, mainCanvasWidth, mainCanvasHeight);
  if (!proceed) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  await drawSubstitutionMask(sub, maskWorker);
  // Request the embossing worker
  const embWorker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  // Create the the emboss images, but only the text is above a certain size
  if (drawWorker.height > 43.5) {
    embWorker.ctx.fillStyle = "#fff";
    embWorker.ctx.fillRect(0, 0, embWorker.width, embWorker.height);
    embWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
    effects.emboss(embWorker.ctx, embWorker.width, embWorker.height, true);
    embWorker.ctx.fillStyle = "#000";
    embWorker.ctx.fillRect(0, 0, embWorker.width, 1);
    effects.invert(embWorker.ctx, embWorker.width, embWorker.height);
    effects.whiteToAlpha(embWorker.ctx, embWorker.width, embWorker.height);
  }
  // So, we're about to do some funky math to control the opacity of
  // the text based on what the color is. Basically I've applied some
  // weird bezier curve to get the opacity effect as best as I can so
  // that it looks proper with the corresponding color
  let alpha = sub.eindex;
  let dist;
  // Sorry for all the magic numbers below. I will try to clean that up one day
  if (!alpha) {
    dist = utils.colorDist(
      [255, 255, 255],
      extractDfltColorCode(sub.color, "") || [0, 0, 0]
    );
    alpha =
      ((Math.pow(dist * 2.4422495703 - 1, 3) + 1) / 4) * 0.382 + 0.051;
  } else {
    dist =
      (Math.pow(Math.max(((alpha - 0.051) / 0.382) * 4 - 1, 0), 0.333333) +
        1) /
      2.4422495703;
  }
  drawWorker.ctx.fillStyle = `rgba(${68 * Math.max(1 - dist, 0)}, ${
    34 * Math.max(1 - dist, 0)
  }, 0, ${alpha})`;
  drawWorker.ctx.globalAlpha = sub.alpha || 1;
  drawWorker.ctx.globalCompositeOperation = "multiply";
  drawWorker.ctx.fillRect(0, 0, drawWorker.width, drawWorker.height);
  // If the text is large enough, apply the embossing
  if (drawWorker.height > 43.5) {
    drawWorker.ctx.filter = "blur(1px)";
    drawWorker.ctx.globalAlpha = 0.07;
    drawWorker.ctx.drawImage(embWorker.cvs, 0, 0);
    drawWorker.ctx.filter = "none";
  }
  // Now apply the mask
  drawWorker.ctx.globalAlpha = 1;
  drawWorker.ctx.globalCompositeOperation = "destination-in";
  drawWorker.ctx.drawImage(maskWorker.cvs, 0, 0);

  // Clone the canvas and release the workers
  const drawCanvas = drawWorker.toHTMLCanvasElement();
  // Release the workers
  drawWorker.release();
  maskWorker.release();
  embWorker.release();

  // Return the newly drawn engraved text
  return drawCanvas;
}
async function metalEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  mainCanvasWidth: number,
  mainCanvasHeight: number
) {
  const drawWorker = await CanvasWorkers.request(mainCanvasWidth, mainCanvasHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  const proceed = preEffect(sub, drawWorker, maskWorker, mainCanvasWidth, mainCanvasHeight);
  if (!proceed) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  await drawSubstitutionMask(sub, maskWorker);
  // Request the embossing workers
  const emb1Worker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  const emb2Worker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  // Create the the emboss images, but only the text is above a certain size
  if (drawWorker.height > 43.5) {
    emb1Worker.ctx.fillStyle = "#fff";
    emb1Worker.ctx.fillRect(0, 0, emb1Worker.width, emb1Worker.height);
    emb1Worker.ctx.drawImage(maskWorker.cvs, 0, 0);
    emb2Worker.ctx.drawImage(emb1Worker.cvs, 0, 0);
    effects.emboss(emb1Worker.ctx, emb1Worker.width, emb1Worker.height, [
      [-1, -1, -1],
      [-1, -1, 1],
      [1, 1, 1],
    ]);
    effects.emboss(emb2Worker.ctx, emb2Worker.width, emb2Worker.height, true);
    emb1Worker.ctx.fillStyle = "#000";
    emb2Worker.ctx.fillStyle = "#000";
    emb1Worker.ctx.fillRect(0, 0, emb1Worker.width, 1);
    emb2Worker.ctx.fillRect(0, emb2Worker.height - 2, emb2Worker.width, emb2Worker.height);
    effects.invert(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
    effects.whiteToAlpha(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
    effects.blackToAlpha(emb2Worker.ctx, emb2Worker.width, emb2Worker.height);
  }
  // Fetch the embroidery texture, this step will probably be replaced later
  const baseImage = await effects.tile(
    sub.image,
    Math.floor(drawWorker.width),
    Math.floor(drawWorker.height)
  );
  if (baseImage) {
    drawWorker.ctx.drawImage(baseImage, 0, 0);
  }
  // Add the color to the texture
  drawWorker.ctx.fillStyle = extractDfltColorCode(sub.color);
  drawWorker.ctx.globalAlpha = sub.alpha || 1;
  drawWorker.ctx.globalCompositeOperation = "multiply";
  drawWorker.ctx.fillRect(0, 0, drawWorker.width, drawWorker.height);
  // If the text is large enough, apply the embossing
  if (drawWorker.height > 43.5) {
    drawWorker.ctx.globalAlpha = 0.7;
    drawWorker.ctx.drawImage(emb1Worker.cvs, 0, 0);
    drawWorker.ctx.globalAlpha = 0.3;
    drawWorker.ctx.globalCompositeOperation = "lighter";
    drawWorker.ctx.drawImage(emb2Worker.cvs, 0, 0);
  }
  // Now apply the mask
  drawWorker.ctx.globalAlpha = 1;
  drawWorker.ctx.globalCompositeOperation = "destination-in";
  drawWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
  // Clone the canvas and release the workers
  const drawCanvas = drawWorker.toHTMLCanvasElement();
  // Release the workers
  drawWorker.release();
  maskWorker.release();
  emb1Worker.release();
  emb2Worker.release();
  // Return the newly drawn metal text
  return drawCanvas;
}
async function foilEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  mainCanvasWidth: number,
  mainCanvasHeight: number
) {
  const drawWorker = await CanvasWorkers.request(mainCanvasWidth, mainCanvasHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  const proceed = preEffect(sub, drawWorker, maskWorker, mainCanvasWidth, mainCanvasHeight);
  if (!proceed) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  await drawSubstitutionMask(sub, maskWorker);
  // if (sub.mask.letterspacing && "style" in maskWorker.cvs) {
  //   maskWorker.cvs.style.letterSpacing = sub.mask.letterspacing;
  // }
  // Fetch the foil texture, this step will probably be replaced later
  const baseImage = await effects.tile(
    sub.image,
    Math.floor(drawWorker.width),
    Math.floor(drawWorker.height)
  );
  if (baseImage) {
    drawWorker.ctx.drawImage(baseImage, 0, 0);
  }
  // Create a shrink worker to shrink the mask for the foil effect
  const shrinkWorker = await CanvasWorkers.request(maskWorker.width, maskWorker.height);
  const erosionRadius = sub.mask.effectparams?.AlphaErosionRadius ?? 1;
  effects.alphaErode(erosionRadius, maskWorker.cvs, shrinkWorker.cvs);

  // Add the color to the texture
  drawWorker.ctx.fillStyle = extractDfltColorCode(sub.color);
  drawWorker.ctx.globalAlpha = sub.alpha || 1;
  drawWorker.ctx.globalCompositeOperation =
    sub.blend == "normal" ? "source-over" : sub.blend;
  drawWorker.ctx.fillRect(0, 0, drawWorker.width, drawWorker.height);
  // Now apply the shrunken mask
  drawWorker.ctx.globalAlpha = 1.0;
  drawWorker.ctx.globalCompositeOperation = "destination-in";
  drawWorker.ctx.drawImage(shrinkWorker.cvs, 0, 0);
  // Release the shrink worker
  shrinkWorker.release();
  // Just return the draw canvas if the text is too small
  if (drawWorker.height <= 43.5) {
    const drawCanvas = drawWorker.toHTMLCanvasElement();
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return drawCanvas;
  }
  // Get workers to do the embossing effect
  const emb1Worker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  const emb2Worker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  emb1Worker.ctx.fillStyle = "#fff";
  emb1Worker.ctx.fillRect(0, 0, emb1Worker.width, emb1Worker.height);
  emb1Worker.ctx.drawImage(maskWorker.cvs, 0, 0);
  emb2Worker.ctx.drawImage(emb1Worker.cvs, 0, 0);
  effects.emboss(emb1Worker.ctx, emb1Worker.width, emb1Worker.height, true);
  effects.emboss(emb2Worker.ctx, emb2Worker.width, emb2Worker.height);
  emb1Worker.ctx.fillStyle = "#000";
  emb2Worker.ctx.fillStyle = "#000";
  emb1Worker.ctx.fillRect(0, 0, emb1Worker.width, 1);
  emb2Worker.ctx.fillRect(0, emb2Worker.height - 2, emb2Worker.width, emb2Worker.height);
  effects.invert(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
  effects.whiteToAlpha(emb1Worker.ctx, emb1Worker.width, emb1Worker.height);
  effects.blackToAlpha(emb2Worker.ctx, emb2Worker.width, emb2Worker.height);
  // Create a final canvas to apply the foil effect with some shadowing and embossing
  const finalWorker = await CanvasWorkers.request(drawWorker.width + 2, drawWorker.height);
  // Apply the embossing to the final canvas
  finalWorker.ctx.globalCompositeOperation = "multiply";
  finalWorker.ctx.filter = "blur(1px)";
  finalWorker.ctx.globalAlpha = 0.1;
  finalWorker.ctx.drawImage(emb1Worker.cvs, 0, 0);
  finalWorker.ctx.globalAlpha = 0.1;
  finalWorker.ctx.globalCompositeOperation = "lighter";
  finalWorker.ctx.drawImage(emb2Worker.cvs, 0, 0);
  finalWorker.ctx.filter = "none";
  // Apply the mask blurred to get a shadow effect
  finalWorker.ctx.globalCompositeOperation = "multiply";
  finalWorker.ctx.globalAlpha = 0.2;
  finalWorker.ctx.filter = "blur(2px)";
  finalWorker.ctx.drawImage(maskWorker.cvs, 1, 0, drawWorker.width, drawWorker.height);
  finalWorker.ctx.filter = "none";
  // Draw the foil text
  finalWorker.ctx.globalAlpha = 1;
  finalWorker.ctx.globalCompositeOperation = "source-over";
  finalWorker.ctx.drawImage(drawWorker.cvs, 1, 0);
  // Return the final rendered canvas
  const finalCanvas = finalWorker.toHTMLCanvasElement();
  // Release the workers
  drawWorker.release();
  maskWorker.release();
  emb1Worker.release();
  emb2Worker.release();
  finalWorker.release();

  return finalCanvas;
}
async function paintedEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  mainCanvasWidth: number,
  mainCanvasHeight: number
) {
  const drawWorker = await CanvasWorkers.request(mainCanvasWidth, mainCanvasHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  const proceed = preEffect(sub, drawWorker, maskWorker, mainCanvasWidth, mainCanvasHeight);
  if (!proceed) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  await drawSubstitutionMask(sub, maskWorker);
  // let alpha = sub.eindex || 0.176;
  if (drawWorker.height > 43.5) {
    // Request the expansion worker
    const expandWorker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
    // We are going to need specifically an emboss worker, so request that too
    const embossWorker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
    // We are going to expand the mask around the edges to get the engraving outset by a little margin
    // Only apply the embezzling if the text is above a certain size
    expandWorker.ctx.fillStyle = "#fff";
    expandWorker.ctx.fillRect(0, 0, expandWorker.width, expandWorker.height);
    expandWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
    // Apply the expanded canvas to itself but with a filter to get the expansion;
    expandWorker.ctx.filter = "blur(1px) brightness(50%) contrast(500%) brightness(200%) contrast(200%)";
    expandWorker.ctx.drawImage(expandWorker.cvs, 0, 0);
    expandWorker.ctx.filter = "none";
    // effects.whiteToAlpha(expandWorker.ctx, expandWorker.width, expandWorker.height);
    // Apply the expanded mask to the emboss worker
    embossWorker.ctx.drawImage(expandWorker.cvs, 0, 0);
    // Now both the emboss worker and the expand worker will be used to apply the embossing
    effects.emboss(expandWorker.ctx, expandWorker.width, expandWorker.height, true);
    effects.emboss(embossWorker.ctx, embossWorker.width, embossWorker.height);
    // Now we need to cover a couple single pixel lines that are left over from the embossing effect
    expandWorker.ctx.fillStyle = "#000";
    embossWorker.ctx.fillStyle = "#000";
    expandWorker.ctx.fillRect(0, embossWorker.height - 2, expandWorker.width, embossWorker.height);
    embossWorker.ctx.fillRect(0, 0, embossWorker.width, 2);
    // Invert the colors of the first emboss worker so that it acts as the shadow
    effects.invert(expandWorker.ctx, expandWorker.width, expandWorker.height);
    // Convert the white to alpha on the first emboss worker
    effects.whiteToAlpha(expandWorker.ctx, expandWorker.width, expandWorker.height);
    // Convert the black to alpha on the second emboss worker
    effects.blackToAlpha(embossWorker.ctx, embossWorker.width, embossWorker.height);
    drawWorker.ctx.globalAlpha = sub.alpha || 1;
    drawWorker.ctx.globalCompositeOperation = "multiply";
    // drawWorker.ctx.filter = "blur(1px)";
    drawWorker.ctx.globalAlpha = 0.1;
    drawWorker.ctx.drawImage(expandWorker.cvs, 0, 0);
    drawWorker.ctx.globalAlpha = 0.05;
    drawWorker.ctx.globalCompositeOperation = "lighter";
    drawWorker.ctx.drawImage(embossWorker.cvs, 0, 0);
    drawWorker.ctx.filter = "";
    // Release the workers
    expandWorker.release();
    embossWorker.release();
  }

  // We are going to shrink the mask around the edges to get the paint inset by a little margin
  // Use the embossing worker to do this, but we need a new canvas to draw on the shrunk mask to
  const shrinkWorker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  shrinkWorker.ctx.clearRect(0, 0, drawWorker.width, drawWorker.height);
  shrinkWorker.ctx.globalCompositeOperation = "source-over";
  shrinkWorker.ctx.fillStyle = "#fff";
  shrinkWorker.ctx.fillRect(0, 0, shrinkWorker.width, shrinkWorker.height);
  shrinkWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
  shrinkWorker.ctx.fillStyle = "";
  // Reset the mask so we can apply the new shrunken mask
  maskWorker.ctx.clearRect(0, 0, maskWorker.width, maskWorker.height);
  maskWorker.ctx.globalCompositeOperation = "source-over";
  const paintedInsetShrink = sub.mask.effectparams?.PaintedInsetShrink ?? 1.0;
  maskWorker.ctx.filter = `blur(${paintedInsetShrink}px) brightness(200%) contrast(200%)`;
  maskWorker.ctx.drawImage(shrinkWorker.cvs, 0, 0);
  maskWorker.ctx.filter = "none";
  // With the mask shrunk, we now need to convert the white to alpha
  effects.whiteToAlpha(maskWorker.ctx, maskWorker.width, maskWorker.height);
  // Fetch the paint texture, apply it to the shrink worker
  let paintImagePromise = effects.tile(
    sub.image,
    Math.floor(drawWorker.width),
    Math.floor(drawWorker.height)
  );
  // Extend the workers lifespans using the promise
  drawWorker.extendBorrowTime(paintImagePromise);
  maskWorker.extendBorrowTime(paintImagePromise);
  shrinkWorker.extendBorrowTime(paintImagePromise);
  let paintImage = await paintImagePromise;
  if (paintImage) {
    shrinkWorker.ctx.drawImage(paintImage, 0, 0);
  }
  // Now apply the paint color to the shrink worker
  shrinkWorker.ctx.globalCompositeOperation = sub.blend as any || "multiply";
  shrinkWorker.ctx.globalAlpha = sub.alpha || 1;
  shrinkWorker.ctx.fillStyle = extractDfltColorCode(sub.color);
  shrinkWorker.ctx.fillRect(0, 0, shrinkWorker.width, shrinkWorker.height);
  // Now mask out the color with the shrunk mask
  shrinkWorker.ctx.globalCompositeOperation = "destination-in";
  shrinkWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
  // Now apply the paint color to the draw worker
  drawWorker.ctx.globalCompositeOperation = "source-over";
  drawWorker.ctx.globalAlpha = 1;
  drawWorker.ctx.drawImage(shrinkWorker.cvs, 0, 0);

  // Clone the canvas and release the workers
  const drawCanvas = drawWorker.toHTMLCanvasElement();
  // Release the workers
  drawWorker.release();
  maskWorker.release();
  shrinkWorker.release();

  // Return the newly drawn engraved text
  return drawCanvas;
}

async function normalEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  targetWidth: number,
  targetHeight: number
) {
  const drawWorker = await CanvasWorkers.request(targetWidth, targetHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  const proceed = preEffect(sub, drawWorker, maskWorker, targetWidth, targetHeight);
  if (!proceed) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  await drawSubstitutionMask(sub, maskWorker);

  const roundnessScale = 6 * targetWidth / 2048; // Make sure the roundness is consistent with varying texture sizes
  const roundness = (sub.mask.effectparams && 'NormalRoundness' in sub.mask.effectparams) ? sub.mask.effectparams?.['NormalRoundness'] * roundnessScale : 0;
  const roundnessWorker = await CanvasWorkers.request(drawWorker.width + roundness * 4, drawWorker.height + roundness * 4);
  roundnessWorker.ctx.filter = `blur(${roundness}px) contrast(${(10 * roundness + 100) / 100})`;
  roundnessWorker.ctx.drawImage(maskWorker.cvs, roundness * 2, roundness * 2);
  if (browser === "Safari") {
    await effects.applyFilter(roundnessWorker.ctx, roundnessWorker.ctx.filter);
  }
  roundnessWorker.ctx.filter = "none";
  maskWorker.width = roundnessWorker.width;
  maskWorker.height = roundnessWorker.height;
  maskWorker.ctx.clearRect(0, 0, maskWorker.width, maskWorker.height);
  maskWorker.ctx.drawImage(roundnessWorker.cvs, 0, 0);
  roundnessWorker.release();
  
  // Use the mask worker to draw the text with transparent background
  const intensity: number = (sub.mask.effectparams && 'NormalIntensity' in sub.mask.effectparams) ? sub.mask.effectparams?.['NormalIntensity'] : 1.0;

  const textWorker = await CanvasWorkers.request(maskWorker.width, maskWorker.height);
  // Draw the base image to the text worker
  const baseImage = await effects.tile(
    sub.image,
    Math.floor(maskWorker.width),
    Math.floor(maskWorker.height)
  );
  if (baseImage) {
    textWorker.ctx.drawImage(baseImage, 0, 0);
    textWorker.ctx.globalCompositeOperation = sub.blend as any || "multiply";
  } else {
    textWorker.ctx.globalCompositeOperation = "source-over";
  }
  // Draw the color for the text
  const color = sub.color ? extractDfltColorCode(sub.color) : "#fff";
  textWorker.ctx.fillStyle = color;
  textWorker.ctx.globalAlpha = 1.0;
  textWorker.ctx.fillRect(0, 0, textWorker.width, textWorker.height);
  // Now mask out the text using the mask worker
  textWorker.ctx.globalCompositeOperation = "destination-in";
  textWorker.ctx.drawImage(maskWorker.cvs, 0, 0);

  const normalWorker = await CanvasWorkers.request(maskWorker.width, maskWorker.height);
  // Draw a grey background
  normalWorker.ctx.fillStyle = '#000';
  normalWorker.ctx.globalAlpha = 1.0;
  normalWorker.ctx.fillRect(0, 0, normalWorker.width, normalWorker.height);
  // Draw the text worker which is also the text colored correctly
  normalWorker.ctx.globalCompositeOperation = "source-over";
  normalWorker.ctx.drawImage(textWorker.cvs, 0, 0);

  // Apply the scaling using the intensity
  effects.colorScale(normalWorker.ctx, normalWorker.width, normalWorker.height, intensity);

  // Apply the normal map effect
  effects.normalMap(normalWorker.ctx, normalWorker.width, normalWorker.height, sub.mask.effectparams?.['NormalLightDir']);

  // drawWorker.width = maskWorker.width;
  // drawWorker.height = maskWorker.height;

  // Draw the normal map to the draw worker using the mask
  drawWorker.ctx.globalCompositeOperation = "source-over";
  drawWorker.ctx.drawImage(normalWorker.cvs, -roundness * 2, -roundness * 2);
  drawWorker.ctx.globalCompositeOperation = "destination-in";
  drawWorker.ctx.drawImage(maskWorker.cvs, -roundness * 2, -roundness * 2);

  const drawCanvas = drawWorker.toHTMLCanvasElement();

  // Release the workers
  drawWorker.release();
  normalWorker.release();
  textWorker.release();
  maskWorker.release();
  
  // Return the newly drawn text
  return drawCanvas;
}
async function shadowEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  targetWidth: number,
  targetHeight: number
) {
  const drawWorker = await CanvasWorkers.request(targetWidth, targetHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  // console.log(sub);
  const proceed = preEffect(sub, drawWorker, maskWorker, targetWidth, targetHeight);
  if (!proceed) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  const color = extractDfltColorCode(sub.color);
  maskWorker.ctx.fillStyle = "#fff";
  maskWorker.ctx.fillRect(0, 0, maskWorker.width, maskWorker.height);
  await drawSubstitutionMask(sub, maskWorker);

  // const drawCanvas2 = maskWorker.toHTMLCanvasElement();
  // // Release the workers
  // maskWorker.release();
  // drawWorker.release();
  // return drawCanvas2;

  let spread = (sub.mask.effectparams && 'ShadowSpread' in sub.mask.effectparams) ? Math.round(sub.mask.effectparams?.['ShadowSpread']) : 0;
  spread = spread * targetWidth / 2048; // Make the spread resolution independent
  if (spread > 0) {
    const spreadWorker = await CanvasWorkers.request(drawWorker.width + 2 * spread, drawWorker.height + 2 * spread);
    spreadWorker.ctx.filter = `blur(${spread}px) brightness(58%) contrast(${700 * spread}%)`;
    spreadWorker.ctx.drawImage(maskWorker.cvs, spread, spread);
    if (browser === "Safari") {
      await effects.applyFilter(spreadWorker.ctx, spreadWorker.ctx.filter);
    }
    maskWorker.width = spreadWorker.width;
    maskWorker.height = spreadWorker.height;
    maskWorker.ctx.drawImage(spreadWorker.cvs, 0, 0);
    spreadWorker.release();
  }

  // Make the white background transparent
  effects.whiteToAlpha(maskWorker.ctx, maskWorker.width, maskWorker.height);

  const textWorker = await CanvasWorkers.request(maskWorker.width, maskWorker.height);
  textWorker.ctx.fillStyle = color;
  textWorker.ctx.textBaseline = "middle";
  textWorker.ctx.globalCompositeOperation = "source-over";
  textWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
  textWorker.ctx.globalCompositeOperation = "source-in";
  textWorker.ctx.fillStyle = color;
  textWorker.ctx.fillRect(0, 0, textWorker.width, textWorker.height);

  // Draw the shadow
  let blur = (sub.mask.effectparams && 'ShadowBlur' in sub.mask.effectparams) ? sub.mask.effectparams?.['ShadowBlur'] : 0;
  blur = blur * targetWidth / 2048; // Make the blur resolution independent
  let alpha = sub.alpha || 1.0;
  drawWorker.width = textWorker.width + 2 * blur;
  drawWorker.height = textWorker.height + 2 * blur;
  const shadowWorker = await CanvasWorkers.request(drawWorker.width, drawWorker.height);
  shadowWorker.ctx.globalCompositeOperation = "source-over";
  shadowWorker.ctx.filter = `blur(${blur}px)`;
  shadowWorker.ctx.drawImage(textWorker.cvs, blur, blur);
  if (browser === "Safari") {
    await effects.applyFilter(drawWorker.ctx, shadowWorker.ctx.filter);
  }
  drawWorker.ctx.globalCompositeOperation = "source-over";
  while (alpha > 0) {
    drawWorker.ctx.globalAlpha = Math.min(alpha, 1.0);
    drawWorker.ctx.drawImage(shadowWorker.cvs, 0, 0);
    alpha -= 1.0;
  }

  const drawCanvas = drawWorker.toHTMLCanvasElement();

  // Release the workers
  drawWorker.release();
  maskWorker.release();
  textWorker.release();
  shadowWorker.release();
  
  // Return the newly drawn text
  return drawCanvas;
}
async function noEffect(
  sub: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  mainCanvasWidth: number,
  mainCanvasHeight: number
) {
  const drawWorker = await CanvasWorkers.request(mainCanvasWidth, mainCanvasHeight);
  const maskWorker = await CanvasWorkers.request();
  // Run the function to setup the text effect
  const proceed = preEffect(sub, drawWorker, maskWorker, mainCanvasWidth, mainCanvasHeight);
  if (!proceed) {
    // Release the workers
    drawWorker.release();
    maskWorker.release();
    return null;
  }
  await drawSubstitutionMask(sub, maskWorker);
  // Add the base image
  const baseImage = await effects.tile(
    sub.image,
    Math.floor(drawWorker.width),
    Math.floor(drawWorker.height)
  );
  if (baseImage) {
    drawWorker.ctx.drawImage(baseImage, 0, 0);
  }

  // Add the color to the text
  drawWorker.ctx.fillStyle = extractDfltColorCode(sub.color);
  drawWorker.ctx.globalAlpha = sub.alpha || 1;
  drawWorker.ctx.globalCompositeOperation = sub.blend as any || "multiply";
  drawWorker.ctx.fillRect(0, 0, drawWorker.width, drawWorker.height);
  // Now apply the mask
  drawWorker.ctx.globalAlpha = 1;
  drawWorker.ctx.globalCompositeOperation = "destination-in";
  drawWorker.ctx.drawImage(maskWorker.cvs, 0, 0);
  // Clone the canvas and release the workers
  const drawCanvas = drawWorker.toHTMLCanvasElement();
  // Release the workers
  drawWorker.release();
  maskWorker.release();
  // Return the newly drawn text canvas
  return drawCanvas;
}
function applyWithTransformation(
  mainContext: CanvasRenderingContext2D,
  source: HTMLCanvasElement | OffscreenCanvas,
  pimco: ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled },
  width: number,
  height: number
) {
  const sub = pimco.mask;
  const originalCompositeOperation = mainContext.globalCompositeOperation;
  mainContext.globalCompositeOperation = pimco.compositemode || "source-over";
  mainContext.globalAlpha = pimco['compositealpha'] || 1.0;
  // Text alignment controls the transformation origin offset
  let offset = 0;
  if (sub.type?.alignment == "left") {
    offset = source.width / 2;
  } else if (sub.type?.alignment == "right") {
    offset = source.width / -2;
  }
  // Now apply the tranformations to a matrix
  const translateX =
    width *
    ((sub.transform?.translation ? sub.transform.translation[0] || 0 : 0) /
      100 +
      0.5);
  const translateY =
    height *
    ((sub.transform?.translation ? sub.transform.translation[1] || 0 : 0) /
      100 +
      0.5);
  const matrix = new DOMMatrix(
    `translate(${translateX}px, ${translateY}px) ${toScaleString(sub.transform?.scale)} ${toRotationString(sub.transform?.rotation)} translate(${offset}px, 0)`
  );
  mainContext.setTransform(matrix);
  // Draw the text
  mainContext.drawImage(source, source.width / -2, source.height / -2);
  // Reset everything back to what it was
  mainContext.resetTransform();
  mainContext.globalCompositeOperation = originalCompositeOperation;
}
function toScaleString(scale: number | [number, number] | undefined) {
  if (scale === undefined) {
    return "";
  }
  if (Array.isArray(scale)) {
    return `scale(${scale[0]}, ${scale[1]})`;
  }
  return `scale(${scale})`;
}
function toRotationString(rotation: string | number | undefined) {
  if (rotation === undefined) {
    return "";
  }
  if (typeof rotation === "string") {
    return `rotate(${rotation})`;
  }
  return `rotate(${rotation}deg)`;
}
async function applyPixelDisplacement(
  sourceCtx: CanvasRenderingContext2D,
  displacement: PimcoMaskSubstitutionDisplacement,
  width: number,
  height: number
) {
  const image = await loadImage(displacement.map);
  // Source canvas and displacement map must be same aspect ratio
  if (!image) return;
  // Create the displacement image canvas
  const imgCanvas = document.createElement("canvas");
  imgCanvas.width = width;
  imgCanvas.height = height;
  const imgContext = imgCanvas.getContext("2d") as CanvasRenderingContext2D;
  imgContext.drawImage(
    image,
    0,
    0,
    image.width,
    image.height,
    0,
    0,
    width,
    height
  );

  // Now let's traverse the displacement map and use it to draw on the result canvas
  const srcImageData = sourceCtx.getImageData(0, 0, width, height);
  const srcData = srcImageData.data;
  const mapImageData = imgContext.getImageData(0, 0, width, height);
  const mapData = mapImageData.data;
  const scaleX = ((displacement.scalex || 1) / 2) * width;
  const scaleY = ((displacement.scaley || 1) / 2) * height;
  let drawImageData: ImageData;
  if (settings.legacydisplace || store.state.wasmUnavailable) {
    // Create the displacement draw canvas
    const drawCanvas = document.createElement("canvas");
    drawCanvas.width = width;
    drawCanvas.height = height;
    const drawContext = drawCanvas.getContext("2d") as CanvasRenderingContext2D;
    drawImageData = drawContext.getImageData(0, 0, width, height);
    const drawData = drawImageData.data;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (row + x) << 2;
        // If the blue channel is 0, then ignore this pixel
        if (mapData[idx + 2] === 0) {
          continue;
        }
        const offsetX = Math.round(((mapData[idx] - 127) / 127) * -scaleX + x);
        const offsetY = Math.round(
          ((mapData[idx + 1] - 127) / 127) * -scaleY + y
        );
        // The lowest 4 bits of the blue channel is the alpha
        const alpha = (mapData[idx + 2] & 0xf) / 15;
        // Make sure the displacement is still within the bounds of the image
        // If not, just use the original pixel
        if (
          offsetX >= 0 &&
          offsetX < width &&
          offsetY >= 0 &&
          offsetY < height
        ) {
          const dIdx = (offsetX + width * offsetY) << 2;
          drawData[idx] = srcData[dIdx] * alpha;
          drawData[idx + 1] = srcData[dIdx + 1] * alpha;
          drawData[idx + 2] = srcData[dIdx + 2] * alpha;
          drawData[idx + 3] = srcData[dIdx + 3] * alpha;
        } else {
          drawData[idx] = srcData[idx] * alpha;
          drawData[idx + 1] = srcData[idx + 1] * alpha;
          drawData[idx + 2] = srcData[idx + 2] * alpha;
          drawData[idx + 3] = srcData[idx + 3] * alpha;
        }
      }
    }
  } else {
    const imageBuffer = new Uint8Array(srcData.buffer);
    const mapBuffer = new Uint8Array(mapData.buffer); 
    const drawBuffer = displaceImage(imageBuffer, mapBuffer, Math.floor(width), Math.floor(height), scaleX, scaleY);

    drawImageData = new ImageData(new Uint8ClampedArray(drawBuffer), width, height);
  }
  sourceCtx.clearRect(0, 0, width, height);
  sourceCtx.putImageData(drawImageData, 0, 0);
}

interface Setup3D {
  geoVertAttrBuffer: WebGLBuffer;
  webGLProgram: WebGLProgram;
  posAttrLoc: number;
  normAttrLoc: number;
  uvAttrLoc: number;
  modelMatrixLoc: WebGLUniformLocation;
  modelMatrix: mat4;
  viewMatrixLoc: WebGLUniformLocation;
  viewMatrix: mat4;
  projMatrixLoc: WebGLUniformLocation;
  projMatrix: mat4;
}
const meshBufferLibrary: Map<string, Float32Array> = new Map();
const setup3dStore: Map<string, Setup3D> = new Map();
let GL_CANVAS: HTMLCanvasElement | null = null;
let GL_CONTEXT: WebGL2RenderingContext | null = null;

async function applyWithProjection(
  target: CanvasRenderingContext2D, 
  map: HTMLCanvasElement | OffscreenCanvas, 
  pimco: ProductImageComponent & { mask: PimcoMaskSubstitution & { projection: PimcoMaskSubstitutionProjection } }, 
  width: number, 
  height: number, 
  recurringUse = false
) {
  const projection = pimco.mask.projection;
  // Only save the program for reuse if there is a way to identify it
  recurringUse = !!(projection.identifier && recurringUse);
  // Get the mesh from the library
  let meshBuffer = meshBufferLibrary.get(projection.mesh) || null;
  if (!meshBuffer) {
    // Load the mesh
    const model3d = await loadObjFile(projection.mesh);
    if (model3d && Object.keys(model3d.meshes).length > 0) {
      // Grab the first mesh from the group cause that's all we gonna support right now
      const mesh = Object.values(model3d.meshes)[0];
      // Map all the vertex data into a vertex attribute buffer
      const elementLen = mesh.vib.length * 3 + mesh.nib.length * 3 + mesh.tib.length * 2;
      meshBuffer = new Float32Array(elementLen);
      for (let i = 0; i < mesh.vib.length; i++) {
        const posIndex = mesh.vib[i] * 3;
        const normalIndex = mesh.nib[i] * 3;
        const texCoordIndex = mesh.tib[i] * 2;

        meshBuffer[i * 8] = mesh.vb[posIndex];
        meshBuffer[i * 8 + 1] = mesh.vb[posIndex + 1];
        meshBuffer[i * 8 + 2] = mesh.vb[posIndex + 2];
        meshBuffer[i * 8 + 3] = mesh.nb[normalIndex];
        meshBuffer[i * 8 + 4] = mesh.nb[normalIndex + 1];
        meshBuffer[i * 8 + 5] = mesh.nb[normalIndex + 2];
        meshBuffer[i * 8 + 6] = mesh.tb[texCoordIndex];
        meshBuffer[i * 8 + 7] = mesh.tb[texCoordIndex + 1];
      }
      // Save the mesh to the library
      meshBufferLibrary.set(projection.mesh, meshBuffer);
    } else {
      return;
    }
  }
  // Setup the 3D program to render the mesh to the target
  const glCanvas: HTMLCanvasElement = GL_CANVAS || document.createElement("canvas");
  glCanvas.width = width;
  glCanvas.height = height;
  const glContext = (GL_CONTEXT || glCanvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true })) as WebGL2RenderingContext;
  if (!GL_CANVAS) {
    GL_CANVAS = glCanvas;
    GL_CONTEXT = glContext;
  };

  // Load the text map into a texture
  // const ctx = map.getContext('2d')!;
  // ctx.globalCompositeOperation = 'source-over';
  const texture = await loadTexture(glContext, map);
  
  const setup3d = recurringUse ? setup3dStore.get(projection.identifier!) : null;

  // Create and register the vertex position buffer
  const geoVertexAttributeBuffer = setup3d?.geoVertAttrBuffer || glContext.createBuffer()!;
  glContext.bindBuffer(glContext.ARRAY_BUFFER, geoVertexAttributeBuffer);
  glContext.bufferData(glContext.ARRAY_BUFFER, meshBuffer, glContext.STATIC_DRAW);

  // Fetch the 3d program from the library if it exists, if not, we'll need to create it
  let program3d = setup3d?.webGLProgram;
  let vertexPositionAttributeLocation = setup3d?.posAttrLoc!;
  let vertexNormalAttributeLocation = setup3d?.normAttrLoc!;
  let vertexTextureAttributeLocation = setup3d?.uvAttrLoc!;
  let modelMatLoc = setup3d?.modelMatrixLoc!;
  let modelMatrix = setup3d?.modelMatrix!;
  let viewMatLoc = setup3d?.viewMatrixLoc!;
  let viewMatrix = setup3d?.viewMatrix!;
  let projMatLoc = setup3d?.projMatrixLoc!;
  let projectionMatrix = setup3d?.projMatrix!;
  if (!program3d) {
    // Make modifications to the shader programs if needed
    let vertexShaderCode = projectionVertexShaderCode;
    let fragmentShaderCode = projectionFragmentShaderCode;
    // Compile the shaders and link the program
    const vertexShader = glContext.createShader(glContext.VERTEX_SHADER)!;
    glContext.shaderSource(vertexShader, vertexShaderCode);
    glContext.compileShader(vertexShader);
    if (!glContext.getShaderParameter(vertexShader, glContext.COMPILE_STATUS)) {
      const errorMessage = glContext.getShaderInfoLog(vertexShader);
      console.warn(`Failed to compile vertex shader: ${errorMessage}`);
      return;
    }

    const fragmentShader = glContext.createShader(glContext.FRAGMENT_SHADER)!;
    glContext.shaderSource(fragmentShader, fragmentShaderCode);
    glContext.compileShader(fragmentShader);
    if (!glContext.getShaderParameter(fragmentShader, glContext.COMPILE_STATUS)) {
      const errorMessage = glContext.getShaderInfoLog(fragmentShader);
      console.warn(`Failed to compile fragment shader: ${errorMessage}`);
      return;
    }

    program3d = glContext.createProgram()!;

    glContext.attachShader(program3d, vertexShader);
    glContext.attachShader(program3d, fragmentShader);
    glContext.linkProgram(program3d);
    if (!glContext.getProgramParameter(program3d, glContext.LINK_STATUS)) {
      const errorMessage = glContext.getProgramInfoLog(program3d);
      console.warn(`Failed to link GPU program: ${errorMessage}`);
      return;
    }

    // Apply the GPU Program
    glContext.useProgram(program3d);

    // Throw the vertex positions to the shaders in the form of an attribute
    vertexPositionAttributeLocation = glContext.getAttribLocation(program3d, 'vertexPosition');
    if (vertexPositionAttributeLocation < 0) {
      console.warn(`Failed to get attribute location for vertexPosition`);
      return;
    }
    // Throw the vertex normals to the shaders in the form of an attribute
    // vertexNormalAttributeLocation = glContext.getAttribLocation(program3d, 'vertexNormal');
    // if (vertexNormalAttributeLocation < 0) {
    //   console.warn(`Failed to get attribute location for vertexNormal`);
    //   return;
    // }
    // Throw the vertex texture coordinates to the shaders in the form of an attribute
    vertexTextureAttributeLocation = glContext.getAttribLocation(program3d, 'vertexUV');
    if (vertexTextureAttributeLocation < 0) {
      console.warn(`Failed to get attribute location for vertexUV`);
      return;
    }

    modelMatLoc = glContext.getUniformLocation(program3d, 'modelMatrix')!;
    viewMatLoc = glContext.getUniformLocation(program3d, 'viewMatrix')!;
    projMatLoc = glContext.getUniformLocation(program3d, 'projectionMatrix')!;
    
    if (!modelMatLoc || !viewMatLoc || !projMatLoc) {
      console.warn('Failed to get uniform matrices\' location');
      return;
    }

    // Create the matrices
    modelMatrix = mat4.create();
    viewMatrix = mat4.create();
    projectionMatrix = mat4.create();
  } else {
    glContext.useProgram(program3d);
  }

  // Set the transformations
  mat4.lookAt(viewMatrix, projection.camera, [0, 0, 0], [0, 1, 0]);
  // apply the projection.transformation to the model matrix
  if (projection.transformation) {
    mat4.set(modelMatrix, ...projection.transformation);
  }
  // mat4.rotateX(modelMatrix, modelMatrix, 0.4 * Math.PI / 180);
  // Update the projection matrix because the canvas size may have changed
  if (projection.type == "orthographic") {
    const rect = projection.rect || [0, 1, 0, 1];
    mat4.ortho(projectionMatrix, rect[0], rect[1], rect[2], rect[3], 0.1, 100);
  } else {
    const fov = projection.fov || 60;
    mat4.perspective(projectionMatrix, fov * Math.PI / 180, glCanvas.width / glCanvas.height, 0.1, 100);
  }

  // console.log('modelMatrix', modelMatrix);
  glContext.uniformMatrix4fv(modelMatLoc, false, Array.from(modelMatrix));
  glContext.uniformMatrix4fv(viewMatLoc, false, Array.from(viewMatrix));
  glContext.uniformMatrix4fv(projMatLoc, false, Array.from(projectionMatrix));

  // Save the setup for recurring use
  if (recurringUse) {
    setup3dStore.set(projection.identifier!, {
      geoVertAttrBuffer: geoVertexAttributeBuffer,
      webGLProgram: program3d,
      posAttrLoc: vertexPositionAttributeLocation,
      normAttrLoc: vertexNormalAttributeLocation,
      uvAttrLoc: vertexTextureAttributeLocation,
      modelMatrixLoc: modelMatLoc,
      modelMatrix: modelMatrix,
      viewMatrixLoc: viewMatLoc,
      viewMatrix: viewMatrix,
      projMatrixLoc: projMatLoc,
      projMatrix: projectionMatrix,
    });
  }

  // Clear the canvas with a transparent color
  glContext.clearColor(0.0, 0.0, 0.0, 0.0);
  // glContext.clearColor(0.8, 0.6431372549019608, 0.4980392156862745, 1.0);
  glContext.clear(glContext.COLOR_BUFFER_BIT | glContext.DEPTH_BUFFER_BIT);

  // Map the canvas the viewport
  glContext.viewport(0, 0, glCanvas.width, glCanvas.height);

  glContext.enable(glContext.CULL_FACE);
  // glContext.disable(glContext.CULL_FACE);
  glContext.enable(glContext.DEPTH_TEST);
  
  glContext.enable(glContext.BLEND);
  glContext.blendFunc(glContext.ONE, glContext.ONE_MINUS_SRC_ALPHA);
  
  // glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.NEAREST);
  // glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.NEAREST);

  glContext.enableVertexAttribArray(vertexPositionAttributeLocation);
  glContext.enableVertexAttribArray(vertexNormalAttributeLocation);
  glContext.enableVertexAttribArray(vertexTextureAttributeLocation);

  // Add the texture sixe as a uniform
  const texSizeLoc = glContext.getUniformLocation(program3d, 'textureSize')!;
  glContext.uniform2i(texSizeLoc, map.width, map.height);

  const uUVOriginLoc = glContext.getUniformLocation(program3d, 'uUVOrigin')!;
  const uMeshUVTextureRatioLoc = glContext.getUniformLocation(program3d, 'uMeshUVTextureRatio')!;
  const uUVAutoXLoc = glContext.getUniformLocation(program3d, 'uUVAutoX')!;
  const uUVAutoYLoc = glContext.getUniformLocation(program3d, 'uUVAutoY')!;

  if (projection.uvauto) {
    const uMeshUVTextureRatioVal = (projection.uvmeshratio || 1.0) / (map.width / map.height);
    glContext.uniform1f(uMeshUVTextureRatioLoc, uMeshUVTextureRatioVal);
    glContext.uniform1f(uUVAutoXLoc, Number(projection.uvauto == "x"));
    glContext.uniform1f(uUVAutoYLoc, Number(projection.uvauto == "y"));
    glContext.uniform2f(uUVOriginLoc, projection.uvorigin?.[0] || 0.0, projection.uvorigin?.[1] || 0.0);
  } else {
    glContext.uniform1f(uMeshUVTextureRatioLoc, 1.0);
    glContext.uniform1f(uUVAutoXLoc, 0.0);
    glContext.uniform1f(uUVAutoYLoc, 0.0);
    glContext.uniform2f(uUVOriginLoc, 0.0, 0.0);
  }

  // Apply the texture to the shader
  glContext.activeTexture(glContext.TEXTURE0);
  glContext.bindTexture(glContext.TEXTURE_2D, texture);
  glContext.uniform1i(glContext.getUniformLocation(program3d, 'tex'), 0);

  glContext.vertexAttribPointer(
    /* index: vertex attrib location */
    vertexPositionAttributeLocation,
    /* size: number of components in the attribute */
    3,
    /* type: type of data in the GPU buffer for this attribute */
    glContext.FLOAT,
    /* normalized: if type=float and is writing to a vec(n) float input, should WebGL normalize the ints first? */
    false,
    /* stride: bytes between starting byte of attribute for a vertex and the same attrib for the next vertex */
    8 * Float32Array.BYTES_PER_ELEMENT,
    /* offset: bytes between the start of the buffer and the first byte of the attribute */
    0 * Float32Array.BYTES_PER_ELEMENT
  );
  // glContext.vertexAttribPointer(
  //   vertexNormalAttributeLocation,
  //   3,
  //   glContext.FLOAT,
  //   false,
  //   8 * Float32Array.BYTES_PER_ELEMENT,
  //   3 * Float32Array.BYTES_PER_ELEMENT
  // );
  glContext.vertexAttribPointer(
    vertexTextureAttributeLocation,
    2,
    glContext.FLOAT,
    false,
    8 * Float32Array.BYTES_PER_ELEMENT,
    6 * Float32Array.BYTES_PER_ELEMENT
  );

  // Run the draw call
  glContext.drawArrays(glContext.TRIANGLES, 0, meshBuffer.length / 8);


  // Copy the result to the target canvas
  const originalCompositeOperation = target.globalCompositeOperation;
  const originalAlpha = target.globalAlpha;
  target.globalCompositeOperation = pimco.compositemode || "source-over";
  target.globalAlpha = pimco['compositealpha'] || 1.0;
  target.drawImage(glCanvas, 0, 0);
  target.globalCompositeOperation = originalCompositeOperation;
  target.globalAlpha = originalAlpha;

  // Release the texture because we will probably never use it again
  glContext.deleteTexture(texture);

  // Disable the attributes
  glContext.disableVertexAttribArray(vertexPositionAttributeLocation);
  // glContext.disableVertexAttribArray(vertexNormalAttributeLocation);
  glContext.disableVertexAttribArray(vertexTextureAttributeLocation);

  // Disable the program
  glContext.useProgram(null);

  // Release the program and the geo buffer if we aren't going to use this program again
  if (!recurringUse) {
    glContext.deleteBuffer(geoVertexAttributeBuffer);
    glContext.deleteProgram(program3d);
  }
}

export function loadTexture(gl: WebGL2RenderingContext, source: string | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas): Promise<WebGLTexture> {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Because images have to be downloaded over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  const level = 0;
  const internalFormat = gl.RGBA;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;

  return new Promise<WebGLTexture>(async (resolve, reject) => {
    const imageOrCanvas = typeof source == 'string' ? await loadImage(source) : source;
    if (!imageOrCanvas) {
      reject("Failed to load image");
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      level,
      internalFormat,
      imageOrCanvas.width,
      imageOrCanvas.height,
      border,
      srcFormat,
      srcType,
      imageOrCanvas,
    );

    // WebGL1 has different requirements for power of 2 images
    // vs. non power of 2 images so check if the image is a
    // power of 2 in both dimensions.
    if (isPowerOf2(imageOrCanvas.width) && isPowerOf2(imageOrCanvas.height)) {
      // Yes, it's a power of 2. Generate mips.
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      // No, it's not a power of 2. Turn off mips and set
      // wrapping to clamp to edge
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    if (!texture) {
      reject("Failed to create texture");
      return;
    }
    resolve(texture);
  });
}

function isPowerOf2(value: number) {
  return (value & (value - 1)) === 0;
}

function derivePlacement(pimco: ProductImageComponent, targetWidth: number, targetHeight: number, srcWidth: number, srcHeight: number) {
  const placement = { 
    left: 0, 
    top: 0, 
    width: targetWidth, 
    height: targetHeight, 
    transform: null as (ImagePlacementTransform<number>[] | [number, number, number, number, number, number] | null) 
  };
  if (pimco.placement) {
    placement.left = Math.round((pimco.placement.left || 0) * targetWidth);
    placement.top = Math.round((pimco.placement.top || 0) * targetHeight);
    placement.width = Math.round((pimco.placement.width ?? 1) * targetWidth);
    placement.height = Math.round((pimco.placement.height ?? 1) * targetHeight);
    if (pimco.placement.fit === "contain") {
      // Adjust the width and height to maintain aspect ratio
      const targetAspect = placement.width / placement.height;
      const srcAspect = srcWidth / srcHeight;
      if (srcAspect > targetAspect) {
        // Source is wider than target, so fit to width
        const height = Math.round(placement.width / srcAspect);
        const posY = pimco.placement.position ? pimco.placement.position[1] : 0.5;
        
        placement.left = placement.left;
        placement.top = Math.round(placement.top + (placement.height - height) * posY);
        placement.width = placement.width;
        placement.height = height;
      } else {
        // Source is taller than target, so fit to height
        const width = Math.round(placement.height * srcAspect);
        const posX = pimco.placement.position ? pimco.placement.position[0] : 0.5;

        placement.left = Math.round(placement.left + (placement.width - width) * posX);
        placement.top = placement.top;
        placement.width = width;
        placement.height = placement.height;
      }
    }
    if (pimco.placement.transform) {
      const isTransforms = typeof pimco.placement.transform[0] === "object";
      placement.transform = 
        isTransforms ?
          placementTransformUnits(pimco.placement.transform as any, placement.width, placement.height, targetWidth, targetHeight) :
          pimco.placement.transform as any;
      if (isTransforms) {
        // Add a translation to and from the origin at the start and end of the sequence
        // so that rotations and skews are done around the center of the image
        placement.transform!.unshift({ type: 'translate', x: placement.width / 2 + placement.left, y: placement.height / 2 + placement.top } as any);
        placement.transform!.push({ type: 'translate', x: -placement.width / 2 - placement.left, y: -placement.height / 2 - placement.top } as any);
      }
    }
  }
  return placement;
}

function placementTransformUnits(
  transforms: ImagePlacementTransform[], 
  percentWidth: number, 
  percentHeight: number,
  viewWidth: number,
  viewHeight: number
): ImagePlacementTransform<number>[] {
  const bases = {
    px: percentWidth,
    py: percentHeight,
    vw: viewWidth,
    vh: viewHeight,
  };
  const newTransforms = transforms.map(t => {
    const newTransform: any = { ...t };
    for (const key in t) {
      if (key !== 'type' && typeof t[key] === 'string') {
        const unitValue = t[key];
        if (unitValue.endsWith('%')) {
          newTransform[key] = parseFloat(unitValue) / 100 * bases['p' + key];
        } else if (unitValue.endsWith('vw')) {
          newTransform[key] = parseFloat(unitValue) / 100 * bases.vw;
        } else if (unitValue.endsWith('vh')) {
          newTransform[key] = parseFloat(unitValue) / 100 * bases.vh;
        } else if (unitValue.endsWith('px')) {
          newTransform[key] = parseFloat(unitValue);
        } else if (unitValue.endsWith('deg')) {
          newTransform[key] = parseFloat(unitValue) / 180 * Math.PI;
        } else {
          // Take the number value as is
          newTransform[key] = parseFloat(unitValue);
        }
      }
    }
    return newTransform;
  });
  return newTransforms;
}

function applyTransformSequence(
  ctx: CanvasRenderingContext2D, 
  transform: ImagePlacementTransform<number>[] | [number, number, number, number, number, number]
) {

  if (transform.every(t => typeof t === "number")) {
    // This is just a matrix array
    ctx.setTransform(...(transform as any));
    return;
  }

  const transforms = transform as any as ImagePlacementTransform<number>[];

  const defaults = {
    scale: 1,
    translate: 0,
    skew: 0
  };

  for (const transform of transforms) {
    // Apply each transform property to the context
    if (transform.type === "rotate") {
      ctx.rotate(transform.angle || 0);
    } else {
      ctx[transform.type](transform.x || defaults[transform.type], transform.y || defaults[transform.type]);
    }
  }
}

CanvasRenderingContext2D.prototype.skew = function (xAngle: number, yAngle: number): void {
  const kx = Math.tan(xAngle);
  const ky = Math.tan(yAngle);
  this.transform(1, ky, kx, 1 + kx * ky, 0, 0);
};
OffscreenCanvasRenderingContext2D.prototype.skew = CanvasRenderingContext2D.prototype.skew;

function extractDfltColorCode(
  color:
    | string
    | string[]
    | {
        [idx: string]: string;
      }
    | undefined,
  backup: string = "#000000"
) {
  if (!color) {
    return backup;
  }
  if (typeof color === "string") {
    return color;
  }
  if (Array.isArray(color)) {
    return color[0];
  }
  const key = Object.keys(color)[0];
  return key ? color[key] : backup;
}
export type ColorArray = [number, number, number, number];
function parseColor(color: string): ColorArray {
  const rgb = color
    .slice(4, -1)
    .split(",")
    .map((c) => parseInt(c));
  const colorArray = Object.assign([0, 0, 0, 1], rgb.slice(0, 4)) as ColorArray;
  // Give it a special toString method
  colorArray.toString = function () {
    return `rgba(${this[0]}, ${this[1]}, ${this[2]}, ${this[3]})`;
  };
  return colorArray;
}