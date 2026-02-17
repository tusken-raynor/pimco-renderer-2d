#version 300 es

// Fuzz/blur shader for embroidery effect
// Applies a per-row random horizontal offset to create a stitched/fuzzy appearance
// Uses hash-based pseudo-random number generation for consistent results

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform float uTexelSizeX;
uniform int uSeedOffset;   // Random seed for variation between renders
uniform float uFuzzScale;  // Controls the intensity of the fuzz effect (1.0 = normal)

out vec4 fragColor;

// Integer hash function for pseudo-random number generation
// Based on MurmurHash-style mixing
int hash(int x) {
  x ^= (x >> 16);
  x *= 0x853bca6b;
  x ^= (x >> 13);
  x *= 0xc2b2ae35;
  x ^= (x >> 16);
  return x;
}

void main() {
  // Generate a random horizontal offset based on the y-coordinate
  // This creates a consistent "stitch line" effect per row
  int rowHash = hash(int(gl_FragCoord.y) + uSeedOffset);

  // Map hash to range [-7, 8] then scale to [-0.875, 1.0]
  float pixelOffsetX = float((rowHash & 15) - 7) / 8.0 * uFuzzScale;
  float offsetX = pixelOffsetX * uTexelSizeX;

  vec2 texCoord = vec2(outFragCoord.x + offsetX, outFragCoord.y);

  fragColor = texture(uInput, texCoord);
}
