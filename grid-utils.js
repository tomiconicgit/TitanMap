// file: grid-utils.js
import * as THREE from 'three';

// Export these so camera.js can size/clamp correctly.
export const GRID_SIZE = 10;   // tiles per side
export const TILE_SIZE = 1;    // world units per tile

/** Convert a tile index (tx,tz) to world-space center */
export function tileToWorld(tx, tz) {
  const worldX = (tx - GRID_SIZE / 2 + TILE_SIZE / 2);
  const worldZ = (tz - GRID_SIZE / 2 + TILE_SIZE / 2);
  return new THREE.Vector3(worldX, 0, worldZ);
}

/** Convert world-space point to clamped tile index (0..GRID_SIZE-1) */
export function worldToTile(worldPos) {
  let tx = Math.floor(worldPos.x + GRID_SIZE / 2);
  let tz = Math.floor(worldPos.z + GRID_SIZE / 2);
  tx = Math.max(0, Math.min(tx, GRID_SIZE - 1));
  tz = Math.max(0, Math.min(tz, GRID_SIZE - 1));
  return { tx, tz };
}