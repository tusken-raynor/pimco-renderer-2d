/**
 * Mesh parsing for 3D projection.
 *
 * The asset manager fetches `.obj` files as `ArrayBuffer`. Slaves call
 * `parseObj` once per mesh asset to convert that buffer into the interleaved
 * vertex attribute buffer format the projection shader expects:
 *
 *   [px, py, pz, nx, ny, nz, u, v]   per vertex, stride 8 floats
 *
 * Parsing happens on the slave so the parsed `Float32Array` can be cached
 * directly by mesh asset ID and uploaded as a VBO without further work.
 *
 * Only Wavefront `.obj` is supported. The legacy renderer also handled `.sobj`
 * (a custom binary format) via a WASM module that isn't present in this
 * codebase, so that branch is dropped.
 *
 * Multi-group `.obj` files use the first group only (matches legacy).
 */

/** Per-group face index lists. Vertex/normal/UV pools are shared across groups. */
interface ParsedObjGroup {
  positionIndices: number[];
  normalIndices: number[];
  texCoordIndices: number[];
}

function newGroup(): ParsedObjGroup {
  return {
    positionIndices: [],
    normalIndices: [],
    texCoordIndices: [],
  };
}

/**
 * Parse Wavefront `.obj` text into the interleaved 8-float-per-vertex buffer
 * the projection shader expects. Returns null on parse failure or empty mesh.
 *
 * Mirrors the legacy `parseWavefrontObjectFile` + vertex-packing loop:
 *   - `v x y z`        → push position triple (global pool)
 *   - `vn x y z`       → push normal triple (global pool)
 *   - `vt u v`         → push uv pair (V is flipped: legacy stored `1 - v` to
 *                       match GL's bottom-up texture coordinate space)
 *   - `f a/b/c d/e/f g/h/i`  → triangulate face into position/uv/normal indices.
 *                       Indices are 1-indexed and reference the global pools,
 *                       not per-group lists.
 *   - `g <name>`       → start a new group. Only face indices are bucketed
 *                       per-group; only the first non-empty group is emitted.
 *
 * Lines starting with anything else (`#`, `o`, `s`, `usemtl`, `mtllib`, blank)
 * are ignored.
 */
export function parseObj(source: string | ArrayBuffer): Float32Array | null {
  const text =
    typeof source === 'string' ? source : new TextDecoder('utf-8').decode(source);

  // Vertex/normal/UV pools are shared across groups — OBJ face indices are
  // file-global, not per-group. Only the face-index buckets are per-group.
  const positions: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];

  let current = newGroup();
  const completed: ParsedObjGroup[] = [];

  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const tokens = line.split(/\s+/);
    const head = tokens[0]?.toLowerCase();

    switch (head) {
      case 'v': {
        if (tokens.length < 4) return null;
        for (let i = 1; i <= 3; i++) {
          const v = parseFloat(tokens[i]);
          if (Number.isNaN(v)) return null;
          positions.push(v);
        }
        break;
      }
      case 'vn': {
        if (tokens.length < 4) return null;
        for (let i = 1; i <= 3; i++) {
          const v = parseFloat(tokens[i]);
          if (Number.isNaN(v)) return null;
          normals.push(v);
        }
        break;
      }
      case 'vt': {
        if (tokens.length < 3) return null;
        const u = parseFloat(tokens[1]);
        const v = parseFloat(tokens[2]);
        if (Number.isNaN(u) || Number.isNaN(v)) return null;
        // Flip V to match legacy storage (1 - v).
        texCoords.push(u, 1 - v);
        break;
      }
      case 'f': {
        // Each face token is `vi/ti/ni` (1-indexed). Quads/n-gons fan-triangulate.
        const verts = tokens.slice(1);
        if (verts.length < 3) return null;
        const parsed: { v: number; t: number; n: number }[] = [];
        for (const tok of verts) {
          const parts = tok.split('/');
          // 1-indexed → 0-indexed; missing components yield NaN, kept as -1
          // so the packer can substitute 0 fields (e.g. .obj without normals).
          const vi = parseInt(parts[0] ?? '', 10) - 1;
          const ti = parseInt(parts[1] ?? '', 10) - 1;
          const ni = parseInt(parts[2] ?? '', 10) - 1;
          if (Number.isNaN(vi)) return null;
          parsed.push({
            v: vi,
            t: Number.isNaN(ti) ? -1 : ti,
            n: Number.isNaN(ni) ? -1 : ni,
          });
        }
        // Fan-triangulate (v0, vN, vN+1) for N = 1..count-2.
        for (let i = 1; i < parsed.length - 1; i++) {
          const a = parsed[0];
          const b = parsed[i];
          const c = parsed[i + 1];
          current.positionIndices.push(a.v, b.v, c.v);
          current.texCoordIndices.push(a.t, b.t, c.t);
          current.normalIndices.push(a.n, b.n, c.n);
        }
        break;
      }
      case 'g': {
        // Commit the active bucket if it has faces, then start a new one.
        if (current.positionIndices.length > 0) {
          completed.push(current);
        }
        current = newGroup();
        break;
      }
      // 'o', 's', 'usemtl', 'mtllib', etc — ignored.
      default:
        break;
    }
  }
  // Commit the final group if it has data.
  if (current.positionIndices.length > 0) {
    completed.push(current);
  }

  // Pick the first non-empty group (matches legacy: `Object.values(meshes)[0]`).
  const mesh = completed.find((g) => g.positionIndices.length > 0);
  if (!mesh) return null;

  return packInterleavedVertexBuffer(mesh, positions, normals, texCoords);
}

/**
 * Build the interleaved [px,py,pz, nx,ny,nz, u,v] buffer from a parsed group's
 * face indices and the file-global vertex/normal/UV pools. One output vertex
 * per face vertex (no welding) — matches the legacy packer at
 * `applyWithProjection` lines 1526-1541.
 *
 * Missing UVs / normals (index === -1) are substituted with zeros, so an `.obj`
 * without `vn` or `vt` lines still produces a valid 8-float-stride buffer.
 */
function packInterleavedVertexBuffer(
  g: ParsedObjGroup,
  positions: number[],
  normals: number[],
  texCoords: number[]
): Float32Array {
  const count = g.positionIndices.length;
  const out = new Float32Array(count * 8);

  for (let i = 0; i < count; i++) {
    const posIdx = g.positionIndices[i] * 3;
    const normIdx = g.normalIndices[i] * 3;
    const uvIdx = g.texCoordIndices[i] * 2;

    out[i * 8 + 0] = positions[posIdx] ?? 0;
    out[i * 8 + 1] = positions[posIdx + 1] ?? 0;
    out[i * 8 + 2] = positions[posIdx + 2] ?? 0;

    if (g.normalIndices[i] >= 0) {
      out[i * 8 + 3] = normals[normIdx] ?? 0;
      out[i * 8 + 4] = normals[normIdx + 1] ?? 0;
      out[i * 8 + 5] = normals[normIdx + 2] ?? 0;
    }
    // else leave zeros — projection shader doesn't sample normals currently.

    if (g.texCoordIndices[i] >= 0) {
      out[i * 8 + 6] = texCoords[uvIdx] ?? 0;
      out[i * 8 + 7] = texCoords[uvIdx + 1] ?? 0;
    }
  }

  return out;
}
