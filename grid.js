import * as THREE from 'three';

export function createGrid(size = 10, divisions = 10) { // Now accepts arguments
  const colorCenterLine = 0x888888;
  const colorGrid = 0x444444;

  const gridHelper = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid);
  gridHelper.position.y = -0.01;
  return gridHelper;
}
