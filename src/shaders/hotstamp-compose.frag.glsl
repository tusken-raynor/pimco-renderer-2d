#version 300 es

// Hotstamp compose shader.
//
// Final pass for the hotstamp effect: paints the engraving fill color, darkens
// engraved-direction edges, brightens raised-direction edges, and gates the
// result by the rasterized text mask. Mirrors the legacy `applyHotstampEffect`
// chain in a single GPU pass.
//
// Inputs:
//   uMask       — white-on-black-opaque rasterized text mask (.r = inside text,
//                 with anti-aliased fractional values on edges).
//   uDarken     — emboss(INVERTED) output, format vec4(L, L, L, 1) where L is
//                 the clamped convolution luma. Read from .r. Sampled only
//                 when uHasEdges != 0; bind uMask as a placeholder otherwise.
//   uBrighten   — emboss(STANDARD) output, same format as uDarken.
//   uColor      — hotstamp fill RGB, computed CPU-side from color distance
//                 (warmer than engraving's tint: 35,22,0 vs 68,34,0 base).
//   uOpacity    — combined opacity (bezier eindex × layer alpha).
//   uEdgeAlpha  — composite weight for both emboss overlays (legacy: 0.2).
//
// Compositing (straight-alpha math, mirrors legacy Canvas2D op chain):
//   1. start  = (uColor, uOpacity)
//   2. darken = source-over of vec4(0, 0, 0, uDarken.r * uEdgeAlpha)
//   3. brighten = plus-lighter of vec4(1, 1, 1, uBrighten.r * uEdgeAlpha)
//   4. final.a *= uMask.r
//
// `plus-lighter` (Canvas2D `lighter`) is additive in premultiplied space, so
// step 3 evaluates in premul, then converts back to straight alpha.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uMask;
uniform sampler2D uDarken;
uniform sampler2D uBrighten;
uniform int uHasEdges;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uEdgeAlpha;

out vec4 fragColor;

void main() {
  float maskValue = texture(uMask, outFragCoord).r;

  vec3 rgb = uColor;
  float a = uOpacity;

  if (uHasEdges != 0) {
    // Step 2: source-over of (Cs=0, αs=darkA) onto (Cb=rgb, αb=a).
    //   αo = αs + αb·(1-αs)
    //   Co_premul = (1-αs)·αb·Cb            (Cs=0 cancels the source RGB term)
    //   Co_straight = Co_premul / αo
    float darkA = texture(uDarken, outFragCoord).r * uEdgeAlpha;
    float newA = darkA + a * (1.0 - darkA);
    if (newA > 0.0) {
      rgb = ((1.0 - darkA) * a * rgb) / newA;
    }
    a = newA;

    // Step 3: plus-lighter of (Cs=1, αs=lightA). In premul:
    //   premul_out.rgb = dst_premul.rgb + αs   (Cs=1 collapses src·αs to αs)
    //   premul_out.a   = αb + αs (clamped)
    float lightA = texture(uBrighten, outFragCoord).r * uEdgeAlpha;
    vec3 premul = rgb * a + vec3(lightA);
    float lighterA = min(a + lightA, 1.0);
    if (lighterA > 0.0) {
      rgb = premul / lighterA;
    }
    a = lighterA;
  }

  fragColor = vec4(rgb, a * maskValue);
}
