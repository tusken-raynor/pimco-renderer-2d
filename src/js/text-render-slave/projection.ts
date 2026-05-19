/**
 * 3D Mesh Projection — Stage 3 of the text render pipeline.
 *
 * When a text layer's mask carries a `projection` definition, the effect
 * output (a `GPUTextureHandle` produced via `buddy.toFramebuffer`) is bound
 * as the input texture and rendered onto a parsed `.obj` mesh using a small
 * model/view/projection shader chain.
 *
 * Shared GL context: this module uses the SAME `WebGL2RenderingContext` the
 * `WebGLPostProcessor` owns, registered via `initWebGLBuddy`. That keeps the
 * effect's FBO texture in GPU memory across the effect→projection boundary —
 * `setUniforms({ tex: handle })` resolves the handle to its underlying
 * `WebGLTexture` and binds it to a sampler slot without any CPU readback.
 *
 * Coupling to `WebGLPostProcessor` is minimal:
 *   - `newProgram('projection', ...)` once at init, so `setUniforms` later
 *     resolves uniform locations against our projection program.
 *   - `useProgram('projection')` per call to switch GL state to our program.
 *   - `setUniforms({ tex: handle })` per call — the only handle-binding path.
 * Matrices and scalar uniforms are set directly via `gl.uniform*` so they
 * don't pollute the post-processor's `uniformCPUState` cache (which would
 * cause spurious cross-program rebinds via `bindDataForNewProgram`).
 *
 * State management: every WebGL state we mutate is saved before the draw and
 * restored after, so the next effect call starts from the post-processor's
 * baseline (no DEPTH_TEST, no CULL_FACE, BLEND off, quadVAO bound, viewport
 * matching the canvas).
 */

import { mat4 } from 'gl-matrix';
import { Uniforms, type GPUTextureHandle } from 'webgl-postprocessor';

import type { PimcoMaskSubstitutionProjection } from '../types/pimco';
import { getSharedGL, getSharedGLCanvas, myWebGLBuddy } from '../effects';

import projectionVertSrc from '@/shaders/projection.vert.glsl?raw';
import projectionFragSrc from '@/shaders/projection.frag.glsl?raw';

const PROJECTION_PROGRAM = 'pimco_projection';

/**
 * Cached attribute and uniform locations for the projection program. Locations
 * are constant for the lifetime of the program (it's never relinked), so we
 * fetch once at init and reuse forever.
 */
interface ProjectionLocations {
  posLoc: number;
  uvLoc: number;
  modelMatLoc: WebGLUniformLocation;
  viewMatLoc: WebGLUniformLocation;
  projMatLoc: WebGLUniformLocation;
  uvOriginLoc: WebGLUniformLocation;
  uvRatioLoc: WebGLUniformLocation;
  uvAutoXLoc: WebGLUniformLocation;
  uvAutoYLoc: WebGLUniformLocation;
}

let locations: ProjectionLocations | null = null;

/**
 * The GL context the cached `locations`, `aniso`, and `meshResources` belong
 * to. When `initProjection` sees the buddy's `gl` differ from this, the buddy
 * was destroyed and rebuilt (e.g., RenderMaster reset) — all three caches
 * reference the dead context and must be cleared before re-init. The dead
 * context's GPU resources go with it, so we drop the map without deleting.
 */
let cachedGL: WebGL2RenderingContext | null = null;

/**
 * Cached `EXT_texture_filter_anisotropic` extension state. Probed once at
 * `initProjection`. When the extension is unavailable (rare on desktop, more
 * common on old mobile), `ext` stays null and the projection falls back to
 * trilinear filtering (`LINEAR_MIPMAP_LINEAR`) without anisotropy — still
 * a big improvement over the lib's default `LINEAR` (no mipmaps).
 *
 * Spec note: WebGL2 supports mipmaps and any filter mode on NPOT textures, so
 * the FBO texture's text-fitted dimensions are not a problem.
 */
interface AnisoState {
  enumValue: number; // ext.TEXTURE_MAX_ANISOTROPY_EXT
  level: number; // clamped(maxAniso, 16)
}
let aniso: AnisoState | null = null;

/**
 * Per-mesh GPU resources (VBO + VAO). Cached by the mesh asset ID so the
 * same mesh used across many text layers / many renders only uploads once.
 */
interface MeshGpuResources {
  vbo: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  /** Number of vertices in the buffer (for the drawArrays count). */
  vertexCount: number;
}

const meshResources: Map<number, MeshGpuResources> = new Map();

// Reused mat4 instances — avoid allocating a fresh Float32Array of length 16
// per projection call.
const modelMatrix = mat4.create();
const viewMatrix = mat4.create();
const projMatrix = mat4.create();

