#version 300 es

// Engraving compose shader.
//
// Final pass for the engraving effect: combines the rasterized text mask, an
// optional pre-blurred emboss highlight overlay, and a CPU-computed engraving
// fill color into the output.
//
// Inputs:
//   uMask       — white-on-black-opaque rasterized text mask (.r = inside text)
//   uHighlight  — emboss-then-blur output, format vec4(L, L, L, 1) where
//                 L = clamped convolution luma. Read from .r. Sampled only
//                 when uHasHighlight != 0; bind uMask as a placeholder when
//                 not in use to keep the sampler valid.
//   uColor      — engraving fill RGB, computed CPU-side from color distance
//   uOpacity    — combined opacity (bezier eindex × layer alpha)
//   uHighlightAlpha — composite weight for the highlight overlay (legacy: 0.07)

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uMask;
uniform sampler2D uHighlight;
uniform int uHasHighlight;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHighlightAlpha;

out vec4 fragColor;

void main() {
  // Mask gates the entire output. .r = 1 inside text, 0 outside, anti-aliased on edges.
  float maskValue = texture(uMask, outFragCoord).r;

  vec3 rgb = uColor;
  float a = uOpacity;

  if (uHasHighlight != 0) {
    // Multiply blend the highlight overlay onto the engraving fill, matching
    // legacy `globalCompositeOperation = "multiply"` + `globalAlpha = 0.07`.
    //
    //   src = (0, 0, 0, hlA)              hlA = highlight.a × uHighlightAlpha
    //   dst = (rgb, a)                    the engraving fill
    //
    // W3C compositing for multiply with sRGB straight-alpha:
    //   B(Cb, Cs) = Cb × Cs              with src.rgb = 0, B = 0
    //   αo = αs + αb × (1 - αs)
    //   Co = (αs × (1-αb) × Cs  +  αs × αb × B  +  (1-αs) × αb × Cb) / αo
    //      = (1 - αs) × αb × Cb / αo     since Cs = 0 and B = 0
    //
    // The (1 - αs) × αb factor in the RGB scaling is the key difference from
    // a naive source-over of black: it darkens proportional to αb (engraving
    // opacity), which gives the engraved-edge shadow that varies with the
    // engraving fill's own opacity.
    float hlA = texture(uHighlight, outFragCoord).r * uHighlightAlpha;
    float newA = hlA + a * (1.0 - hlA);
    if (newA > 0.0) {
      rgb = ((1.0 - hlA) * a * rgb) / newA;
    }
    a = newA;
  }

  fragColor = vec4(rgb, a * maskValue);
}
