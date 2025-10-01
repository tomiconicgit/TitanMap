// file: grid-utils.js
import * as THREE from 'three';

/** Convert a tile index (tx,tz) to world-space center */
export function tileToWorld(tx, tz, gridWidth, gridHeight) {
  const tileSize = 1;
  const worldX = (tx - gridWidth / 2 + tileSize / 2);
  const worldZ = (tz - gridHeight / 2 + tileSize / 2);
  return new THREE.Vector3(worldX, 0, worldZ);
}

/** Convert world-space point to clamped tile index */
export function worldToTile(worldPos, gridWidth, gridHeight) {
  let tx = Math.floor(worldPos.x + gridWidth / 2);
  let tz = Math.floor(worldPos.z + gridHeight / 2);
  tx = Math.max(0, Math.min(tx, gridWidth - 1));
  tz = Math.max(0, Math.min(tz, gridHeight - 1));
  return { tx, tz };
}
