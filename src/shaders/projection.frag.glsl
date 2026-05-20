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

  // `tex` is premultiplied (applyProjection runs a premultiply pre-pass before
  // binding it here — see projection.ts step 0). Filtering and mipmap downsample
  // happened in premultiplied space, so the sampled RGB is correct at edges.
  // Un-premultiply for output because the GL canvas storage is
  // premultipliedAlpha:false; without this step, drawImage would treat the
  // premultiplied RGB as straight and over-bright the colours.
  vec4 sampled = texture(tex, fragUV) * inside;
  if (sampled.a > 0.0) {
    sampled.rgb /= sampled.a;
  }
  outputColor = sampled;
}