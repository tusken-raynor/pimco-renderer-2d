#version 300 es

// Painted compose shader.
//
// Builds a paint-stamp text in a single pass: a tiled paint texture × color
// tint inside an alpha-eroded text shape, sitting over a backdrop of soft
// bevel hints (emboss INVERTED darken + emboss STANDARD brighten, both
// crisp — no blur, matching the legacy which did not blur the painted
// emboss layers).
//
// Mirrors the legacy `applyPaintedEffect` Canvas2D op chain in straight-
// alpha space:
//
//   backdrop = empty
//   1. multiply of vec4(0, 0, 0, uHighlight.r·0.1)         — bevel darken
//   2. plus-lighter of vec4(1, 1, 1, uShadowEdge.r·0.05)   — bevel brighten
//   3. source-over of (paintRgb, uShrunkMask.r)            — paint on top
//
// Inputs:
//   uShrunkMask   — alpha-eroded mask; .r gates the paint body.
//   uTexture      — tiled paint pattern, or 1×1 white when no asset.
//   uHighlight    — emboss(INVERTED) + bottom-2 clear, crisp.
//   uShadowEdge   — emboss(STANDARD) + top-2 clear, crisp.
//   uTileScale    — canvas / texture, for fract() tiling.
//   uColor        — paint tint RGB.
//   uOpacity      — tint strength (modulates multiply between texture and
//                   color; alpha-modulates-tint convention).
//   uHighlightAlpha   — legacy 0.1 (bevel-darken weight).
//   uShadowEdgeAlpha  — legacy 0.05 (bevel-brighten weight).
//   uHasEdges     — when 0, skip the bevel passes and emit just the paint
//                   body (small-text legacy path).
//
// Note: legacy painted ran its emboss on a heavily-thresholded "expanded"
// mask (blur + brightness/contrast chain) so the bevel rim sat slightly
// outside the original text edge. We currently emboss the raw mask for
// crisp edges along the actual glyph. If we need the slightly-fattened
// bevel, the right hook is a separate prep pass (dilate or invert+erode+
// invert) feeding uHighlight / uShadowEdge instead of the raw mask.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uShrunkMask;
uniform sampler2D uTexture;
uniform sampler2D uHighlight;
uniform sampler2D uShadowEdge;
uniform vec2 uTileScale;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHighlightAlpha;
uniform float uShadowEdgeAlpha;
uniform int uHasEdges;

out vec4 fragColor;

void main() {
  vec3 t = texture(uTexture, fract(outFragCoord * uTileScale)).rgb;
  vec3 paintRgb = t * mix(vec3(1.0), uColor, uOpacity);
  float paintA = texture(uShrunkMask, outFragCoord).r;

  if (uHasEdges == 0) {
    fragColor = vec4(paintRgb, paintA);
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

  // 3. source-over of (paintRgb, paintA) on top.
  float finalA = paintA + a * (1.0 - paintA);
  if (finalA > 0.0) {
    rgb = (paintA * paintRgb + (1.0 - paintA) * a * rgb) / finalA;
  }
  a = finalA;

  fragColor = vec4(rgb, a);
}
