import params from "@/params";
import storage from "@/storage";
import uploaded from "@/storage/uploaded";
import axios from "axios";

let shareSession = recoverSharedSession();

let resilientSession = false;

// Determine the main session
let SESSION =
  (shareSession ? "" : storage.getValue("session")) || generateSessionID();

let retainSession = false;
if (params.get("id") && params.get("retain-session")) {
  retainSession = true;
  SESSION = params.get("id");
}

let SESSION_DATA = "";

let callbacks: Array<(sessionID: string) => void> = [];

let selectionUpdated = true;

(window as any).sessionData = () => {
  console.log(SESSION_DATA);
};

// Save the session id to storage
storage.saveValue("session", SESSION);

export default {
  isSelectionUpdated() {
    return selectionUpdated;
  },
  setSelectionUpdated(value: boolean) {
    selectionUpdated = value;
  },
  newSession() {
    if (!retainSession) {
      SESSION = generateSessionID();
      for (let i = 0; i < callbacks.length; i++) {
        const callback = callbacks[i];
        callback(SESSION);
      }
      storage.saveValue("session", SESSION);
    }
  },
  onNewSession(cb: (sessionID: string) => void) {
    callbacks.push(cb);
    cb(SESSION);
  },
  getSessionID() {
    return SESSION;
  },
  getSharedSessionID() {
    return shareSession;
  },
  createResilientSession() {
    resilientSession = true;
    this.newSession();
  },
  resetResilientSession() {
    resilientSession = false;
    this.newSession();
  },
  getUploadableImageKeys() {
    return (SESSION_DATA.match(/"\+keys":"0\:[^"]+"/g) || [])
      .map((match) => {
        const result = match.match(/"\+keys":"0\:([^"]+)"/);
        if (!result) {
          return "";
        }
        const key = result[1];
        if (!key || key.startsWith("file|")) {
          return "";
        }
        return key;
    }).filter(key => key !== '');
  },
  updateSessionData(
    mode: "series" | "blank" | "color" | "",
    product: string,
    selections: any
  ) {
    const nugget = { mode, product, selections: selections[product] };
    SESSION_DATA = JSON.stringify(nugget);
    if (resilientSession) {
      // Switch all the userInteraction flags to false
      SESSION_DATA = SESSION_DATA.replaceAll(
        '"userInteraction":true',
        '"userInteraction":false'
      );
    }
    // Find all the ComplexUploaderOption image keys and remove non-selected keys
    const matches = SESSION_DATA.match(/"\+keys":"\d*\:[^"]+"/g) || [];
    for (const match of matches) {
      const [_, index, keyString] = match.match(/"\+keys":"(\d*)\:([^"]+)"/)!;
      const keys = keyString.split(",");
      if (index && keys[index]) {
        SESSION_DATA = SESSION_DATA.replace(match, `"\+keys":"0:file|${keys[index]}"`);
      } else {
        SESSION_DATA = SESSION_DATA.replace(match, "");
      }
    }
  },
  sendSessionData(imageData?: string) {
    selectionUpdated = false;
    const formData = new FormData();
    formData.append("c", "share-save");
    formData.append("id", SESSION);
    formData.append("selections", SESSION_DATA);
    if (imageData) {
      formData.append("image", imageData);
    }
    return axios
      .post(`https://nokona.com/configurator-api/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .catch((err) => console.error(err))
      .then((res) => {
        console.log("session data uploaded");
        return res?.data === "TRUE";
      });
  },
  async sendSessionImage(images: Array<string | Blob>): Promise<Array<string | false>> {
    const promises: Array<Promise<any>> = [];
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const formData = new FormData();
      formData.append("c", "share-image-save");
      formData.append("id", SESSION);
      formData.append("angle", String(i));
      formData.append("image", image);
      const promise = axios
        .post("https://nokona.com/configurator-api/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((res: { data: string }) => {
          if (res.data === "FALSE") {
            throw new Error("Failed to upload image");
          } else if (res.data === "FAILURE") {
            throw new Error("Failed to save uploaded image");
          }
          return res.data;
        })
        .catch((err) => {
          console.error(err);
          return false;
        });
      promises.push(promise);
    }

    const uploadableKeys = this.getUploadableImageKeys();
    for (let i = 0; i < uploadableKeys.length; i++) {
      const key = uploadableKeys[i];
      const blob = await uploaded.getBlob(key);
      if (!blob) continue;
      const formData = new FormData();
      formData.append("c", "custom-image-save");
      formData.append("key", key);
      formData.append("image", blob);
      const promise = axios
        .post("https://nokona.com/configurator-api/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((res: { data: string }) => {
          if (res.data === "FALSE") {
            throw new Error("Failed to upload image");
          } else if (res.data === "FAILURE") {
            throw new Error("Failed to save uploaded image");
          }
          return res.data;
        })
        .catch((err) => {
          console.error(err);
          return false;
        });
      promises.push(promise);
    }

    return await Promise.all(promises);
  },
  recoverSessionData(id: string) {
    return recoverSessionDataProto(id);
  },
};

function recoverSharedSession(): string {
  // const pathSession = location.pathname.match(/\/configurator\/(.+)\/?/)?.[1];
  // const hashSession = location.hash.replace("#", "");
  const querySession = params.getString("id") || "";
  const sessionID = querySession as string;
  const data = recoverSessionDataProto(sessionID);
  if (data) {
    return sessionID;
  }
  return "";
}
function recoverSessionDataProto(id: string) {
  return window.configuratorSessionData?.[id] || null;
}
function generateSessionID(length = 10) {
  let result = resilientSession ? "T--" : "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_~";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
