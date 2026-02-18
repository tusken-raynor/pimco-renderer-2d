#version 300 es

// Emboss/deboss convolution shader
// Applies a 3x3 convolution kernel to create emboss or deboss effect
// Used in engraving, hotstamp, metal, and painted effects

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform float uTexelSizeX;
uniform float uTexelSizeY;
// Convolution matrix (3x3 = 9 values)
// Standard emboss: [0, -1, -1, 0, -1, 1, 1, 1, 0]
// Inverted emboss (deboss): [0, 1, 1, 1, -1, 0, -1, -1, 0]
uniform float uMatrix[9];

out vec4 fragColor;

void main() {
  vec3 sum = vec3(0.0);

  // Sample the 3x3 kernel and apply convolution
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x) * uTexelSizeX, float(y) * uTexelSizeY);
      vec2 texCoord = outFragCoord + offset;
      vec4 color = texture(uInput, texCoord);
      int index = (y + 1) * 3 + (x + 1);
      sum += color.rgb * uMatrix[index];
    }
  }

  // Output with full alpha (emboss operates on RGB only)
  fragColor = vec4(sum, 1.0);
}
