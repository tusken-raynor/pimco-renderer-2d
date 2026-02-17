#version 300 es

// Normal map generation shader using Sobel operator
// Generates a normal map from a height map (grayscale) image
// Used in the 'normal' effect for directional lighting

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;
uniform float uTexelSizeX;
uniform float uTexelSizeY;
uniform float uIntensity;  // Controls the strength of the normals (default: 1.0)
// Direction index: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
uniform int uDirection;

out vec4 fragColor;

// Sobel kernels for gradient calculation
const float sobelX[9] = float[9](
  -1.0, 0.0, 1.0,
  -2.0, 0.0, 2.0,
  -1.0, 0.0, 1.0
);

const float sobelY[9] = float[9](
  -1.0, -2.0, -1.0,
   0.0,  0.0,  0.0,
   1.0,  2.0,  1.0
);

float getLuminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
  // Sample 3x3 neighborhood
  float samples[9];
  int idx = 0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x) * uTexelSizeX, float(y) * uTexelSizeY);
      vec4 color = texture(uInput, outFragCoord + offset);
      samples[idx] = getLuminance(color.rgb);
      idx++;
    }
  }

  // Calculate gradients using Sobel operator
  float gx = 0.0;
  float gy = 0.0;
  for (int i = 0; i < 9; i++) {
    gx += samples[i] * sobelX[i];
    gy += samples[i] * sobelY[i];
  }

  // Apply intensity
  gx *= uIntensity;
  gy *= uIntensity;

  // Apply direction rotation
  // Direction angles: N=0, NE=45, E=90, SE=135, S=180, SW=225, W=270, NW=315
  float angle = float(uDirection) * 0.785398; // PI/4 radians
  float cosA = cos(angle);
  float sinA = sin(angle);
  float rotGx = gx * cosA - gy * sinA;
  float rotGy = gx * sinA + gy * cosA;

  // Convert gradient to normal vector
  // Z component derived from unit normal assumption
  vec3 normal = normalize(vec3(-rotGx, -rotGy, 1.0));

  // Map from [-1, 1] to [0, 1] range for RGB output
  vec3 normalColor = normal * 0.5 + 0.5;

  fragColor = vec4(normalColor, 1.0);
}
