#version 300 es

// Default passthrough vertex shader for 2D effects
// Transforms normalized device coordinates and passes texture coordinates to fragment shader

in vec2 position;
in vec2 texCoord;

out vec2 outFragCoord;

void main() {
  outFragCoord = texCoord;
  gl_Position = vec4(position, 0.0, 1.0);
}
