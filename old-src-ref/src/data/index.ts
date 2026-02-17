import params from "@/params";
import {
  Attributes,
  ConfiguratorObject,
  LeatherInfo,
  Model,
  Options,
  ProductImageComponentBase,
  Products,
  SeriesInfo,
  WoocommerceReview,
  ContentDataFileRef,
} from "@/types";
import utils, { type WorkerSuite } from "@/utils";
import axios from "axios";
import DataWorker from "./worker?worker";

let worker: WorkerSuite | null = null;

export default {
  // So in preparation for moving all the data to a database, we need something to simulate it.
  // This module will also be used to request the data when we are actually using the database.
  // Structure:
  //   Product >
  //     Atrribute >
  //       Option;/Subattribute >
  //         Options;

  // Have products data come first
  // An optional SuperOptions list may be included to represent series for gloves so be ready
  // Then have models data come first. This should supported by every product
  // This data will be used for the first couple pages
  // Use a single strong value to manage the pages. It seems 3 pages is what we want.
  // There may be extra data to pull that represents stats on first page; Maybe pull later
  // *Pull reviews from wordpress database*
  // If they select start blank:
  //     if a product only has one model, go straight to configurator, otherwise
  //     send them to patterns page to pick a model; no series filtering
  // If they select color play:
  //     load any color options for the glove
  //     go to color play page that is yet to be designed; IDK if patterns page comes first but I assume
  //     the color data chosen will just be used to set extra defaults in the configurator
  // If there are Super Options (series) have design by series section:
  //     select a series
  //     load any stats for that series
  //     go to the patterns page to select a model
  // select a model then send info to database to get filtered attributes and options
  // generate a new selectedOptions object to use in the store

  fetch(url: string) {
    return axios.get(url).catch(console.error);
  },
  fetchStartData(): Promise<Products> {
    return new Promise((res, rej) => {
      // If we are running locally, just request the data from the localhost Configurator API
      const origin = utils.getDataOrigin();
      const userParams = createUserParamsString(utils.getUserDeviceParams());
      axios
        .get(`${origin}/configurator-api/?c=start-data&ver=${utils.getVersion()}&${userParams}`)
        .catch(console.error)
        .then((response) => {
          if (response) {
            res(response.data);
          }
        });
    });
  },
  fetchModelData(productID: string): Promise<Array<Model>> {
    return new Promise((res, rej) => {
      // If we are running locally, just request the data from the localhost Configurator API
      const origin = utils.getDataOrigin();
      const userParams = createUserParamsString(utils.getUserDeviceParams());
      axios
        .get(`${origin}/configurator-api/?c=model-data&product=${productID}&ver=${utils.getVersion()}&${userParams}`)
        .catch(console.error)
        .then((response) => {
          if (response) {
            res(response.data);
          }
        });
    });
  },
  fetchConfiguratorData(
    modelID: string,
    seriesID: string
  ): Promise<{
    attributes: Attributes;
    options: Options;
    leathers: Array<LeatherInfo>;
    pimcos: Array<ProductImageComponentBase>;
    existingAssets?: Array<string>;
  }> {
    return new Promise(async (res, rej) => {
      // If we are running locally, just request the data from the localhost Configurator API
      const origin = utils.getDataOrigin();
      const userParams = createUserParamsString(utils.getUserDeviceParams());
      let response: any;
      if (seriesID) {
        response = await axios.get(
          `${origin}/configurator-api/?c=configurator-data&model=${modelID}&series=${seriesID}&ver=${utils.getVersion()}&${userParams}`
        );
      } else {
        response = await axios.get(
          `${origin}/configurator-api/?c=configurator-data&model=${modelID}&ver=${utils.getVersion()}&${userParams}`
        );
      }
      res(response.data);
    });
  },
  fetchScratchStats(productID: string) {
    // If we are running locally, just request the data from the localhost Configurator API
    const origin = utils.getDataOrigin();
    return axios
      .get(`${origin}/configurator-api/?c=scratch-stats&product=${productID}&ver=${utils.getVersion()}`)
      .catch(console.error)
      .then((response) => {
        if (response) {
          return response.data;
        }
      });
  },
  fetchSeriesList(productID: string): Promise<Array<SeriesInfo>> {
    // If we are running locally, just request the data from the localhost Configurator API
    const origin = utils.getDataOrigin();

    return new Promise((resolve, reject) => {
      axios
        .get(`${origin}/configurator-api/?c=series-list&product=${productID}&ver=${utils.getVersion()}`)
        .catch(console.error)
        .then((response) => {
          if (response) {
            resolve(response.data);
          }
        });
    });
  },
  fetchSeriesStats(seriesID: string) {
    // If we are running locally, just request the data from the localhost Configurator API
    const origin = utils.getDataOrigin();
    return axios
      .get(`${origin}/configurator-api/?c=series-stats&series=${seriesID}&ver=${utils.getVersion()}`)
      .catch(console.error)
      .then((response) => {
        if (response) {
          return response.data;
        }
      });
  },
  fetchComments(
    comments: Array<string> | { wooid: string | number; count?: number }
  ): Promise<Array<WoocommerceReview>> {
    // If we are running locally, just request the data from the localhost Configurator API
    // Unless we are in partial mode, we want the most up-to-date woocommerce data
    const origin = params.get("localdata") == "partial" ? "https://nokona.com" : utils.getDataOrigin();

    if (comments instanceof Array) {
      return axios
        .get(`${origin}/configurator-api/?c=comment-get&comments=${comments.join(",")}&ver=${utils.getVersion()}`)
        .catch(console.error)
        .then((response) => {
          if (response) {
            return response.data;
          }
        });
    } else {
      let requestURL = `${origin}/configurator-api/?c=comment-get&post=${comments.wooid}&ver=${utils.getVersion()}`;
      if ("count" in comments) {
        requestURL += `&count=${comments.count}`;
      }
      return axios
        .get(requestURL)
        .catch(console.error)
        .then((response) => {
          if (response) {
            return response.data;
          }
        });
    }
  },
  fetchMainSiteHeader(): Promise<string> {
    // If we are running locally, just request the data from the localhost Configurator API
    const origin = utils.getDataOrigin();
    return axios
      .get(`${origin}/configurator-api/?c=site-header&ver=${utils.getVersion()}`)
      .catch(console.error)
      .then((res) => {
        if (res) {
          return res.data;
        }
        return "";
      });
  },
  fetchWoocommerceData(): Promise<{
    addonMaps: any;
    idMap: { [key: string]: number | string };
    priceMap: { [key: string]: { price: number; regularPrice: number; name: string } };
  }> {
    // If we are running locally, just request the data from the localhost Configurator API
    // Unless we are in partial mode, we want the most up-to-date woocommerce data
    const origin = params.get("localdata") == "partial" ? "https://nokona.com" : utils.getDataOrigin();
    // Check the params for a version too, because sometimes the state initialize module run after the woo request
    const version = params.getString("ver").match(/^[\d\.]+$/)?.[0] || utils.getVersion();
    return axios
      .get(`${origin}/configurator-api/?c=woocommerce-data&ver=${version}`)
      .catch(console.error)
      .then((res) => {
        if (res) {
          return res.data;
        }
        return "";
      });
  },
  fetchContentDataFile(filename: string) {
    const visited: { [key: string]: any } = {};
    const filerefs = [
      {
        fileref: { filename, fileref: true },
        setContent: null as ((data: any) => void) | null,
      },
    ];
    let data: any = null;
    return new Promise<any>(async (resolve) => {
      while (filerefs.length) {
        const filerefHolder = filerefs.shift()!;
        const filename = filerefHolder.fileref.filename;
        if (!(filename in visited)) {
          const res = await axios.get(filename + "?ver=" + utils.getVersion());
          if (res) {
            visited[filename] = res.data;
            if (data === null) {
              data = res.data;
            }
            if (filerefHolder.setContent) {
              if (filename.includes(".json") && typeof res.data == "string") {
                const tdata = res.data.replace(/\/\*.*?\*\//g, "");
                try {
                  res.data = JSON.parse(tdata);
                } catch (e) {
                  console.error(e);
                }
              }
              filerefHolder.setContent(res.data);
            }
            if (res.data instanceof Object) {
              filerefs.push(...traverseContentData(res.data));
            }
          }
        } else {
          if (filerefHolder.setContent) {
            filerefHolder.setContent(visited[filename]);
          }
        }
      }
      resolve(data);
    });
  },
  fetchExternalStyles(): Promise<void> {
    return fetch("/showgloves/config/styles.json?ver=" + utils.getVersion())
      .then((res) => res.json())
      .then(async (data) => {
        if (worker === null) {
          worker = utils.createWorkerSuite(new DataWorker());
        }
        const styleString = await worker.post<string>({ task: "styleObjectToString", styles: data });
        const styleElement = document.createElement("style");
        styleElement.setAttribute("id", "external-styles");
        styleElement.innerHTML = styleString;
        document.head.appendChild(styleElement);
      });
  },
};

(window as any).fetchContentDataFile = (filename: string) => {
  const visited: { [key: string]: any } = {};
  const filerefs = [
    {
      fileref: { filename, fileref: true },
      setContent: null as ((data: any) => void) | null,
    },
  ];
  let data: any = null;
  return new Promise<any>(async (resolve) => {
    while (filerefs.length) {
      const filerefHolder = filerefs.shift()!;
      const filename = filerefHolder.fileref.filename;
      if (!(filename in visited)) {
        const res = await axios.get(filename);
        if (res) {
          visited[filename] = res.data;
          if (data === null) {
            data = res.data;
          }
          if (filerefHolder.setContent) {
            if (filename.includes(".json") && typeof res.data == "string") {
              const tdata = res.data.replace(/\/\*.*?\*\//g, "");
              try {
                res.data = JSON.parse(tdata);
              } catch (e) {
                console.error(e);
              }
            }
            filerefHolder.setContent(res.data);
          }
          if (res.data instanceof Object) {
            filerefs.push(...traverseContentData(res.data));
          }
        }
      } else {
        if (filerefHolder.setContent) {
          filerefHolder.setContent(visited[filename]);
        }
      }
    }
    resolve(data);
  });
};

function traverseContentData(obj: object) {
  const data: {
    fileref: ContentDataFileRef;
    setContent: (data: any) => void;
  }[] = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const item = obj[key];
      if (isContentDataFileRef(item)) {
        data.push({ fileref: item, setContent: (data) => (obj[key] = data) });
      } else if (item instanceof Object) {
        data.push(...traverseContentData(item));
      }
    }
  }
  return data;
}

