import { parseTemplate } from "./lib";

self.addEventListener('message', async (event) => {
  const { $id, payload: { action, data } } = event.data;
  
  try {
    if (action === 'parseTemplate') {
      const result = parseTemplate(data);
      self.postMessage({ $id, payload: { data: result } });
    } else {
      self.postMessage({ $id, payload: null });
    }
  } catch (error) {
    self.postMessage({ $id, error: (error as Error).message || String(error) });
  }
});