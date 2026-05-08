#version 300 es

// Shadow compose shader.
//
// Final pass for the shadow effect: takes the soft, expanded shadow shape
// (mask after spread + blur), tints it with `uColor`, and applies the
// multi-pass alpha buildup that legacy implemented as iterated source-over
// of the shadow onto itself.
//
// Multi-pass alpha (legacy):
//   while (alpha > 0) {
//     ctx.globalAlpha = min(alpha, 1.0);
//     ctx.drawImage(shadow, 0, 0);
//     alpha -= 1.0;
//   }
//
// Source-over of (rgb, A·s) onto (rgb, prev_a):
//   new_a = A·s + prev_a · (1 − A·s)
//
// Iterating N full passes (s = 1) starting from prev_a = 0 with shadow alpha
// A converges to:
//   1 − (1 − A)^N
//
// Plus one fractional pass at s = α − ⌊α⌋ on top:
//   final_a = A·s_frac + (1 − (1 − A)^N) · (1 − A·s_frac)
//
// This matches the legacy iteration exactly for integer α and gives a
// continuous interpolation for fractional values.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uShadowMask;
uniform vec3 uColor;
uniform float uAlpha;        // can be > 1 for multi-pass density buildup

out vec4 fragColor;

void main() {
  // Mask is grayscale post-bc; .r encodes shadow density. Alpha was
  // preserved as 1.0 by upstream blur passes (white-on-black mask format).
  float A = texture(uShadowMask, outFragCoord).r;

  float fullN = floor(uAlpha);
  float fracAlpha = uAlpha - fullN;

  float fullDensity = 1.0 - pow(1.0 - A, fullN);
  float fracDensity = A * fracAlpha;
  float finalA = fracDensity + fullDensity * (1.0 - fracDensity);

  fragColor = vec4(uColor, finalA);
}
