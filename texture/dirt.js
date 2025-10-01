// file: textures/dirt.js
import * as THREE from 'three';

export function colorProc({ tx, tz, fx, fz, seed }) {
  const base = new THREE.Color(0x6F451F).convertSRGBToLinear();
  const n = (Math.sin((tx+seed)*12.3 + (tz+fz)*7.7) * 0.5 + 0.5) * 0.15;
  return base.clone().multiplyScalar(1.0 - 0.1 + n);
}