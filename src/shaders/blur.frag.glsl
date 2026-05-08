#version 300 es

// Separable Gaussian blur shader.
//
// Run twice per blur application (horizontal then vertical) by toggling uAxis between
// (1, 0) and (0, 1). Weights are pre-computed CPU-side and uploaded as a flat array
// via the lib's FLOAT1V uniform path; the shader indexes uWeights[0..uHalfWidth].
//
// The brightness/contrast finalize is applied unconditionally — defaults of
// uBrightness = 1.0, uContrast = 1.0 make it a no-op. Apply on the vertical pass only
// when chaining a Canvas-style filter; for plain blur, leave defaults on both passes.
//
// MAX_HALFWIDTH = 32 supports sigma up to ~10 px, which exceeds anything the existing
// effect pipeline uses. The CPU-side weight buffer must be padded to length
// MAX_HALFWIDTH + 1 (= 33) regardless of the actual halfWidth requested.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform vec2 uTexel;        // (1/width, 1/height)
uniform vec2 uAxis;         // (1, 0) horizontal, (0, 1) vertical
uniform int uHalfWidth;     // taps to one side of center; full kernel = 2*uHalfWidth + 1

const int MAX_HALFWIDTH = 32;
uniform float uWeights[MAX_HALFWIDTH + 1];  // index 0 = center weight

uniform float uBrightness;  // default 1.0 (no change)
uniform float uContrast;    // default 1.0 (no change)

out vec4 fragColor;

void main() {
  vec2 step = uTexel * uAxis;
  vec4 sum = texture(uInput, outFragCoord) * uWeights[0];

  for (int i = 1; i <= MAX_HALFWIDTH; i++) {
    if (i > uHalfWidth) break;
    float w = uWeights[i];
    sum += texture(uInput, outFragCoord + step * float(i)) * w;
    sum += texture(uInput, outFragCoord - step * float(i)) * w;
  }

  // Brightness/contrast finalize. No-op when both uniforms are 1.0.
  vec3 rgb = (sum.rgb - 0.5) * uContrast + 0.5;
  rgb *= uBrightness;
  fragColor = vec4(rgb, sum.a);
}
