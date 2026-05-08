#version 300 es

// Metal compose shader.
//
// Combines a tiled brushed-metal texture, a uniform color tint, dual emboss
// edge overlays (sharp metallic bevel), and the rasterized text mask in a
// single pass. Mirrors the legacy `applyMetalEffect` Canvas2D op chain:
//
//   1. drawImage(tile(texture)) — fills the canvas with the tiled metal
//      pattern. When the layer has no texture asset, JS uploads a 1×1 white
//      pixel via the lib's color-to-texture path; the multiply below then
//      collapses to (uColor, uOpacity) — equivalent to the legacy "no tile"
//      branch but with no shader-side conditional.
//   2. multiply blend of `rgba(uColor, uOpacity)` onto the tiled texture.
//      With opaque texture this collapses to:
//        out.rgb = T * mix(1, uColor, uOpacity); out.a = 1
//   3. source-over of vec4(0, 0, 0, uDarken.r * uDarkAlpha) — engraved-
//      direction edges darkened (legacy: 0.7 weight, custom kernel).
//   4. plus-lighter of vec4(1, 1, 1, uBrighten.r * uBrightAlpha) — raised-
//      direction edges brightened (legacy: 0.3 weight, INVERTED kernel).
//   5. final.a *= uMask.r — gate by the rasterized text mask.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uMask;
uniform sampler2D uTexture;     // tiled — sampled with fract(uv * uTileScale)
uniform sampler2D uDarken;
uniform sampler2D uBrighten;
uniform vec2 uTileScale;        // (canvasW / textureW, canvasH / textureH)
uniform vec3 uColor;
uniform float uOpacity;         // layer alpha
uniform float uDarkAlpha;       // legacy 0.7
uniform float uBrightAlpha;     // legacy 0.3
uniform int uHasEdges;

out vec4 fragColor;

void main() {
  float maskValue = texture(uMask, outFragCoord).r;

  // Canvas2D `multiply` of rgba(uColor, uOpacity) onto opaque texture T:
  //   αo = uOpacity + 1·(1-uOpacity) = 1
  //   Co_premul = uOpacity·T·uColor + (1-uOpacity)·T = T·mix(1, uColor, uOpacity)
  // When no texture asset is present, JS binds a 1×1 white pixel for uTexture
  // and tile scale is irrelevant — the sample returns vec3(1) everywhere and
  // the formula collapses to mix(1, uColor, uOpacity), matching the legacy
  // no-texture path without a shader-side branch.
  vec3 t = texture(uTexture, fract(outFragCoord * uTileScale)).rgb;
  vec3 rgb = t * mix(vec3(1.0), uColor, uOpacity);
  float a = 1.0;

  if (uHasEdges != 0) {
    // Source-over of (Cs=0, αs=darkA) onto (Cb=rgb, αb=a).
    float darkA = texture(uDarken, outFragCoord).r * uDarkAlpha;
    float newA = darkA + a * (1.0 - darkA);
    if (newA > 0.0) {
      rgb = ((1.0 - darkA) * a * rgb) / newA;
    }
    a = newA;

    // Plus-lighter of (Cs=1, αs=lightA): additive in premultiplied space.
    float lightA = texture(uBrighten, outFragCoord).r * uBrightAlpha;
    vec3 premul = rgb * a + vec3(lightA);
    float lighterA = min(a + lightA, 1.0);
    if (lighterA > 0.0) {
      rgb = premul / lighterA;
    }
    a = lighterA;
  }

  fragColor = vec4(rgb, a * maskValue);
}
