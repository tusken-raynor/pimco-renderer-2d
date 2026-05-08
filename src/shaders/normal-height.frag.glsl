#version 300 es

// Normal-effect height-map shader.
//
// Builds the grayscale "height" map that the Sobel/light-direction pass
// reads to derive surface normals. Mirrors the legacy chain
//   tile(texture) -> multiply(color, alpha) -> destination-in(roundedMask)
//   -> source-over onto black -> colorScale(intensity)
// in a single pass, in straight-alpha space:
//
//   colored      = texture · mix(1, uColor, uOpacity)        // tint
//   onBlack      = colored · maskA                           // black background
//   scaled       = clamp((onBlack − 0.5) · uIntensity + 0.5) // colorScale
//
// Output is `vec4(scaled, 1.0)` — opaque grayscale ready for Sobel
// gradient computation.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uMask;        // rounded mask, .r encodes alpha
uniform sampler2D uTexture;     // tiled texture (or 1×1 white identity)
uniform vec2 uTileScale;        // canvas / texture, for fract() tiling
uniform vec3 uColor;
uniform float uOpacity;
uniform float uIntensity;       // legacy NormalIntensity → colorScale around 0.5

out vec4 fragColor;

void main() {
  vec3 t = texture(uTexture, fract(outFragCoord * uTileScale)).rgb;
  vec3 colored = t * mix(vec3(1.0), uColor, uOpacity);
  float maskA = texture(uMask, outFragCoord).r;

  vec3 onBlack = colored * maskA;
  vec3 scaled = clamp((onBlack - 0.5) * uIntensity + 0.5, 0.0, 1.0);

  fragColor = vec4(scaled, 1.0);
}
