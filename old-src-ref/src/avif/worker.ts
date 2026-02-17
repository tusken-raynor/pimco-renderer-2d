// THIS WORKER HAS BEEN MADE SUITE COMPLIANT BY PASSING ALONG THE MESSAGE ID AND USING PAYLOADS TO SEND DATA

import { actions } from "./lib";

self.addEventListener("message", async (event) => {
  const { $id, payload: { action, data } } = event.data;
  if (action in actions) {
    const result = await (actions as any)[action](data);
    self.postMessage({ $id, payload: result });
  } else {
    self.postMessage({ $id, payload: null });
  }
});