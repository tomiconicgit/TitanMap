import * as THREE from 'three';

const GRID_SIZE = 10;
const TILE_SIZE = 1;

export function tileToWorld(tx, tz) {
  const worldX = (tx - GRID_SIZE / 2 + TILE_SIZE / 2);
  const worldZ = (tz - GRID_SIZE / 2 + TILE_SIZE / 2);
  
  return new THREE.Vector3(worldX, 0, worldZ);
}

/**
 * Converts world space coordinates to the nearest tile coordinate.
 * @param {THREE.Vector3} worldPos - The position in world space.
 * @returns {{tx: number, tz: number}} The tile's coordinates.
 */
export function worldToTile(worldPos) {
  let tx = Math.floor(worldPos.x + GRID_SIZE / 2);
  let tz = Math.floor(worldPos.z + GRID_SIZE / 2);
  
  // Clamp values to ensure they are always within the grid's bounds [0, 9]
  tx = Math.max(0, Math.min(tx, GRID_SIZE - 1));
  tz = Math.max(0, Math.min(tz, GRID_SIZE - 1));
  
  return { tx, tz };
}
