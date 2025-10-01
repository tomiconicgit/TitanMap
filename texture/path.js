// file: textures/path.js
import * as THREE from 'three';

export function colorProc({ tx, tz, fx, fz, seed }) {
  const base = new THREE.Color(0x9E9E9E).convertSRGBToLinear();
  // faint boardwalk / stone banding across X
  const band = ((tx + fx) % 2) ? 0.85 : 1.05;
  const noise = 1.0 + (seed - 0.5) * 0.08;
  return base.clone().multiplyScalar(band * noise);
}