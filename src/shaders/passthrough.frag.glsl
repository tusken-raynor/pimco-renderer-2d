#version 300 es

// Passthrough fragment shader.
//
// Samples uInput at the current fragment coord and emits it unchanged. Used
// for materializing GPU texture handles as 2D canvases for inspection — the
// caller binds the handle as uInput and renders this through the
// PASSTHROUGH_VERTEX_SRC vertex shader (no Y flip; see effect-utils.ts) so
// FBO content lands at the canvas's natural orientation.

precision mediump float;

in vec2 outFragCoord;

uniform sampler2D uInput;

out vec4 fragColor;

void main() {
  fragColor = texture(uInput, outFragCoord);
}
