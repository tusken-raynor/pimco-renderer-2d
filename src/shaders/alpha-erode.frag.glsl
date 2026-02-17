#version 300 es

// Alpha erosion shader
// Shrinks/erodes the alpha channel by sampling neighboring pixels
// Used for mask preprocessing in emboss and foil effects

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
  float alpha = 1.0;

  // Sample all pixels in the kernel and take the minimum alpha
  // This erodes (shrinks) the alpha channel
  for (int i = uStart; i <= uEnd; i++) {
    for (int j = uStart; j <= uEnd; j++) {
      vec2 texCoord = vec2(x, y);
      vec4 color = texture(uInput, texCoord);
      alpha = min(color.a, alpha);
      x += uTexelSizeX;
    }
    x = xStart;
    y += uTexelSizeY;
  }

  // Preserve RGB but use the eroded alpha
  vec4 color = texture(uInput, outFragCoord);
  fragColor = vec4(color.rgb, alpha);
}
