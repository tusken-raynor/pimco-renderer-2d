#version 300 es

precision highp float;

in vec2 outFragCoord;

uniform sampler2D uInputTex;
uniform vec2 uInputResolution;
uniform vec2 uOutputResolution;

out vec4 fragColor;

void main() {
  // Box filter: average all input pixels that fall within this output pixel's box

  // How many input pixels does each output pixel cover?
  vec2 scale = uInputResolution / uOutputResolution;

  // Map this fragment to input pixel space
  // outFragCoord is 0-1, so multiply by input resolution to get input pixel position
  vec2 inputPos = outFragCoord * uInputResolution;

  // The box for this output pixel spans from inputPos to inputPos + scale
  // But we want it centered, so offset by half the scale
  vec2 boxMin = inputPos - scale * 0.5;
  vec2 boxMax = inputPos + scale * 0.5;

  // Integer pixel bounds to iterate over
  int x0 = int(floor(boxMin.x));
  int y0 = int(floor(boxMin.y));
  int x1 = int(ceil(boxMax.x));
  int y1 = int(ceil(boxMax.y));

  // Clamp to texture bounds
  x0 = max(0, x0);
  y0 = max(0, y0);
  x1 = min(int(uInputResolution.x), x1);
  y1 = min(int(uInputResolution.y), y1);

  vec3 colorSum = vec3(0.0);
  float alphaSum = 0.0;
  float alphaWeightSum = 0.0;
  float areaSum = 0.0;

  for (int y = y0; y < y1; y++) {
    for (int x = x0; x < x1; x++) {
      // Each input pixel occupies [x, x+1] x [y, y+1]
      // Calculate how much of this pixel overlaps with our box
      float left = max(boxMin.x, float(x));
      float right = min(boxMax.x, float(x + 1));
      float bottom = max(boxMin.y, float(y));
      float top = min(boxMax.y, float(y + 1));

      float overlapX = max(0.0, right - left);
      float overlapY = max(0.0, top - bottom);
      float areaWeight = overlapX * overlapY;

      if (areaWeight > 0.0) {
        // Sample this input pixel at its center
        vec2 texCoord = (vec2(float(x), float(y)) + 0.5) / uInputResolution;
        vec4 pixel = texture(uInputTex, texCoord);

        // Weight RGB by both area and alpha
        float alphaWeight = areaWeight * pixel.a;
        colorSum += pixel.rgb * alphaWeight;
        alphaWeightSum += alphaWeight;

        // Weight alpha by area only
        alphaSum += pixel.a * areaWeight;
        areaSum += areaWeight;
      }
    }
  }

  if (areaSum > 0.0) {
    float outAlpha = alphaSum / areaSum;
    vec3 outColor = alphaWeightSum > 0.0 ? colorSum / alphaWeightSum : vec3(0.0);
    fragColor = vec4(outColor, outAlpha);
  } else {
    fragColor = texture(uInputTex, outFragCoord);
  }
}
