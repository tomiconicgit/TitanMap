import * as THREE from 'three';

/**
 * Creates a red circle mesh to serve as a character reference.
 * @returns {THREE.Mesh}
 */
export function createCharacter() {
  const geometry = new THREE.CircleGeometry(0.4, 32); // Radius 0.4, 32 segments
  const material = new THREE.MeshBasicMaterial({ 
    color: 0xff4444,
    side: THREE.DoubleSide 
  });
  
  const character = new THREE.Mesh(geometry, material);
  
  // Rotate the circle to be flat on the XZ plane
  character.rotation.x = -Math.PI / 2;
  
  // Place it slightly above the ground to prevent z-fighting
  character.position.y = 0.01;
  
  return character;
}
