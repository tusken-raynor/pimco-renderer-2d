import { deserializeSobj } from "@/wasm";

export class Model3D {
  meshes: Record<string, MeshData>;

  constructor(file: string) {
    this.meshes = parseWavefrontObjectFile(file);
  }
}

export interface MeshData {
  vb: Float32Array;
  nb: Float32Array;
  tb: Float32Array;
  vib: Uint16Array;
  nib: Uint16Array;
  tib: Uint16Array;
}

export async function loadObjFile(file: string): Promise<Model3D | null> {
  try {
    const fileURL = new URL(file, location.origin);
    let extension = fileURL.pathname.split('.').pop() || "";
    if (!extension) {
      return null;
    }
    if (extension === 'obj') {
      const contents = await fetch(file).then(res => res.text());
      return new Model3D(contents);
    } else if (extension === 'sobj') {
      const buffer = await fetch(file).then(res => res.arrayBuffer());
      const contents = deserializeSobj(new Uint8Array(buffer));
      console.log(contents);
      return new Model3D(contents);
    }
    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function parseWavefrontObjectFile(contents: string): Record<string, MeshData> {
  const lines = contents.toLowerCase().split('\n');
  let currentGroup = 'default';
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];
  const vertexIndices: number[] = [];
  const normalIndices: number[] = [];
  const texCoordIndices: number[] = [];
  const groups: Record<string, MeshData> = {};

  lines.forEach(line => {
    const tokens = line.trim().split(/\s+/);
    switch (tokens[0]) {
      case 'g':
        // Package up the previous group
        if (currentGroup !== 'default') {
          groups[currentGroup] = {
            vb: new Float32Array(vertices),
            nb: new Float32Array(normals),
            tb: new Float32Array(texCoords),
            vib: new Uint16Array(vertexIndices),
            nib: new Uint16Array(normalIndices),
            tib: new Uint16Array(texCoordIndices)
          };
        }
        currentGroup = tokens.slice(1).join(' ');
        break;
      case 'v':
        vertices.push(...tokens.slice(1).map(parseFloat));
        break;
      case 'vn':
        normals.push(...tokens.slice(1).map(parseFloat));
        break;
      case 'vt':
        texCoords.push(...tokens.slice(1, 3).map((x, i) => i ? 1.0 - parseFloat(x) : parseFloat(x)));
        break;
      case 'f':
        tokens.slice(1).forEach(faceToken => {
            const [vi, ti, ni] = faceToken.split('/').map(t => parseInt(t, 10) - 1);
            vertexIndices.push(vi);
            texCoordIndices.push(ti);
            normalIndices.push(ni);
        });
        break;
      default:
        // Ignore other lines
        break;
    }
  });

  // Package up the last group
  if (currentGroup) {
    groups[currentGroup] = {
      vb: new Float32Array(vertices),
      nb: new Float32Array(normals),
      tb: new Float32Array(texCoords),
      vib: new Uint16Array(vertexIndices),
      nib: new Uint16Array(normalIndices),
      tib: new Uint16Array(texCoordIndices)
    };
  }

  return groups;
}