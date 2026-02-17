#version 300 es

// Color scaling/tinting shader
// Adjusts color intensity around a neutral gray (128)
// Used in normal effect for directional lighting adjustment

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform float uIntensity;  // Scale factor (1.0 = no change, >1 = more contrast, <1 = less)

out vec4 fragColor;

void main() {
  vec4 color = texture(uInput, outFragCoord);

  // Scale RGB values around neutral gray (0.5 in normalized space)
  // Formula: newValue = (value - 0.5) * intensity + 0.5
  vec3 scaled = (color.rgb - 0.5) * uIntensity + 0.5;

  // Clamp to valid range
  scaled = clamp(scaled, 0.0, 1.0);

  fragColor = vec4(scaled, color.a);
}
