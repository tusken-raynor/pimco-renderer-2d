import { describe, it, expect } from 'vitest';
import { parseObj } from './mesh';

// Simple two-triangle quad (z = 0 plane, UVs from 0..1).
//   3---2
//   | / |
//   0---1
const QUAD_OBJ = `
# Two-triangle quad on the z=0 plane.
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 1.0 1.0 0.0
v 0.0 1.0 0.0
vn 0.0 0.0 1.0
vt 0.0 0.0
vt 1.0 0.0
vt 1.0 1.0
vt 0.0 1.0
f 1/1/1 2/2/1 3/3/1
f 1/1/1 3/3/1 4/4/1
`.trim();

describe('parseObj', () => {
  it('returns null on empty input', () => {
    expect(parseObj('')).toBeNull();
  });

  it('returns null when there are no faces', () => {
    expect(parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\n')).toBeNull();
  });

  it('parses a simple triangle into an 8-float-stride buffer', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
vt 0 0
vt 1 0
vt 0 1
f 1/1/1 2/2/1 3/3/1
`.trim();
    const buf = parseObj(obj);
    expect(buf).not.toBeNull();
    expect(buf!.length).toBe(3 * 8);

    // Vertex 0: pos (0,0,0), normal (0,0,1), uv (0, 1-0=1) — V is flipped.
    expect(Array.from(buf!.slice(0, 8))).toEqual([0, 0, 0, 0, 0, 1, 0, 1]);
    // Vertex 1: pos (1,0,0), normal (0,0,1), uv (1, 1)
    expect(Array.from(buf!.slice(8, 16))).toEqual([1, 0, 0, 0, 0, 1, 1, 1]);
    // Vertex 2: pos (0,1,0), normal (0,0,1), uv (0, 0)
    expect(Array.from(buf!.slice(16, 24))).toEqual([0, 1, 0, 0, 0, 1, 0, 0]);
  });

  it('triangulates a quad face into two triangles (6 verts)', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vn 0 0 1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1/1 2/2/1 3/3/1 4/4/1
`.trim();
    const buf = parseObj(obj);
    expect(buf).not.toBeNull();
    // One quad → 2 triangles → 6 vertices → 48 floats.
    expect(buf!.length).toBe(6 * 8);
  });

  it('handles two `f` lines as separate triangles', () => {
    const buf = parseObj(QUAD_OBJ);
    expect(buf).not.toBeNull();
    expect(buf!.length).toBe(6 * 8);
  });

  it('flips V coordinates (legacy convention)', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0.0 0.25
vt 1.0 0.5
vt 0.0 0.75
f 1/1 2/2 3/3
`.trim();
    const buf = parseObj(obj);
    expect(buf).not.toBeNull();
    // vt's V values should be flipped to (1 - v).
    expect(buf![7]).toBeCloseTo(0.75); // 1 - 0.25
    expect(buf![15]).toBeCloseTo(0.5); // 1 - 0.5
    expect(buf![23]).toBeCloseTo(0.25); // 1 - 0.75
  });

  it('substitutes zeros for missing UVs', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
f 1//1 2//1 3//1
`.trim();
    const buf = parseObj(obj);
    expect(buf).not.toBeNull();
    // UV pair at indices 6,7 of each vertex should be (0, 0).
    expect(buf![6]).toBe(0);
    expect(buf![7]).toBe(0);
    expect(buf![14]).toBe(0);
    expect(buf![15]).toBe(0);
  });

  it('substitutes zeros for missing normals', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
f 1/1 2/2 3/3
`.trim();
    const buf = parseObj(obj);
    expect(buf).not.toBeNull();
    // Normals at indices 3,4,5 should all be 0.
    expect(buf![3]).toBe(0);
    expect(buf![4]).toBe(0);
    expect(buf![5]).toBe(0);
  });

  it('uses the first non-empty group when multiple are present', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
vt 0 0
vt 1 0
vt 0 1
g first
f 1/1/1 2/2/1 3/3/1
g second
f 1/1/1 3/3/1 2/2/1
`.trim();
    const buf = parseObj(obj);
    expect(buf).not.toBeNull();
    // First group: only one triangle (3 verts × 8 floats = 24).
    expect(buf!.length).toBe(3 * 8);
    // Vertex 1 should be (1,0,0) — confirms we picked `first`, not `second`.
    expect(Array.from(buf!.slice(8, 11))).toEqual([1, 0, 0]);
  });

  it('accepts an ArrayBuffer as input', () => {
    const text = QUAD_OBJ;
    const encoder = new TextEncoder();
    const ab = encoder.encode(text).buffer as ArrayBuffer;
    const buf = parseObj(ab);
    expect(buf).not.toBeNull();
    expect(buf!.length).toBe(6 * 8);
  });

  it('ignores comments and unrelated directives', () => {
    const obj = `
# A comment
o myObject
mtllib foo.mtl
usemtl bar
s off
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
vt 0 0
vt 1 0
vt 0 1
f 1/1/1 2/2/1 3/3/1
`.trim();
    const buf = parseObj(obj);
    expect(buf).not.toBeNull();
    expect(buf!.length).toBe(3 * 8);
  });

  it('returns null on malformed vertex line', () => {
    const obj = `
v 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`.trim();
    expect(parseObj(obj)).toBeNull();
  });
});
