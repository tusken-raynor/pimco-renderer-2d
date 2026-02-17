/// <reference types="vite/client" />

import { DefineComponent } from "vue";
import store from "./store";

declare module "*.vue" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "@vue/runtime-core" {
  interface ComponentCustomProperties {
    $store: typeof store;
  }
}
