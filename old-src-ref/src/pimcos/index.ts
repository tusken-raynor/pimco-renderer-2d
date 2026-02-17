import { OptionCasing } from "@/structure";
import {
  MaterialComponentName,
  MaterialTextureName,
  Model,
  Pimco3DMaterialCollection,
  Pimco3DMaterialDefinition,
  PimcoContribution,
  ProductImageComponent,
  ProductImageComponentBase,
  ProductImageContributer,
  ProductImageMaterial3DComponent,
} from "@/types";
import qParams from "@/params";
import utils from "@/utils";

export default {
  transformPimcoContribution_STRUCTURE_(
    input: PimcoContribution | undefined,
    input3d?: Pimco3DMaterialDefinition | undefined
  ) {
    const result: Array<{ pimco: string; contributer: ProductImageContributer }> = [];
    if (input) {
      // Normal transformation
      result.push(
        ...Object.keys(input)
          .filter((pimco) => pimco !== "USECASCADING" && input[pimco].cascade !== false)
          .map((pimco) => ({
            pimco,
            contributer: input[pimco],
          }))
      );
    }
    if (input3d) {
      // Normal 3D transformation
      result.push(
        ...Object.keys(input3d)
          .filter((pimco) => pimco !== "USECASCADING")
          .map((pimco) => ({
            pimco,
            contributer: utils.filterObject(input3d[pimco], (v: ProductImageContributer, k) => v.cascade !== false),
          }))
          .filter((pimco) => !!Object.keys(pimco.contributer).length)
      );
    }
    return result;
  },
  transformPimcoContribution(
    input: PimcoContribution | undefined,
    branch: OptionCasing,
    prodeedingContributerPimcos?: Array<{
      pimco: string;
      contributer: ProductImageContributer;
    }>
  ): Array<{ pimco: string; contributer: ProductImageContributer }> {
    const result: Array<{ pimco: string; contributer: ProductImageContributer }> = [];
    if (prodeedingContributerPimcos && input?.USECASCADING) {
      // Special transformation that links
      const transformed = prodeedingContributerPimcos.map((pcn) => ({
        pimco: pcn.pimco,
        contributer: utils.deepObjectExtend(
          { "x-data": { attributes: branch["x-data"]?.attributes || [] } },
          pcn.contributer.priority !== undefined ? { priority: pcn.contributer.priority } : {},
          input.USECASCADING
        ),
      })) as any;
      result.push(...transformed);
    }
    if (input) {
      // Normal transformation
      const transformed = Object.keys(input)
        .filter((pimco) => pimco !== "USECASCADING")
        .map((pimco) => ({
          pimco,
          contributer: utils.deepObjectExtend(
            {
              "x-data": { attributes: branch["x-data"]?.attributes || [] },
            },
            input[pimco]
          ) as any,
        }))
        .filter((c) => c.contributer.cascade !== true);
      result.push(...transformed);
    }
    return result;
  },
  compilePimcoContributions(
    pimcoBases: ProductImageComponentBase[],
    contributers: {
      [key: string]: Array<ProductImageContributer>;
    },
    fillers: {
      [key: string]: Array<ProductImageContributer>;
    },
    model: Model,
    frame: number,
    mobileSize?: number,
    existingAssets?: string[]
  ) {
    // contributers, fillers, pimcos, model, frame
    let modelFiller: any = null;
    let defaultBaseImage = "";
    let patternImageName = "";
    if (model) {
      // Fill in the rest of the data since it's not required on the model
      modelFiller = {
        id: "modelbase",
        name: "Base",
        mode: "color",
        alpha: 0,
        blend: "multiply",
      };
      // Set the default base image so we can use it in the possible image name transformation below
      if (model.pimco) {
        defaultBaseImage = model.pimco.frames[frame]?.image || "";
      }
      // Get the imgname property from the model
      if (model.imgname) {
        patternImageName = model.imgname || "";
      }
    }
    // Define the generic filler for other pimcos
    const filler = {
      mode: "color",
      alpha: 0,
      blend: "multiply",
    };
    const pimcos = pimcoBases
      .map((base) => {
        let contributions = contributers[base.id];
        // Check to see if any fillers are coming in htrough the model or series
        if (base.id in fillers) {
          contributions = contributions ? [...contributions, ...fillers[base.id]] : fillers[base.id];
        }

        // If there are no contributers then just return null
        if (contributions?.length) {
          // Find any region specs in the contributers and generate region IDs
          if (window["regionMapInterface"]) {
            for (let i = 0; i < contributions.length; i++) {
              const contribution = contributions[i];
              if (contribution.regionspec && contribution["x-data"]?.["attributes"]?.length) {
                contribution["regionid"] = window["regionMapInterface"].getRegionID(base.id);
                const attrList =
                  typeof contribution.regionspec == "boolean"
                    ? contribution["x-data"]["attributes"].map((a) => a.id)
                    : contribution.regionspec instanceof Array
                    ? contribution.regionspec
                    : [contribution.regionspec];
                window["regionMapInterface"].storeRegionStepData(contribution["regionid"], attrList);
              }
            }
          }
          const mergedData: ProductImageComponentBase & ProductImageContributer = utils.deepObjectExtend(
            { name: "" },
            filler,
            ...contributions
              // Make sure there's an altbaseimage property on each contributer that has a
              // color/texture so that light colors don't get the dark image when merging
              // all the contributers
              .map((cont) => {
                if (cont.color || cont.texture) {
                  return Object.assign({ altbaseimage: "", altmaskimage: "", althlimage: "" }, cont);
                }
                return cont;
              })
              .sort((a, b) => {
                // Pimcos that are fillers from the model or series should always take lower priority
                if (a.filler && !b.filler) {
                  return -1;
                } else if (!a.filler && b.filler) {
                  return 1;
                } else {
                  return (a.priority === undefined ? 1 : a.priority) - (b.priority === undefined ? 1 : b.priority);
                }
              }),
            base
          ) as any;
          if (mergedData.frames && !mergedData.cancel) {
            const frameData = mergedData.frames[frame];
            // If the mode is for texture but not texture is provided, invalidate
            if (mergedData.mode == "image" && !(mergedData.texture || frameData?.texture)) {
              return null as any as ProductImageComponent;
            }
            const furtherMergedData = Object.assign(mergedData, frameData);
            if (furtherMergedData.mask) {
              // Check to see if the mask is a substitution, and if it is, try to compile any transformations and type definitions
              if (furtherMergedData.mask instanceof Object && patternImageName && furtherMergedData.mask.transform) {
                let newMask: any = {};
                if (furtherMergedData.mask.type) {
                  if ((furtherMergedData.mask.type as any).default) {
                    const dflt = (furtherMergedData.mask.type as any).default;
                    newMask.type = dflt;
                  }
                  if (furtherMergedData.mask.type[patternImageName]) {
                    // Merge the pattern data in with the default data
                    // so that pattern data always inherts default data
                    newMask.type = Object.assign({}, newMask.type, furtherMergedData.mask.type[patternImageName]);
                  }
                }
                if (furtherMergedData.mask.transform) {
                  if (furtherMergedData.mask.transform[patternImageName]) {
                    newMask.transform = furtherMergedData.mask.transform[patternImageName];
                  } else if ((furtherMergedData.mask.transform as any).default) {
                    newMask.transform = (furtherMergedData.mask.transform as any).default;
                  }
                }
                // Do this to prevent the orignal data from being changed
                if (Object.keys(newMask).length) {
                  furtherMergedData.mask = Object.assign({}, furtherMergedData.mask, newMask);
                }
              } else if (typeof furtherMergedData.mask == "string") {
                // Add the extra string to end of the mask image filename to reference alternate image
                if (furtherMergedData.altmaskimage) {
                  furtherMergedData.mask = furtherMergedData.mask.replace(
                    /\.(gif|jpe?g|tiff?|png|avif|webp|bmp)$/i,
                    furtherMergedData.altmaskimage + ".$1"
                  );
                }
              }
              // If there is no image default to using the model basis image
              const pimcoImage = furtherMergedData.image || defaultBaseImage;
              // Add the extra string to end of the base image filename to reference alternate image
              if (furtherMergedData.altbaseimage) {
                if (pimcoImage) {
                  furtherMergedData.image = pimcoImage.replace(
                    /\.(gif|jpe?g|tiff?|png|avif|webp|bmp)$/i,
                    furtherMergedData.altbaseimage + ".$1"
                  );
                }
              } else {
                furtherMergedData.image = pimcoImage;
              }
              const regionTag =
                !furtherMergedData.allowedregiontags ||
                furtherMergedData.allowedregiontags.includes(furtherMergedData.regiontag || "")
                  ? furtherMergedData.regiontag || "full"
                  : "full";
              this.pimcoImageReplace(furtherMergedData as any, "$regiontag$", regionTag);

              // Add the extra string to end of the highlight image filename to reference alternate image
              if (furtherMergedData.hlimage1 && furtherMergedData.althlimage) {
                furtherMergedData.hlimage1 = furtherMergedData.hlimage1.replace(
                  /\.(gif|jpe?g|tiff?|png|avif|webp|bmp)$/i,
                  furtherMergedData.althlimage + ".$1"
                );
                if (furtherMergedData.hlimage2) {
                  furtherMergedData.hlimage2 = furtherMergedData.hlimage2.replace(
                    /\.(gif|jpe?g|tiff?|png|avif|webp|bmp)$/i,
                    furtherMergedData.althlimage + ".$1"
                  );
                }
              }
              // Tweak the color or enable it if a coloridx is used
              if (furtherMergedData.color instanceof Object) {
                if (
                  (typeof furtherMergedData.coloridx == "number" || typeof furtherMergedData.coloridx == "string") &&
                  furtherMergedData.coloridx in furtherMergedData.color
                ) {
                  furtherMergedData.color = furtherMergedData.color[furtherMergedData.coloridx];
                  if (furtherMergedData.mode == "image") {
                    furtherMergedData.mode = "color";
                  }
                } else {
                  if (furtherMergedData.color instanceof Array) {
                    furtherMergedData.color = furtherMergedData.color[0] || "";
                  } else {
                    furtherMergedData.color = furtherMergedData.color.default || "";
                  }
                }
              }
              // Clean up the approved pimco
              delete furtherMergedData.frames;
              delete (furtherMergedData as any).type;
              delete furtherMergedData.comment;
              delete furtherMergedData.priority;
              delete furtherMergedData.altbaseimage;
              delete furtherMergedData.altmaskimage;
              delete furtherMergedData.althlimage;
              delete furtherMergedData.cascade;
              delete furtherMergedData.comment;
              delete furtherMergedData.allowedregiontags;
              delete furtherMergedData.regiontag;
              delete furtherMergedData.filler;
              delete furtherMergedData.coloridx;
              delete furtherMergedData.regionspec;
              // The pimco is properly formatted and approved for return
              return furtherMergedData as ProductImageComponent;
            }
          }
        }
        return null as any as ProductImageComponent;
      })
      .filter((p) => p && !p["cancel"])
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    if (modelFiller && model && model.pimco?.frames[frame]) {
      const modelPimco: ProductImageComponent = Object.assign(
        modelFiller,
        model.pimco,
        model.pimco.frames[frame]
      ) as any;
      // If the base pimco has a color ref, then use that to determine the color,
      // alpha and blend for the base pimco, so that ugly white lines go away
      if (model.pimco?.colorref && modelPimco.color === undefined) {
        const refPimco = pimcos.find((pmc) => pmc.id == model.pimco!.colorref);
        if (refPimco) {
          Object.assign(modelPimco, {
            color: refPimco.color,
            alpha: refPimco.alpha,
            blend: refPimco.blend,
          });
        }
      }
      // Add the base pimco to the front always
      pimcos.unshift(modelPimco);
    }
    if (!pimcos.length) {
      // If the only pimco we'll get is directly from the model,
      // Then just return an empty array so there's no weird rendering
      return [];
    }
    if (patternImageName) {
      // Add the proper pattern name to the image
      for (let i = 0; i < pimcos.length; i++) {
        if (patternImageName) {
          this.pimcoImageReplace(pimcos[i], "$pattern$", patternImageName);
        }
        // Also replace frame number if applicable
        this.pimcoImageReplace(pimcos[i], "$frame$", frame + "");
      }
    }
    for (let i = 0; i < pimcos.length; i++) {
      // Apply pimco vars to the image URLs
      this.pimcoImageApplyVars(
        pimcos[i],
        Object.keys(pimcos[i])
          .filter((k) => k.startsWith("$"))
          .reduce((obj, key) => {
            const formattedKey = key.endsWith("$") ? key : key + "$";
            obj[formattedKey] = pimcos[i][key];
            // Delete the variable from the pimco so it doesn't get passed to the renderer
            delete pimcos[i][key];
            return obj;
          }, {} as Record<string, any>),
        true
      );
    }
    if (existingAssets?.length && model.imgfallbackname) {
      // Add the fallback pattern name to the images if the main pattern didn't yield valid assets
      for (let i = 0; i < pimcos.length; i++) {
        this.pimcoImageReplaceIf(pimcos[i], patternImageName, model.imgfallbackname, (img) => {
          return !existingAssets.includes(img);
        });
      }
    }
    if (
      (mobileSize !== undefined &&
        innerWidth <= mobileSize &&
        !qParams.has("image-expand") &&
        qParams.getString("mblx") != "none") ||
      qParams.getString("mblx") == "all"
    ) {
      // Add a mobile suffix to the name so mobile devices get smaller images
      for (let i = 0; i < pimcos.length; i++) {
        this.pimcoImageMobile(pimcos[i]);
      }
    }
    for (let i = 0; i < pimcos.length; i++) {
      // Add the app version to the image as a query parameter
      this.pimcoImageAdd(pimcos[i], "ver=" + utils.getVersion(), true);
    }

    return pimcos;
  },
  pimcoImageReplace(pimco: ProductImageComponent, find: string, replace: string) {
    const pimcoImageKeys = ["image", "mask", "hlimage1", "hlimage2", "texture"] as const;
    for (let i = 0; i < pimcoImageKeys.length; i++) {
      const key = pimcoImageKeys[i];
      if (typeof pimco[key] == "string" && (pimco[key] as string).includes(find)) {
        pimco[key] = (pimco[key] as string).replaceAll(find, replace);
      }
    }
  },
  pimcoImageReplaceIf(pimco: ProductImageComponent, find: string, replace: string, callback: (img: string) => boolean) {
    const pimcoImageKeys = ["image", "mask", "hlimage1", "hlimage2", "texture"] as const;
    for (let i = 0; i < pimcoImageKeys.length; i++) {
      const key = pimcoImageKeys[i];
      if (typeof pimco[key] == "string" && (pimco[key] as string).includes(find)) {
        if (callback(pimco[key] as string)) {
          pimco[key] = (pimco[key] as string).replaceAll(find, replace);
        }
      }
    }
  },
  pimcoImageAdd(pimco: ProductImageComponent, addition: string, param = false) {
    const pimcoImageKeys = ["image", "mask", "hlimage1", "hlimage2", "texture"] as const;
    for (let i = 0; i < pimcoImageKeys.length; i++) {
      const key = pimcoImageKeys[i];
      const image = pimco[key];
      if (image && typeof image == "string") {
        if (param) {
          if (image.startsWith("data:") || image.startsWith("blob:")) continue;
          pimco[key] = image.includes("?") ? image + "&" + addition : image + "?" + addition;
        } else {
          pimco[key] = image.replace(/\.(gif|jpe?g|tiff?|png|avif|webp|bmp)$/i, addition + ".$1");
        }
      }
    }
  },
  pimcoImageChangeExt(pimco: ProductImageComponent, ext: string) {
    const pimcoImageKeys = ["image", "mask", "hlimage1", "hlimage2", "texture", "postmask"] as const;
    for (let i = 0; i < pimcoImageKeys.length; i++) {
      const key = pimcoImageKeys[i];
      const image = pimco[key];
      if (image && typeof image == "string") {
        if (image.startsWith("data:") || image.startsWith("blob:") || !image.includes("/pimcos/")) continue;
        pimco[key] = image.replace(/\.(gif|jpe?g|tiff?|png|avif|webp|bmp)$/i, "." + ext);
      } else if (image && image instanceof Object) {
        this.pimcoImageChangeExt(image as any, ext);
      }
    }
  },
  pimcoImageMobile(pimco: ProductImageComponent, mblStr = "-mblx") {
    const pimcoImageKeys = ["image", "mask", "hlimage1", "hlimage2", "texture"] as const;
    for (let i = 0; i < pimcoImageKeys.length; i++) {
      const key = pimcoImageKeys[i];
      const image = pimco[key];
      if (image && typeof image == "string" && image.includes("/pimcos/")) {
        pimco[key] = image.replace(/\.(gif|jpe?g|tiff?|png|avif|webp|bmp)$/i, mblStr + ".$1");
      }
    }
  },
  pimcoImageApplyVars(pimco: ProductImageComponent, vars: Record<string, any>, removeUnused = false) {
    if (!vars || !Object.keys(vars).length) return;
    const pimcoImageKeys = ["image", "mask", "hlimage1", "hlimage2", "texture"] as const;
    for (let i = 0; i < pimcoImageKeys.length; i++) {
      const key = pimcoImageKeys[i];
      const image = pimco[key];
      if (image && typeof image == "string") {
        const varNames = image.match(/\$[a-zA-Z0-9_\-]+\$/g);
        if (varNames) {
          for (let j = 0; j < varNames.length; j++) {
            const varName = varNames[j];
            if (varName in vars) {
              pimco[key] = (pimco[key] as string).replace(varName, vars[varName]);
            } else if (removeUnused) {
              pimco[key] = (pimco[key] as string).replace(varName, "");
            }
          }
        }
      }
    }
  },
  filterContributions(
    contributions: {
      [key: string]: Array<
        ProductImageContributer & {
          ["x-data"]: { attributes: { id: string }[] };
        }
      >;
    },
    restrictions: { [key: string]: string[][] },
    enablers: { [key: string]: string[][] }
  ) {
    const newContributions: typeof contributions = {};
    for (const key in contributions) {
      if (Object.prototype.hasOwnProperty.call(contributions, key)) {
        const contributionList = contributions[key];
        newContributions[key] = contributionList.filter((c) => {
          if (!c["x-data"]) {
            return true;
          }
          return c["x-data"].attributes
            .map((a) => utils.standardAttributeFilter(a, restrictions, enablers))
            .every((v) => v);
        });
      }
    }
    return newContributions;
  },
  compileMaterialPimcos3D(
    pimcoBases: ProductImageComponentBase[],
    components: {
      [key: string]: Pimco3DMaterialCollection;
    },
    model: Model,
    mobileSize?: number
  ) {
    const pimcos: Partial<Record<MaterialComponentName, ProductImageComponent[]>> = {};
    // Loop through the pimco bases and look for any components that match
    const ver = "ver=" + utils.getVersion();
    for (let i = 0; i < pimcoBases.length; i++) {
      const base = pimcoBases[i];
      if (base.id in components) {
        const collectionList = components[base.id];
        // console.log(collectionList);
        const keys = Object.keys(collectionList) as MaterialTextureName[];
        for (let j = 0; j < keys.length; j++) {
          const key = keys[j];
          const collection = collectionList[key]!;
          if (!pimcos[key]) {
            pimcos[key] = [];
          }
          const pimco = utils.deepObjectExtend(
            { id: base.id, name: base.name },
            ...collection
          ) as ProductImageComponent;

          // If the pimco is cancelled, then don't add it to the list
          if ((pimco as any).cancel === true) {
            continue;
          }

          this.pimcoImageReplace(pimco, "$regiontag$", base.regiontag || "full");
          if (!pimco.image && model.pimco3d?.[key]?.image) {
            // Check the model base for an image
            pimco.image = model.pimco3d[key]!.image!;
          }
          if (pimco.mask && (pimco.image || key == "env")) {
            utils.orderedInsert(pimcos[key], pimco, (a, b) => (b.order || 0) - (a.order || 0));
          }
        }
      }
    }

    // Check the model for a base pimco
    if ("pimco3d" in model && model.pimco3d) {
      for (const key in model.pimco3d) {
        if (Object.prototype.hasOwnProperty.call(model.pimco3d, key)) {
          const pimco = model.pimco3d[key] as ProductImageComponent;
          if (pimco && ((pimco.image && pimco.mask) || key == "env")) {
            if (!pimcos[key]) {
              pimcos[key] = [];
            }
            pimcos[key].unshift(Object.assign({ id: "modelbase", name: "Model Base" }, pimco));
          }
        }
      }
    }

    const variables: Record<string, Record<string, Record<string, any>>> = {};
    // Loop through the pimcos and collect all the variables
    const keys = Object.keys(pimcos) as MaterialTextureName[];
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      for (let i = 0; i < pimcos[key].length; i++) {
        const pimco = pimcos[key][i];
        for (const prop in pimco) {
          const value = pimco[prop];
          if (typeof prop == "string" && prop.startsWith("$")) {
            if (!variables[key]) {
              variables[key] = {};
            }
            if (!variables[key][pimco.id]) {
              variables[key][pimco.id] = {};
            }
            variables[key][pimco.id][prop + "$"] = value;
            // Delete the variable from the pimco
            delete pimco[prop];
          }
        }
      }
    }

    // Valid pimco keys
    const validKeys = ["albedo", "orm", "normal", "env", "roughness", "metallic", "ao", "emissive"];

    const useMobileImages =
      (mobileSize !== undefined &&
        innerWidth <= mobileSize &&
        !qParams.has("image-expand") &&
        qParams.getString("mblx") != "none") ||
      qParams.getString("mblx") == "all";
    const appendToURL = useMobileImages
      ? (pimco: ProductImageComponent) => {
          this.pimcoImageMobile(pimco);
          this.pimcoImageAdd(pimco, ver, true);
        }
      : (pimco: ProductImageComponent) => {
          this.pimcoImageAdd(pimco, ver, true);
        };
    // Post process the image urls and such
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      if (!validKeys.includes(key) || !pimcos[key]?.length) {
        delete pimcos[key];
        continue;
      }
      for (let i = 0; i < pimcos[key].length; i++) {
        const pimco: ProductImageComponent = pimcos[key][i];
        if (model.imgname) {
          this.pimcoImageReplace(pimco, "$pattern$", model.imgname);
        }
        if (variables[key]?.[pimco.id]) {
          this.pimcoImageApplyVars(pimco, variables[key][pimco.id]);
        }
        if (qParams.getBool("use-avif")) {
          this.pimcoImageChangeExt(pimco, "avif");
        }
        appendToURL(pimco);

        // Tweak the color or enable it if a coloridx is used
        if (pimco.color instanceof Object) {
          if (
            (typeof pimco.coloridx == "number" || typeof pimco.coloridx == "string") &&
            pimco.coloridx in pimco.color
          ) {
            pimco.color = pimco.color[pimco.coloridx];
            if (pimco.mode == "image") {
              pimco.mode = "color";
            }
          } else {
            if (pimco.color instanceof Array) {
              pimco.color = pimco.color[0] || "";
            } else {
              pimco.color = pimco.color.default || "";
            }
          }
        }
      }
    }

    if (qParams.isString("gr:isolate-texture")) {
      // Isolate a single texture, and make it the albedo so we can view its rgb directly on the model
      const isolatedTexture = qParams.getString("gr:isolate-texture");
      if (isolatedTexture in pimcos) {
        const newAlbedo = pimcos[isolatedTexture];
        for (const key in pimcos) {
          delete pimcos[key];
        }
        pimcos.albedo = newAlbedo;
      }
    }

    return pimcos;
  },
};