/**
 * Compile and register the projection program with the shared `WebGLPostProcessor`,
 * and cache its attribute/uniform locations. Idempotent.
 *
 * Must be called after `initWebGLBuddy(canvas)` — i.e. after the slave's
 * WebGL2 probe has succeeded and the post-processor singleton has been built
 * against the slave-owned canvas. Returns false if the buddy / GL aren't
 * ready (caller should fall back through no-effect for projection layers).
 */
export function initProjection(): boolean {
  const buddy = myWebGLBuddy();
  const gl = getSharedGL();
  if (!buddy || !gl) return false;

  if (cachedGL && cachedGL !== gl) {
    locations = null;
    aniso = null;
    meshResources.clear();
  }
  cachedGL = gl;

  if (!buddy.hasProgram(PROJECTION_PROGRAM)) {
    buddy.newProgram(PROJECTION_PROGRAM, {
      vertexSrc: projectionVertSrc,
      fragmentSrc: projectionFragSrc,
    });
  }

  if (locations) return true;

  // Use the program briefly so getAttribLocation / getUniformLocation
  // can resolve against it. Caching once is fine — these never change.
  buddy.useProgram(PROJECTION_PROGRAM);
  const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
  if (!program) return false;

  const posLoc = gl.getAttribLocation(program, 'vertexPosition');
  const uvLoc = gl.getAttribLocation(program, 'vertexUV');
  const modelMatLoc = gl.getUniformLocation(program, 'modelMatrix');
  const viewMatLoc = gl.getUniformLocation(program, 'viewMatrix');
  const projMatLoc = gl.getUniformLocation(program, 'projectionMatrix');
  const uvOriginLoc = gl.getUniformLocation(program, 'uUVOrigin');
  const uvRatioLoc = gl.getUniformLocation(program, 'uMeshUVTextureRatio');
  const uvAutoXLoc = gl.getUniformLocation(program, 'uUVAutoX');
  const uvAutoYLoc = gl.getUniformLocation(program, 'uUVAutoY');

  if (
    posLoc < 0 ||
    uvLoc < 0 ||
    !modelMatLoc ||
    !viewMatLoc ||
    !projMatLoc ||
    !uvOriginLoc ||
    !uvRatioLoc ||
    !uvAutoXLoc ||
    !uvAutoYLoc
  ) {
    console.warn('Failed to resolve projection program locations');
    return false;
  }

  locations = {
    posLoc,
    uvLoc,
    modelMatLoc,
    viewMatLoc,
    projMatLoc,
    uvOriginLoc,
    uvRatioLoc,
    uvAutoXLoc,
    uvAutoYLoc,
  };

  // Probe the anisotropic-filtering extension. Skipped silently when the
  // extension isn't available; the per-call path then falls back to trilinear.
  if (!aniso) {
    const ext = gl.getExtension('EXT_texture_filter_anisotropic') as
      | { TEXTURE_MAX_ANISOTROPY_EXT: number; MAX_TEXTURE_MAX_ANISOTROPY_EXT: number }
      | null;
    if (ext) {
      const maxLevel = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
      aniso = {
        enumValue: ext.TEXTURE_MAX_ANISOTROPY_EXT,
        level: Math.min(maxLevel, 16),
      };
    }
  }

  return true;
}

/**
 * Get-or-build VAO+VBO for a mesh. The mesh's interleaved 8-float-per-vertex
 * buffer is uploaded once and the VAO captures the attribute layout (positions
 * at offset 0, UVs at offset 6 floats). On cache hit this is a single map
 * lookup.
 */
function ensureMeshResources(
  gl: WebGL2RenderingContext,
  meshAssetId: number,
  meshBuffer: Float32Array,
  loc: ProjectionLocations
): MeshGpuResources | null {
  const cached = meshResources.get(meshAssetId);
  if (cached) return cached;

  const vbo = gl.createBuffer();
  const vao = gl.createVertexArray();
  if (!vbo || !vao) return null;

  // Save bindings we'll touch.
  const prevVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
  const prevArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, meshBuffer, gl.STATIC_DRAW);

  const stride = 8 * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(loc.posLoc);
  gl.vertexAttribPointer(loc.posLoc, 3, gl.FLOAT, false, stride, 0);

  gl.enableVertexAttribArray(loc.uvLoc);
  // UV starts after position(3) + normal(3) = 6 floats.
  gl.vertexAttribPointer(
    loc.uvLoc,
    2,
    gl.FLOAT,
    false,
    stride,
    6 * Float32Array.BYTES_PER_ELEMENT
  );

  // Restore bindings — leave the post-processor's quadVAO + array buffer
  // expectations intact for whatever runs next.
  gl.bindVertexArray(prevVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, prevArrayBuffer);

  const resources: MeshGpuResources = {
    vbo,
    vao,
    vertexCount: meshBuffer.length / 8,
  };
  meshResources.set(meshAssetId, resources);
  return resources;
}

