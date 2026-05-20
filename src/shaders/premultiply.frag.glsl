#version 300 es

// Premultiply fragment shader.
//
// Reads a straight-alpha texel (color, a) and writes the premultiplied form
// (color*a, a). Used as a pre-pass before projection so that linear filtering
// and mipmap downsampling produce correct edge values — without
// premultiplication, averaging an opaque text pixel (color, 1) with a
// transparent neighbour (0, 0, 0, 0) drags the RGB toward black and creates
// a dark halo around the text.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;

out vec4 fragColor;

void main() {
  vec4 c = texture(uInput, outFragCoord);
  fragColor = vec4(c.rgb * c.a, c.a);
}
