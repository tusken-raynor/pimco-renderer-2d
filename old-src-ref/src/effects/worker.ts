
// THIS WORKER HAS BEEN MADE SUITE COMPLIANT BY PASSING ALONG THE MESSAGE ID AND USING PAYLOADS TO SEND DATA
import { crop2Content, frameImage, prettyResize } from "./lib";

addEventListener('message', (event) => {
  const { $id, payload } = event.data;

  const tasks: Array<{ type: string; [key: string]: any; }> = payload.tasks;

  let task = tasks.shift();
  let imageData = payload.imageData;
  
  // Loop through each task and apply the corresponding effect
  while (task) {
    if (task.type === "resize") {
      imageData = prettyResize(imageData, task.width, task.height);
    } else if (task.type === "crop") {
      imageData = crop2Content(imageData);
    } else if (task.type === "frame") {
      imageData = frameImage(imageData, task.width, task.height);
    }
    task = tasks.shift();
  }

  // Send the new image data back to the main script
  postMessage({ payload: imageData, $id }, [imageData.data.buffer] as any);
});