function isContentDataFileRef(obj: any): obj is ContentDataFileRef {
  return obj.fileref === true && typeof obj.filename == "string";
}

function cleanUpSeriesShop(model: Model, series: SeriesInfo, objects: { [id: string]: ConfiguratorObject }) {
  const restrictions: { [key: string]: Array<string> } = {};
  const insertions: { [key: string]: Array<string> } = {};
  if ((series as any).restrict) {
    let restrict = (series as any).restrict;
    if (!(restrict instanceof Array)) {
      restrict = [restrict];
    }
    for (let i = 0; i < restrict.length; i++) {
      const restriction = restrict[i];
      if (typeof restriction == "string") {
        if (!(restriction in restrictions)) {
          restrictions[restriction] = [];
        }
      } else {
        if (!(restriction.id in restrictions)) {
          restrictions[restriction.id] = [];
        }
        restrictions[restriction.id].push(restriction.parent);
      }
    }
  }
  if ((series as any).insert) {
    let insert = (series as any).insert;
    if (!(insert instanceof Array)) {
      insert = [insert];
    }
    for (let i = 0; i < insert.length; i++) {
      const insertion = insert[i];
      if (!(insertion.parent in insertions)) {
        insertions[insertion.parent] = [];
      }
      insertions[insertion.parent].push(insertion.id);
    }
  }
  seriesCleanUpRecurse(model, restrictions, insertions, objects);
}

