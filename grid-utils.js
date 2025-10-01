import * as THREE from 'three';

const GRID_SIZE = 10;
const TILE_SIZE = 1;

export function tileToWorld(tx, tz) {
  const worldX = (tx - GRID_SIZE / 2 + TILE_SIZE / 2);
  const worldZ = (tz - GRID_SIZE / 2 + TILE_SIZE / 2);
  
  return new THREE.Vector3(worldX, 0, worldZ);
}

export function worldToTile(worldPos) {
  const tx = Math.floor(worldPos.x + GRID_SIZE / 2);
  const tz = Math.floor(worldPos.z + GRID_SIZE / 2);
  
  return { tx, tz };
}
