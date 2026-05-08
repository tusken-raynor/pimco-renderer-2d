#version 300 es

// Emboss/deboss convolution shader.
//
// Applies a 3x3 convolution kernel and emits a grayscale luma image
// (vec4(L, L, L, 1)) where L = clamp(sum.r, 0..1). The input mask is
// white-on-black-opaque, so all colour channels of the source are equal and
// only sum.r is meaningful — the output collapses to luma to make the format
// explicit.
//
// Negative convolution values get clamped to 0; capturing both highlight AND
// shadow sides therefore requires two emboss passes with opposite kernels
// (e.g. STANDARD then INVERTED). Downstream shaders reformat the luma into
// whatever overlay form they need (vec4(0,0,0,L) for a darken-overlay,
// vec4(1,1,1,L) for a lighten-overlay, etc.) — this shader doesn't bake those
// in, keeping it a pure convolution primitive.
//
// Edge clear (uMargins) is the one extension still folded in: pixels within
// a margin band along any edge emit (0, 0, 0, 1), suppressing convolution
// bleed where text touches a canvas border. Replaces the legacy fillRect()
// cleanup. uMargins defaults to vec4(0) — no clearing.
//
// uOffset is added to the convolution sum before clamping. For sum-zero
// kernels (STANDARD, INVERTED) used against the white-on-black mask, the
// "negate the matrix" trick gives an exact legacy match and uOffset is 0.
// For non-zero-sum kernels (e.g. METAL), `conv(I', -M_legacy) = -sum(M_legacy)
// + conv(I, M_legacy)`, so callers pass uOffset = sum(M_legacy) to recover
// the legacy unclamped value before clamp.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform float uTexelSizeX;
uniform float uTexelSizeY;
// Convolution matrix (3x3 = 9 values), row-major.
// Standard emboss: [0, 1, 1, 0, 1, -1, -1, -1, 0]
// Inverted emboss (deboss): [0, -1, -1, -1, 1, 0, 1, 1, 0]
uniform float uMatrix[9];
uniform float uOffset;  // added to convolution sum before clamp; see header
uniform vec4 uMargins;  // (top, right, bottom, left) in pixels
uniform vec2 uSize;     // output canvas size in pixels

out vec4 fragColor;

void main() {
  // Edge clear band: fragments within any margin skip the convolution and
  // emit black. uMargins is `(top, right, bottom, left)` in *original-image*
  // coordinates. Under FBO_VERTEX_SRC (the non-flipping chain vert),
  // fb-bottom (small `gl_FragCoord.y`) is original-top, so `dist` packs each
  // side's distance-from-edge in original-image orientation and a single
  // `any(lessThan(...))` covers all four sides.
  vec2 px = gl_FragCoord.xy;
  vec4 dist = vec4(px.y, uSize.x - px.x, uSize.y - px.y, px.x);
  if (any(lessThan(dist, uMargins))) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // 3x3 convolution on the .r channel (mask is grayscale; .r = .g = .b).
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x) * uTexelSizeX, float(y) * uTexelSizeY);
      float c = texture(uInput, outFragCoord + offset).r;
      int index = (y + 1) * 3 + (x + 1);
      sum += c * uMatrix[index];
    }
  }

  float lum = clamp(sum + uOffset, 0.0, 1.0);
  fragColor = vec4(lum, lum, lum, 1.0);
}
