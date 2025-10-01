// file: textures/grass.js
import * as THREE from 'three';

export function colorProc({ tx, tz, fx, fz, seed }) {
  const base = new THREE.Color(0x2E7D32).convertSRGBToLinear();
  // small speckle by corner
  const speck = 1.0 + ((fx ^ fz) ? 0.06 : -0.04) + (seed - 0.5) * 0.05;
  return base.clone().multiplyScalar(speck);
}