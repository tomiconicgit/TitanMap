// file: grid.js
import * as THREE from 'three';

export function createGrid(width = 10, height = 10) {
  const size = Math.max(width, height);
  const divisions = size; // Match divisions to size for 1x1 tiles
  const colorCenterLine = 0x888888;
  const colorGrid = 0x444444;

  const gridHelper = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid);
  gridHelper.position.y = -0.01;
  return gridHelper;
}
