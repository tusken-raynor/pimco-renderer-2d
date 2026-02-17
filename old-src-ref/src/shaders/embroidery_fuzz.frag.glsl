#version 300 es

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform float uTexelSizeX;
uniform int uSeedOffset;
uniform float uFuzzScale;

out vec4 fragColor;

int hash(int x) {
  x ^= (x >> 16);
  x *= 0x853bca6b;
  x ^= (x >> 13);
  x *= 0xc2b2ae35;
  x ^= (x >> 16);
  return x;
}

void main() {
  float pixelOffsetX = float(hash(int(gl_FragCoord.y) + uSeedOffset) & 15 - 7) / 8.0 * uFuzzScale;
  float offsetX = pixelOffsetX * uTexelSizeX;
  vec2 texCoord = vec2(outFragCoord.x + offsetX, outFragCoord.y);

  fragColor = texture(uInput, texCoord);
}