#version 300 es

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput1;
uniform sampler2D uInput2;
uniform float uProgress;

out vec4 fragColor;

// Stipple matrix pattern
const float pattern[16] = float[16](
  0.4375, 0.75, 0.25, 0.875, 
  0.6875, 0.125, 0.5625, 0.0625, 
  0.3125, 0.9375, 0.375, 0.8125, 
  0.5, 0.0, 0.625, 0.1875
);

float sampleStipple(float alpha) {
  // Get fragment screen coordinates
  ivec2 screenCoord = ivec2(gl_FragCoord.xy);
  
  // Get position in the 4x4 pattern
  int x = screenCoord.x & 3;
  int y = screenCoord.y & 3;

  // Get the index in the 4x4 pattern
  int index = (y << 2) + x;
  
  // Get threshold from pattern
  float threshold = pattern[index];
  
  // Set the color's alpha by using the uAlpha uniform as the edge
  return step(1.0 - alpha, threshold);
}

void main() {
  vec4 color1 = texture(uInput1, outFragCoord);
  vec4 color2 = texture(uInput2, outFragCoord);

  // // Un-premultiply colors
  // float alphaIsZero1 = step(color1.a, 0.0);
  // float alphaIsZero2 = step(color2.a, 0.0);
  // vec3 unpremultiplied1 = color1.rgb / mix(color1.a, 1.0, alphaIsZero1);
  // vec3 unpremultiplied2 = color2.rgb / mix(color2.a, 1.0, alphaIsZero2);
  // vec3 rgb1 = mix(unpremultiplied1, unpremultiplied2, alphaIsZero1);
  // vec3 rgb2 = mix(unpremultiplied2, unpremultiplied1, alphaIsZero2);

  // // Premultiply after mixing
  // vec3 finalRGB = mix(rgb1, rgb2, uProgress);
  // float finalAlpha = mix(color1.a, color2.a, uProgress);

  // fragColor = vec4(finalRGB * finalAlpha, finalAlpha);

  // float stippleAlpha = sampleStipple(uProgress);
  // float mixedAlpha = mix(uProgress, stippleAlpha, 0.3);
  // fragColor = mix(color1, color2, mixedAlpha);

  // float colorDist = distance(color1, color2) / sqrt(3.0) * 0.7;

  // Blend alpha separately
  float alpha = mix(color1.a, color2.a, uProgress);
  // float stippleAlpha = mix(sampleStipple(uProgress), uProgress, colorDist);

  // fragColor = mix(color1, color2, alpha);
  
  // For RGB, only consider colors from pixels that have alpha
  // This is an attempt to remove branches in the shader
  // float x = color1.a;
  // float y = color2.a;
  // // Determine whether to use just color1's color value or just color2's color value (one-or-the-other)
  // float useColor2 = step(y, y - x) * (1.0 - step(y, 0.0));
  // vec3 oneOrTheOther = mix(color1.rgb, color2.rgb, useColor2);
  // // Determine whether to use the oneOrTheOther color or to blend normally
  // float useNormalBlend = 1.0 - step(x, x - y) * (1.0 - step(x, 0.0));
  // vec3 finalRGB = mix(oneOrTheOther, mix(color1.rgb, color2.rgb, uProgress), useNormalBlend);
  
  // fragColor = vec4(finalRGB, alpha);


  // For RGB, only consider colors from pixels that have alpha
  vec3 rgb;
  if (color1.a == 0.0 && color2.a > 0.0) {
    // Fading in from transparent - use color2's RGB directly
    rgb = color2.rgb;
  } else if (color2.a == 0.0 && color1.a > 0.0) {
    // Fading out to transparent - use color1's RGB directly
    rgb = color1.rgb;
  } else {
    // Both have color - blend normally
    rgb = mix(color1.rgb, color2.rgb, uProgress);
  }
  
  fragColor = vec4(rgb, alpha);
}