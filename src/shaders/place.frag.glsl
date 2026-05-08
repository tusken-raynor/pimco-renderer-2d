#version 300 es

// Place shader (generic).
//
// Positions a smaller input texture (typically the rasterized text mask) at
// a pixel offset inside a larger output canvas. Pixels outside the input
// region emit vec4(0) — a hard transparent border. Used by effects that need
// to seat the mask inside an expanded canvas so subsequent blur / Sobel
// passes don't clip artifacts at the canvas edge (shadow, normal).
//
// We can't lean on `TEXTURE_WRAP_S/T = CLAMP_TO_BORDER` (that's an extension
// in WebGL2 and not universally available) or on `CLAMP_TO_EDGE` (which would
// stretch the mask's edge color outward instead of producing a hard border),
// so this is the cleanest way to get the right semantics.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform vec2 uInputSize;     // mask dimensions in pixels
uniform vec2 uOutputSize;    // canvas dimensions in pixels
uniform vec2 uOffset;        // top-left pixel offset of input within canvas

out vec4 fragColor;

void main() {
  vec2 px = outFragCoord * uOutputSize;
  vec2 inputUv = (px - uOffset) / uInputSize;
  if (inputUv.x < 0.0 || inputUv.x > 1.0 || inputUv.y < 0.0 || inputUv.y > 1.0) {
    fragColor = vec4(0.0);
  } else {
    fragColor = texture(uInput, inputUv);
  }
}
