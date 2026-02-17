#version 300 es

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform int uStart;
uniform int uEnd;
uniform float uTexelSizeX;
uniform float uTexelSizeY;

out vec4 fragColor;

void main() {
  float xStart = float(uStart) * uTexelSizeX + outFragCoord.x;
  float yStart = float(uStart) * uTexelSizeY + outFragCoord.y;
  float x = xStart;
  float y = yStart;
  float alpha = 1.0;

  for (int i = uStart; i <= uEnd; i++) {
    for (int j = uStart; j <= uEnd; j++) {
      vec2 texCoord = vec2(x, y);
      vec4 color = texture(uInput, texCoord);
      alpha = min(color.a, alpha);
      x += uTexelSizeX;
    }
    x = xStart;
    y += uTexelSizeY;
  }

  vec4 color = texture(uInput, outFragCoord);
  fragColor = vec4(color.rgb, alpha);
}