function seriesCleanUpRecurse(
  parent: ConfiguratorObject,
  restrictions: { [key: string]: Array<string> },
  insertions: { [key: string]: Array<string> },
  objects: { [id: string]: ConfiguratorObject },
  visited: Array<string> = []
) {
  if (visited.includes(parent.id)) {
    return;
  } else {
    visited.push(parent.id);
  }
  if ("attributes" in parent && parent.attributes) {
    if (parent.id in insertions) {
      parent.attributes.push(...insertions[parent.id]);
    }
    const ogList = Array.from(parent.attributes);
    for (let i = 0; i < ogList.length; i++) {
      const id = ogList[i];
      const child = objects[id];
      if (id in restrictions) {
        if (!restrictions[id].length || restrictions[id].includes(parent.id)) {
          parent.attributes.splice(parent.attributes.indexOf(id), 1);
        }
      }
      if (child) {
        seriesCleanUpRecurse(child, restrictions, insertions, objects);
      }
    }
  } else if ("options" in parent && parent.options) {
    if (parent.options instanceof Array) {
      if (parent.id in insertions) {
        parent.options.push(...insertions[parent.id]);
      }
      const ogList = Array.from(parent.options);
      for (let i = 0; i < ogList.length; i++) {
        const id = ogList[i];
        const child = objects[id];
        if (id in restrictions) {
          if (!restrictions[id].length || restrictions[id].includes(parent.id)) {
            parent.options.splice(parent.options.indexOf(id), 1);
          }
        }
        if (child) {
          seriesCleanUpRecurse(child, restrictions, insertions, objects);
        }
      }
    } else {
      if (parent.id in insertions) {
        parent.options.options.push(...insertions[parent.id]);
      }
      const ogList = Array.from(parent.options.options);
      for (let i = 0; i < ogList.length; i++) {
        const id = ogList[i];
        const child = objects[id];
        if (id in restrictions) {
          if (!restrictions[id].length || restrictions[id].includes(parent.id)) {
            parent.options.options.splice(parent.options.options.indexOf(id), 1);
          }
        }
        if (child) {
          seriesCleanUpRecurse(child, restrictions, insertions, objects);
        }
      }
    }
  } else if ("suboptions" in parent && parent.suboptions) {
    if (parent.id in insertions) {
      parent.suboptions.options.push(...insertions[parent.id]);
    }
    const ogList = Array.from(parent.suboptions.options);
    for (let i = 0; i < ogList.length; i++) {
      const id = ogList[i];
      const child = objects[id];
      if (id in restrictions) {
        if (!restrictions[id].length || restrictions[id].includes(parent.id)) {
          parent.suboptions.options.splice(parent.suboptions.options.indexOf(id), 1);
        }
      }
      if (child) {
        seriesCleanUpRecurse(child, restrictions, insertions, objects);
      }
    }
  }
}

function createUserParamsString(params: Record<string, any>) {
  return Object.entries(params)
    .map(([key, value]) => `up:${key}=${JSON.stringify(value)}`)
    .join("&");
}
