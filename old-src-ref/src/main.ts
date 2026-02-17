import { createApp } from "vue";
import App from "./App.vue";
import store from "./store";
import Image from "./components/Image.vue";
import Video from "./components/Video.vue";
import utils from "./utils";
import { initWasm } from "./wasm/init";
import params from "./params";

import * as Sentry from "@sentry/vue";

const isTouch = utils.isTouchDevice4();
window.isTouch = isTouch;
// Initialize the wasm module
if (params.get("wasm") !== "no" && utils.isWASMAvailable()) {
  if (params.get("wasm") === "async") {
    setTimeout(() => {
      initWasm(() => {
        store.state.wasmLoaded = true;
      });
    }, 0);
  } else {
    initWasm(() => {
      store.state.wasmLoaded = true;
    });
  }
} else {
  store.state.wasmUnavailable = true;
}

const app = createApp(App);
app.component("BaseImage", Image);
app.component("BaseVideo", Video);

Sentry.init({
  app,
  dsn: "https://eefa958e19c0453d0dee5cd3e8c2db1a@o1068000.ingest.us.sentry.io/4510822904430592",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  environment: utils.getEnvironment(),
});

Sentry.setContext("device_session", utils.getUserDeviceParams());

app.use(store).mount("#app");

// Determine the OS to help with bad scrollbar rendering
document.addEventListener("DOMContentLoaded", (e) => {
  const os = utils.getOS();
  if (os) {
    document.body.classList.add(utils.sanitize(os));
    window.OS = os;
  }
});
const browser = utils.detectBrowser();
if (browser) {
  document.body.classList.add("browser-" + utils.sanitize(browser));
  window.browser = browser;
}
if (isTouch) {
  document.body.classList.add("is-touch");
}

// Mark the app version
document.querySelector("#app")?.setAttribute("data-version", utils.getVersion());

// Mark the app environment from Vite
document.querySelector("#app")?.setAttribute("data-env", utils.getEnvironment());
