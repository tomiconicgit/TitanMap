import * as THREE from 'three';

const GRID_SIZE = 10;
const TILE_SIZE = 1;

/**
 * Converts tile coordinates (e.g., 0-9) to world space coordinates.
 * @param {number} tx - The tile's x-coordinate (column).
 * @param {number} tz - The tile's z-coordinate (row).
 * @returns {THREE.Vector3} The world position of the tile's center.
 */
export function tileToWorld(tx, tz) {
  const worldX = (tx - GRID_SIZE / 2 + TILE_SIZE / 2);
  const worldZ = (tz - GRID_SIZE / 2 + TILE_SIZE / 2);
  
  return new THREE.Vector3(worldX, 0, worldZ);
}