/**
 * Project the effect-output texture onto the configured 3D mesh and copy the
 * result onto the slave's 2D output canvas.
 *
 * @param targetCtx - Slave's 2D output context (the projection result is
 *   `drawImage`'d into this — the only readback in the chain).
 * @param sourceHandle - Effect output as a `GPUTextureHandle`. Sampled by the
 *   projection fragment shader as `tex`. NOT consumed by this function;
 *   ownership stays with the caller.
 * @param meshAssetId - The mesh asset's ID. Used to key the per-mesh VAO/VBO
 *   cache so subsequent calls with the same mesh skip the VBO upload.
 * @param meshBuffer - Parsed interleaved 8-float-per-vertex buffer (output of
 *   `parseObj`). Only used on cache miss for the given `meshAssetId`.
 * @param projection - The pimco `mask.projection` definition.
 * @param width - Output width (in target pixels).
 * @param height - Output height.
 */
export function applyProjection(
  targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sourceHandle: GPUTextureHandle,
  meshAssetId: number,
  meshBuffer: Float32Array,
  projection: PimcoMaskSubstitutionProjection,
  width: number,
  height: number
): void {
  const buddy = myWebGLBuddy();
  const gl = getSharedGL();
  const canvas = getSharedGLCanvas();
  if (!buddy || !gl || !canvas) {
    throw new Error('applyProjection called before initWebGLBuddy / initProjection');
  }
  if (!locations) {
    throw new Error('applyProjection called before initProjection');
  }
  const loc = locations;

  // ---- Save state we'll mutate, so the next effect / draw sees the
  //      post-processor's expected baseline.
  const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
  const prevVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
  const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
  const prevCullFace = gl.isEnabled(gl.CULL_FACE);
  const prevBlend = gl.isEnabled(gl.BLEND);
  const prevBlendSrcRGB = gl.getParameter(gl.BLEND_SRC_RGB) as number;
  const prevBlendDstRGB = gl.getParameter(gl.BLEND_DST_RGB) as number;
  const prevBlendSrcA = gl.getParameter(gl.BLEND_SRC_ALPHA) as number;
  const prevBlendDstA = gl.getParameter(gl.BLEND_DST_ALPHA) as number;
  const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
  const prevCanvasW = canvas.width;
  const prevCanvasH = canvas.height;

  try {
    // ---- 1. Switch program. `bindDataForNewProgram` (run by the post-processor
    //      inside useProgram) will harmlessly unbind any prior effect samplers
    //      whose names don't exist in our projection program.
    buddy.useProgram(PROJECTION_PROGRAM);

    // ---- 2. Bind the GPUTextureHandle to our `tex` sampler. This is the ONLY
    //      post-processor method we use per-call — it's the only path to the
    //      handle's underlying WebGLTexture (the fboTextureHandles map is
    //      private). The handle's useCount goes to 1; cleanup is a final
    //      `unsetTextureUniforms('tex')` in the finally block.
    buddy.setUniforms({
      tex: { type: Uniforms.TEXTURE2D, value: sourceHandle },
    });

    // ---- 2a. Add mipmaps + anisotropic filtering to the FBO texture so
    //      oblique mesh angles don't produce aliasing/shimmering. Relies on
    //      an undocumented post-processor invariant: `setUniforms` for a
    //      sampler ends with the texture bound on the active slot via
    //      `gl.activeTexture(slot) + gl.bindTexture(TEXTURE_2D, tex)`. So the
    //      currently-bound TEXTURE_2D after the call above IS our handle's
    //      WebGLTexture — readable via `getParameter(TEXTURE_BINDING_2D)`.
    //
    //      The lib creates FBO textures with MIN_FILTER=LINEAR (no mipmaps);
    //      we override to LINEAR_MIPMAP_LINEAR + max anisotropy. WebGL2
    //      supports mipmaps and any filter on NPOT textures, so the FBO's
    //      text-fitted dimensions are not a constraint.
    //
    //      Non-persistent FBO textures are recreated each render, so these
    //      param mutations don't accumulate across renders.
    const fboTex = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    if (fboTex) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) {
        gl.texParameteri(gl.TEXTURE_2D, aniso.enumValue, aniso.level);
      }
    }

    // ---- 3. Bind mesh VAO+VBO (created lazily on first use of this mesh).
    const mesh = ensureMeshResources(gl, meshAssetId, meshBuffer, loc);
    if (!mesh) {
      console.warn(`Failed to allocate mesh resources for asset ${String(meshAssetId)}`);
      return;
    }
    gl.bindVertexArray(mesh.vao);

    // ---- 4. Resize shared canvas if needed; set viewport.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    gl.viewport(0, 0, width, height);

    // ---- 5. Compute matrices.
    const camera = projection.camera;
    mat4.lookAt(viewMatrix, [camera[0], camera[1], camera[2]], [0, 0, 0], [0, 1, 0]);

    if (projection.transformation) {
      // 16 floats, row-major in the data — gl-matrix expects column-major,
      // matching the legacy renderer's direct mat4.set call.
      const t = projection.transformation;
      mat4.set(
        modelMatrix,
        t[0], t[1], t[2], t[3],
        t[4], t[5], t[6], t[7],
        t[8], t[9], t[10], t[11],
        t[12], t[13], t[14], t[15]
      );
    } else {
      mat4.identity(modelMatrix);
    }

    if (projection.type === 'orthographic') {
      const r = projection.rect ?? [0, 1, 0, 1];
      mat4.ortho(projMatrix, r[0], r[1], r[2], r[3], 0.1, 100);
    } else {
      const fovDeg = projection.fov ?? 60;
      mat4.perspective(projMatrix, (fovDeg * Math.PI) / 180, width / height, 0.1, 100);
    }

    // ---- 6. Set non-texture uniforms directly via gl, bypassing the
    //      post-processor — keeps these uniforms out of its uniformCPUState
    //      cache (which would cause cross-program rebind attempts on the
    //      next useProgram).
    gl.uniformMatrix4fv(loc.modelMatLoc, false, modelMatrix);
    gl.uniformMatrix4fv(loc.viewMatLoc, false, viewMatrix);
    gl.uniformMatrix4fv(loc.projMatLoc, false, projMatrix);

    if (projection.uvauto) {
      const ratio =
        (projection.uvmeshratio ?? 1) / (sourceHandle.width / sourceHandle.height);
      gl.uniform1f(loc.uvRatioLoc, ratio);
      gl.uniform1f(loc.uvAutoXLoc, projection.uvauto === 'x' ? 1 : 0);
      gl.uniform1f(loc.uvAutoYLoc, projection.uvauto === 'y' ? 1 : 0);
      gl.uniform2f(
        loc.uvOriginLoc,
        projection.uvorigin?.[0] ?? 0,
        projection.uvorigin?.[1] ?? 0
      );
    } else {
      gl.uniform1f(loc.uvRatioLoc, 1);
      gl.uniform1f(loc.uvAutoXLoc, 0);
      gl.uniform1f(loc.uvAutoYLoc, 0);
      gl.uniform2f(loc.uvOriginLoc, 0, 0);
    }

    // ---- 7. GL state for the projection draw.
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ---- 8. Draw.
    gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);

    // ---- 9. Land the GL canvas onto the slave's 2D output canvas. This is
    //      the ONLY readback in the chain (effect output stayed on GPU
    //      throughout). drawImage uses the source canvas's GPU bitmap on
    //      browsers with hardware-accelerated 2D contexts.
    targetCtx.drawImage(canvas as HTMLCanvasElement, 0, 0);
  } finally {
    // ---- 10. Restore state. Ensure cleanup runs even if a step above threw.
    // Release the handle binding so the FBO texture can recycle.
    buddy.unsetTextureUniforms('tex');

    if (prevDepthTest) gl.enable(gl.DEPTH_TEST);
    else gl.disable(gl.DEPTH_TEST);
    if (prevCullFace) gl.enable(gl.CULL_FACE);
    else gl.disable(gl.CULL_FACE);
    if (prevBlend) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
    gl.blendFuncSeparate(prevBlendSrcRGB, prevBlendDstRGB, prevBlendSrcA, prevBlendDstA);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);

    if (canvas.width !== prevCanvasW) canvas.width = prevCanvasW;
    if (canvas.height !== prevCanvasH) canvas.height = prevCanvasH;

    gl.bindVertexArray(prevVAO);
    if (prevProgram !== null) gl.useProgram(prevProgram);
  }
}

/**
 * Release all GPU resources held by the projection module. Call when the
 * slave is destroyed.
 */
export function destroyProjection(): void {
  aniso = null;
  const gl = getSharedGL();
  if (gl) {
    for (const { vbo, vao } of meshResources.values()) {
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    }
  }
  meshResources.clear();
  locations = null;
  cachedGL = null;
}

// Re-export for tests that want to verify the cache is empty / populated
// without touching internals.
export function _meshResourceCacheSize(): number {
  return meshResources.size;
}
