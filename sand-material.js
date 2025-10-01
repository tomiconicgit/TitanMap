// file: sand-material.js
import * as THREE from 'three';

// ---- knobs you can tweak ----
const SAND_WIND_DIR = Math.PI * 0.25; // radians
const SAND_REPEAT   = 0.35;           // repeats per world unit (smaller => larger dunes)
const NORMAL_SIZE   = 512;            // power-of-two

// lightweight hash-based fbm (deterministic, no external deps)
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function valueNoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi,       yf = y - yi;
  const u = xf*xf*(3 - 2*xf);
  const v = yf*yf*(3 - 2*yf);

  const a = hash2(xi,     yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi,     yi + 1);
  const d = hash2(xi + 1, yi + 1);

  const i1 = a + (b - a) * u;
  const i2 = c + (d - c) * u;
  return i1 + (i2 - i1) * v;
}
function fbm2(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let amp = 0.5, freq = 1.0, sum = 0.0, norm = 0.0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / Math.max(1e-6, norm);
}

// sRGB albedo with directional dunes
function generateSandAlbedo(size = 256, windAngle = SAND_WIND_DIR) {
  const data = new Uint8Array(size * size * 3);
  const baseA = new THREE.Color(0xE0C79C); // light
  const baseB = new THREE.Color(0xC9B084); // dark

  const cosA = Math.cos(windAngle);
  const sinA = Math.sin(windAngle);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      const dx = nx * cosA + ny * sinA;
      const dy = -nx * sinA + ny * cosA;

      const dunes   = fbm2(dx * 8.0,  dy * 2.5, 5, 2.0, 0.5);
      const ripples = fbm2(dx * 40.0, dy * 10.0, 3, 2.5, 0.55);
      const grains  = fbm2(nx * 120.0, ny * 120.0, 2, 2.0, 0.6);

      let tone = dunes * 0.55 + ripples * 0.35 + grains * 0.10;
      tone = Math.min(1, Math.max(0, (tone - 0.35) * 1.25 + 0.5));

      const col = baseB.clone().lerp(baseA, tone);
      const idx = (y * size + x) * 3;
      data[idx + 0] = Math.round(col.r * 255);
      data[idx + 1] = Math.round(col.g * 255);
      data[idx + 2] = Math.round(col.b * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace; // IMPORTANT or it can look wrong/black
  tex.needsUpdate = true;
  return tex;
}

// Linear-space normal map derived from synthetic height
function generateSandNormalMap(size = NORMAL_SIZE, windAngle = SAND_WIND_DIR) {
  const data = new Uint8Array(size * size * 4);
  const cosA = Math.cos(windAngle);
  const sinA = Math.sin(windAngle);

  const h = (xx, yy) => {
    const dx = xx * cosA + yy * sinA;
    const dy = -xx * sinA + yy * cosA;
    const dunes   = fbm2(dx * 8.0,  dy * 2.5, 5, 2.0, 0.5);
    const ripples = fbm2(dx * 40.0, dy * 10.0, 3, 2.5, 0.55);
    const micro   = fbm2(xx * 90.0, yy * 90.0, 2, 2.0, 0.65);
    return dunes * 0.7 + ripples * 0.25 + micro * 0.05; // 0..1
  };

  const s = 1.0 / size;
  const strength = 2.0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      const hL = h(nx - s, ny);
      const hR = h(nx + s, ny);
      const hD = h(nx, ny - s);
      const hU = h(nx, ny + s);

      const dx = (hR - hL) * strength;
      const dy = (hU - hD) * strength;

      const n = new THREE.Vector3(-dx, -dy, 1.0).normalize();
      const idx = (y * size + x) * 4;
      data[idx + 0] = Math.round((n.x * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // keep in linear color space
  tex.needsUpdate = true;
  return tex;
}

// Exported sand material (shared)
export const SAND_ALBEDO = generateSandAlbedo(256, SAND_WIND_DIR);
export const SAND_NORMAL = generateSandNormalMap(NORMAL_SIZE, SAND_WIND_DIR);

export const SAND_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,               // albedo map provides color
  map: SAND_ALBEDO,
  normalMap: SAND_NORMAL,
  normalScale: new THREE.Vector2(1.0, 1.0),
  roughness: 0.92,
  metalness: 0.0
});

// World-space UVs so adjacent tiles share one continuous dune field.
export function setWorldSpaceUVs(geometry, worldCenter, repeat = SAND_REPEAT) {
  // PlaneGeometry is in XY; after x-rotation, XY -> XZ in world
  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const u = (worldCenter.x + lx) * repeat;
    const v = (worldCenter.z + ly) * repeat;
    uvs[i * 2 + 0] = u;
    uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}