#version 300 es
precision mediump float;
precision mediump int;

in vec2 fragUV;
// in vec3 fragNormal;
// in vec3 fragPos;

uniform sampler2D tex;

out vec4 outputColor;

void main() {
  // If the fragUV is outside the bounds 0,0 to 1,1, make the fragment transparent
  float insideX = step(0.0, fragUV.x) * step(fragUV.x, 1.0);
  float insideY = step(0.0, fragUV.y) * step(fragUV.y, 1.0);
  float inside = insideX * insideY; // 1.0 if inside both, 0.0 otherwise
  
  outputColor = texture(tex, fragUV);
  outputColor *= inside;
}