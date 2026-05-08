#version 300 es

// Normal-effect compose shader.
//
// Reads the height map produced by `normal-height.frag.glsl` (computed at
// expanded canvas dims with roundness padding) plus the rounded mask, runs a
// Sobel gradient + light-direction rotation per fragment, converts the
// gradient into a normal vector packed as RGB, and gates the alpha channel
// by the rounded mask so pixels outside the text region are transparent in
// the final canvas.
//
// Output canvas runs at the **mask's original dimensions** (the roundness
// padding is consumed internally for clean Sobel sampling at edges); the
// shader maps each output fragment's UV into the expanded source FBOs via
// `(outFragCoord · uMaskSize + uOffset) / uExpandedSize`. Texel offsets for
// the 3×3 Sobel neighborhood are sized to the *expanded* FBO so each tap
// hits a single source pixel.
//
// Direction index: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW (45° steps).

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uHeightMap;     // expanded dims; grayscale
uniform sampler2D uMask;          // expanded dims; .r alpha
uniform vec2 uTexelSize;          // 1 / expanded_size — one source pixel
uniform vec2 uMaskSize;           // mask original dims (== output canvas)
uniform vec2 uExpandedSize;       // expanded dims of the source FBOs
uniform vec2 uOffset;             // mask offset within expanded source
uniform float uIntensity;         // gradient strength multiplier
uniform int uDirection;           // 0..7 cardinal/intercardinal

out vec4 fragColor;

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

float getLuminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  // Map output (mask dims) UV into the expanded source FBO's UV.
  vec2 expandedUv = (outFragCoord * uMaskSize + uOffset) / uExpandedSize;

  // Sample 3×3 height neighborhood at expanded texel size.
  float samples[9];
  int idx = 0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y)) * uTexelSize;
      vec4 c = texture(uHeightMap, expandedUv + off);
      samples[idx] = getLuminance(c.rgb);
      idx++;
    }
  }

  float gx = 0.0;
  float gy = 0.0;
  for (int i = 0; i < 9; i++) {
    gx += samples[i] * sobelX[i];
    gy += samples[i] * sobelY[i];
  }

  gx *= uIntensity;
  gy *= uIntensity;

  float angle = float(uDirection) * 0.785398;  // π/4 radians
  float cosA = cos(angle);
  float sinA = sin(angle);
  float rotGx = gx * cosA - gy * sinA;
  float rotGy = gx * sinA + gy * cosA;

  vec3 normal = normalize(vec3(-rotGx, -rotGy, 1.0));
  vec3 normalColor = normal * 0.5 + 0.5;

  float maskA = texture(uMask, expandedUv).r;
  fragColor = vec4(normalColor, maskA);
}
