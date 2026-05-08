#version 300 es

// Embroidery compose shader.
//
// Final pass of the embroidery effect: combines a tiled thread texture, a
// uniform color tint, dual emboss edge overlays (blurred raised highlight +
// crisp engraved shadow), the fuzzed text mask, and an optional drop shadow
// underneath the text. Mirrors the legacy `applyEmbroideryEffect` Canvas2D
// chain in straight-alpha math:
//
//   1. drawImage(tile(texture)) — tiled thread pattern. When no texture is
//      bound, JS uploads a 1×1 white pixel via the lib's color-to-texture
//      path so the shader stays branchless (see metal-compose for the same
//      pattern).
//   2. multiply blend of `rgba(uColor, uOpacity)` onto the tiled texture →
//      `texture × mix(1, uColor, uOpacity)`, alpha = 1.
//   3. source-over of vec4(0, 0, 0, uHighlight.r * uDarkAlpha) — darkens
//      raised-direction edges. uHighlight is the post-blur emboss handle
//      (blur(4px) baked in by the prep chain), giving a softer thread-shadow
//      look than hotstamp/metal's crisp edges.
//   4. plus-lighter of vec4(1, 1, 1, uShadow.r * uBrightAlpha) — brightens
//      engraved-direction edges. uBrightAlpha = 1 − colorBrightness, so
//      darker thread colors get a stronger highlight.
//   5. final.a *= uMask.r — gate by the fuzzed/eroded mask.
//   6. (optional) source-over of the embroidered text on top of a black
//      shadow layer (uShadowBlurredMask.r × colorBrightness × 0.7) — gives
//      the text a soft drop shadow whose strength scales with thread color.
//      Only runs when uHasDropShadow != 0 (i.e. textHeight > threshold).

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uMask;             // fuzzed eroded mask (alpha gate; .r)
uniform sampler2D uShadowBlurredMask; // drop-shadow shape, blurred 1px (.r)
uniform sampler2D uTexture;          // tiled thread texture (or 1×1 white)
uniform sampler2D uHighlight;        // emboss(STANDARD)+blur(4), .r = darken
uniform sampler2D uShadow;           // emboss(INVERTED) crisp, .r = brighten
uniform vec2 uTileScale;             // canvas / texture, for fract() tiling
uniform vec3 uColor;
uniform float uOpacity;              // layer alpha (modulates tint strength)
uniform float uDarkAlpha;            // legacy 0.7 (highlight overlay weight)
uniform float uBrightAlpha;          // 1 − colorBrightness (dynamic)
uniform float uShadowAlpha;          // colorBrightness × 0.7 (drop-shadow)
uniform int uHasEdges;
uniform int uHasDropShadow;

out vec4 fragColor;

void main() {
  // Texture × color tint. Always opaque after this step.
  vec3 t = texture(uTexture, fract(outFragCoord * uTileScale)).rgb;
  vec3 rgb = t * mix(vec3(1.0), uColor, uOpacity);
  float a = 1.0;

  if (uHasEdges != 0) {
    // Source-over darken: (Cs=0, αs=darkA) onto (Cb=rgb, αb=a).
    float darkA = texture(uHighlight, outFragCoord).r * uDarkAlpha;
    float newA = darkA + a * (1.0 - darkA);
    if (newA > 0.0) {
      rgb = ((1.0 - darkA) * a * rgb) / newA;
    }
    a = newA;

    // Plus-lighter brighten: additive in premul (Cs=1, αs=brightA).
    float brightA = texture(uShadow, outFragCoord).r * uBrightAlpha;
    vec3 premul = rgb * a + vec3(brightA);
    float lighterA = min(a + brightA, 1.0);
    if (lighterA > 0.0) {
      rgb = premul / lighterA;
    }
    a = lighterA;
  }

  // Mask gate (fuzzed eroded mask, .r encodes intensity).
  a *= texture(uMask, outFragCoord).r;

  if (uHasDropShadow != 0) {
    // Source-over of (rgb, a) onto (Cb=0, αb=shadowA):
    //   αo = a + shadowA·(1 − a)
    //   Co_premul = a·rgb        (dst.rgb = 0 cancels the dst term)
    //   Co_straight = (a·rgb) / αo
    float shadowA = texture(uShadowBlurredMask, outFragCoord).r * uShadowAlpha;
    float outA = a + shadowA * (1.0 - a);
    if (outA > 0.0) {
      rgb = (a * rgb) / outA;
    }
    a = outA;
  }

  fragColor = vec4(rgb, a);
}
