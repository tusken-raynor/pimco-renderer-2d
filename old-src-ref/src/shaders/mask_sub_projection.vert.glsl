#version 300 es
precision mediump float;
precision mediump int;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

uniform vec2 uUVOrigin;
uniform float uMeshUVTextureRatio;
uniform float uUVAutoX;
uniform float uUVAutoY;

in vec3 vertexPosition;
// in vec3 vertexNormal;
in vec2 vertexUV;

out vec2 fragUV;
// out vec3 fragNormal;
// out vec3 fragPos;

void main() {
  fragUV = vertexUV;
  // fragNormal = vertexNormal;
  // fragPos = vertexPosition;


  fragUV.x -= uUVOrigin.x;
  fragUV.x *= mix(1.0, uUVAutoX * uMeshUVTextureRatio, uUVAutoX);
  fragUV.x += uUVOrigin.x;
  
  fragUV.y -= uUVOrigin.y;
  fragUV.y *= mix(1.0, uUVAutoY / uMeshUVTextureRatio, uUVAutoY);
  fragUV.y += uUVOrigin.y;

  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(vertexPosition, 1.0);
}