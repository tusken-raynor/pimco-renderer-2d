#version 300 es

// Erode shader.
// Shrinks bright regions of the input by min-sampling a square neighborhood of
// the .r channel. With our white-on-black-opaque mask format (white = inside
// text, black = outside) this thins the text shape inward by `radius` pixels.
//
// Output is opaque grayscale: vec4(vec3(minR), 1.0). Alpha is always 1, matching
// the mask format throughout the pipeline. Downstream consumers continue to use
// the .r channel for intensity.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform int uStart;       // Start offset for sampling kernel (negative for erosion)
uniform int uEnd;         // End offset for sampling kernel (positive for erosion)
uniform float uTexelSizeX;
uniform float uTexelSizeY;

out vec4 fragColor;

void main() {
  float xStart = float(uStart) * uTexelSizeX + outFragCoord.x;
  float yStart = float(uStart) * uTexelSizeY + outFragCoord.y;
  float x = xStart;
  float y = yStart;
  float minR = 1.0;

  // Sample all pixels in the kernel and take the minimum red value.
  // This erodes (shrinks) the bright/text regions of the mask.
  for (int i = uStart; i <= uEnd; i++) {
    for (int j = uStart; j <= uEnd; j++) {
      float r = texture(uInput, vec2(x, y)).r;
      minR = min(r, minR);
      x += uTexelSizeX;
    }
    x = xStart;
    y += uTexelSizeY;
  }

  fragColor = vec4(vec3(minR), 1.0);
}
