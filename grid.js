import * as THREE from 'three';

/**
 * Creates a 10x10 grid helper.
 * @returns {THREE.GridHelper}
 */
export function createGrid() {
  const size = 10;
  const divisions = 10;
  const colorCenterLine = 0x888888;
  const colorGrid = 0x444444;

  const gridHelper = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid);
  
  // Lower the grid slightly to prevent z-fighting with objects on the same plane
  gridHelper.position.y = -0.01;
  
  return gridHelper;
}
