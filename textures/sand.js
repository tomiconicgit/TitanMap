// file: textures/sand.js
import * as THREE from 'three';

/** returns THREE.Color in linear [0..1] */
export function colorProc({ tx, tz, fx, fz, seed }) {
  // warm beige with subtle stripe by fx/fz and seed
  const base = new THREE.Color(0xD8C6A3).convertSRGBToLinear();
  const shade = (seed * 0.12 + (fx ? 0.06 : 0) + (fz ? 0.03 : 0));
  const c = base.clone().multiplyScalar(1.0 - 0.08 + shade * 0.16);
  return c;
}