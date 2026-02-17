#version 300 es

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uLarge;

out vec4 fragColor;

void main() {
  fragColor = texture(uLarge, outFragCoord);
}