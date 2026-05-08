#version 300 es

// Foil compose shader.
//
// Builds a metallic foil-stamp text in a single pass: a tiled foil texture ×
// color tint, gated by a SHRUNKEN mask (alpha-eroded by ~1px so the foil
// sits inside the original glyph), composited over a backdrop of soft bevel
// hints and a halo shadow built from the original (un-eroded) mask.
//
// Mirrors the legacy `applyFoilEffect` Canvas2D op chain with the layers
// computed in straight-alpha space:
//
//   backdrop = empty
//   1. multiply of vec4(0, 0, 0, uHighlight.r·0.1)         — bevel darken
//   2. plus-lighter of vec4(1, 1, 1, uShadowEdge.r·0.1)    — bevel brighten
//   3. multiply of vec4(0, 0, 0, uShadowMask.r·0.2)        — drop-shadow halo
//   4. source-over of (foilRgb, uShrunkMask.r)             — foil text on top
//
// Inputs:
//   uShrunkMask   — alpha-eroded mask; .r gates the foil text body.
//   uTexture      — tiled foil pattern, or 1×1 white when no asset.
//   uHighlight    — emboss(INVERTED) + top-1 clear, blurred 1px.
//   uShadowEdge   — emboss(STANDARD) + bottom-2 clear, blurred 1px.
//   uShadowMask   — raw mask blurred 2px (drop-shadow halo shape).
//   uTileScale    — canvas / texture, for fract() tiling.
//   uColor        — tint RGB.
//   uOpacity      — tint strength (modulates multiply between texture and
//                   color; alpha-modulates-tint convention).
//   uHighlightAlpha   — legacy 0.1 (bevel-darken weight).
//   uShadowEdgeAlpha  — legacy 0.1 (bevel-brighten weight).
//   uShadowMaskAlpha  — legacy 0.2 (halo darken weight).
//   uHasEdges     — when 0, skip the bevel + halo passes and emit just the
//                   foil text (small-text legacy path).
//
// Note: legacy renders into a (width + 2) × height canvas and offsets the
// foil text + shadow mask by 1px horizontally to produce a subtle directional
// drop shadow. We currently match the visual at width × height with no
// horizontal offset — the 1px shift is a small detail that can be added by
// sampling uShrunkMask / uShadowMask at `outFragCoord - vec2(1.0/uW, 0)` if
// desired.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uShrunkMask;
uniform sampler2D uTexture;
uniform sampler2D uHighlight;
uniform sampler2D uShadowEdge;
uniform sampler2D uShadowMask;
uniform vec2 uTileScale;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHighlightAlpha;
uniform float uShadowEdgeAlpha;
uniform float uShadowMaskAlpha;
uniform int uHasEdges;

out vec4 fragColor;

void main() {
  // Pre-compute the foil text body so it can be either composited on top of
  // the backdrop (tall text) or returned directly (small text).
  vec3 t = texture(uTexture, fract(outFragCoord * uTileScale)).rgb;
  vec3 foilRgb = t * mix(vec3(1.0), uColor, uOpacity);
  float foilA = texture(uShrunkMask, outFragCoord).r;

  if (uHasEdges == 0) {
    // Small-text path: just the foil text, no bevels, no halo.
    fragColor = vec4(foilRgb, foilA);
    return;
  }

  vec3 rgb = vec3(0.0);
  float a = 0.0;

  // 1. multiply of (0, 0, 0, h1) onto empty → black with alpha h1.
  float h1 = texture(uHighlight, outFragCoord).r * uHighlightAlpha;
  a = h1;

  // 2. plus-lighter of (1, 1, 1, h2): additive in premul.
  float h2 = texture(uShadowEdge, outFragCoord).r * uShadowEdgeAlpha;
  vec3 plusPremul = rgb * a + vec3(h2);
  float plusA = min(a + h2, 1.0);
  if (plusA > 0.0) {
    rgb = plusPremul / plusA;
  }
  a = plusA;

  // 3. multiply of (0, 0, 0, sm) onto current. Cs = 0 cancels the source
  //    term: Co_premul = (1 − αs)·a·rgb; αo = αs + a·(1 − αs).
  float sm = texture(uShadowMask, outFragCoord).r * uShadowMaskAlpha;
  float mulA = sm + a * (1.0 - sm);
  if (mulA > 0.0) {
    rgb = ((1.0 - sm) * a * rgb) / mulA;
  }
  a = mulA;

  // 4. source-over of (foilRgb, foilA) onto current.
  //    αo = foilA + a·(1 − foilA)
  //    Co_premul = foilA·foilRgb + (1 − foilA)·a·rgb
  float finalA = foilA + a * (1.0 - foilA);
  if (finalA > 0.0) {
    rgb = (foilA * foilRgb + (1.0 - foilA) * a * rgb) / finalA;
  }
  a = finalA;

  fragColor = vec4(rgb, a);
}
