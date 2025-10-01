// file: grid-utils.js
import * as THREE from 'three';

// Note: These constants are now just defaults.
// The functions will need the actual grid size passed to them.

export function tileToWorld(tx, tz, gridSize = 10) {
  const tileSize = 1;
  const worldX = (tx - gridSize / 2 + tileSize / 2);
  const worldZ = (tz - gridSize / 2 + tileSize / 2);
  return new THREE.Vector3(worldX, 0, worldZ);
}

export function worldToTile(worldPos, gridSize = 10) {
  let tx = Math.floor(worldPos.x + gridSize / 2);
  let tz = Math.floor(worldPos.z + gridSize / 2);
  tx = Math.max(0, Math.min(tx, gridSize - 1));
  tz = Math.max(0, Math.min(tz, gridSize - 1));
  return { tx, tz };
}
