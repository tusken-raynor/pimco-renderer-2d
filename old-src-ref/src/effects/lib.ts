export function crop2Content(imageData: ImageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  let top = height, bottom = 0, left = width, right = 0;

  // Find the bounding box of non-transparent pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];

      if (alpha > 0) { // Non-transparent pixel found
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  // Calculate the new width, height, and padding
  const newWidth = right - left + 1;
  const newHeight = bottom - top + 1;
  // Create a new buffer for the cropped data
  const croppedBuffer = new Uint8ClampedArray(newWidth * newHeight * 4);
  // Copy the cropped data into the new buffer
  for (let y = 0; y <= newHeight; y++) {
    for (let x = 0; x <= newWidth; x++) {
      const targetIndex = (y * newWidth + x) * 4;
      const sourceIndex = ((y + top) * width + (x + left)) * 4;
      croppedBuffer[targetIndex] = data[sourceIndex];
      croppedBuffer[targetIndex + 1] = data[sourceIndex + 1];
      croppedBuffer[targetIndex + 2] = data[sourceIndex + 2];
      croppedBuffer[targetIndex + 3] = data[sourceIndex + 3];
    }
  }

  return new ImageData(croppedBuffer, newWidth, newHeight);
}

export function frameImage(imageData: ImageData, width: number, height: number) {
  const data = imageData.data;

  const newBuffer = new Uint8ClampedArray(width * height * 4);
  
  // Loop through the canvas pixels and copy them centered onto the new buffer
  const xOffset = Math.round((width - imageData.width) / 2);
  const yOffset = Math.round((height - imageData.height) / 2);
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const targetIndex = ((y + yOffset) * width + x + xOffset) * 4;
      const sourceIndex = (y * imageData.width + x) * 4;
      newBuffer[targetIndex] = data[sourceIndex];
      newBuffer[targetIndex + 1] = data[sourceIndex + 1];
      newBuffer[targetIndex + 2] = data[sourceIndex + 2];
      newBuffer[targetIndex + 3] = data[sourceIndex + 3];
    }
  }

  return new ImageData(newBuffer, width, height);
}

export function prettyResize(imageData: ImageData, newWidth: number, newHeight: number) {
  // Round the new width and height to the nearest integer
  newWidth = Math.round(newWidth);
  newHeight = Math.round(newHeight);
  // If the newHeight is -1, calculate it based on the aspect ratio
  if (newHeight === -1) {
    newHeight = Math.round(newWidth / imageData.width * imageData.height);
  }
  if (newWidth > imageData.width || newHeight > imageData.height) {
    return biggerThanOriginal(imageData, newWidth, newHeight);
  }
  // Find the width and height of an intermediate image that needs to be created
  // The dimensions must be a perfect multiple of the new width and height, and must
  // be as close as possible to the original image's aspect ratio while being just bigger
  // than the original width and height
  const upWidth = Math.ceil(imageData.width / newWidth) * newWidth;
  const upHeight = Math.ceil(imageData.height / newHeight) * newHeight;
  // Get the intermediate image using nearest neighbor interpolation
  const intermediateImage = createIntermediateImage(imageData, upWidth, upHeight);
  // Define the cell dimensions. A cell is a grid of pixels that will be averaged to create a single pixel in the new image
  const cellWidth = upWidth / newWidth;
  const cellHeight = upHeight / newHeight;
  const cellSize = cellWidth * cellHeight;
  // Create the new image data
  const newBuffer = new Uint8ClampedArray(newWidth * newHeight * 4);
  // Iterate through the new image data and average the colors of the cells
  for (let y = 0; y < newHeight; y++) {
    const row = y * newWidth;
    for (let x = 0; x < newWidth; x++) {
      const col = (row + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < cellHeight; j++) {
        for (let i = 0; i < cellWidth; i++) {
          const cellCol = ((y * cellHeight + j) * intermediateImage.width + x * cellWidth + i) * 4;
          const thisA = intermediateImage.data[cellCol + 3];
          r += intermediateImage.data[cellCol] * thisA;
          g += intermediateImage.data[cellCol + 1] * thisA;
          b += intermediateImage.data[cellCol + 2] * thisA;
          a += thisA;
        }
      }
      const avgA = a / cellSize;
      newBuffer[col] = r / cellSize / avgA;
      newBuffer[col + 1] = g / cellSize / avgA;
      newBuffer[col + 2] = b / cellSize / avgA;
      newBuffer[col + 3] = avgA;
    }
  }
  return new ImageData(newBuffer, newWidth, newHeight);
}

function biggerThanOriginal(imageData: ImageData, newWidth: number, newHeight: number) {
  return createIntermediateImage(imageData, newWidth, newHeight);
}

function createIntermediateImage(imageData: ImageData, upWidth: number, upHeight: number) {
  const newBuffer = new Uint8ClampedArray(upWidth * upHeight * 4);
  // Copy the original image data into the new buffer using nearest neighbor interpolation
  const upScaleX = imageData.width / upWidth;
  const upScaleY = imageData.height / upHeight;
  for (let y = 0; y < upHeight; y++) {
    const row = y * upWidth;
    const rowScaled = Math.floor(y * upScaleY) * imageData.width;
    let xScaled = 0;
    for (let x = 0; x < upWidth; x++) {
      const col = (row + x) * 4;
      const colScaled = Math.floor(rowScaled + xScaled) * 4;
      newBuffer[col] = imageData.data[colScaled];
      newBuffer[col + 1] = imageData.data[colScaled + 1];
      newBuffer[col + 2] = imageData.data[colScaled + 2];
      newBuffer[col + 3] = imageData.data[colScaled + 3];
      xScaled += upScaleX;
    }
  }
  return new ImageData(newBuffer, upWidth, upHeight);
}