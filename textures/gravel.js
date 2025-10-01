// file: textures/gravel.js
import * as THREE from 'three';

export function colorProc({ tx, tz, fx, fz, seed }) {
  const base = new THREE.Color(0x9A9A9A).convertSRGBToLinear();
  const speck = 1.0 + (Math.sin((tx+fx)*5.1 + (tz+fz)*6.3 + seed*10.0) * 0.5 + 0.5) * 0.2;
  return base.clone().multiplyScalar(speck);
}