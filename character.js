import * as THREE from 'three';

export function createCharacter() {
  const geometry = new THREE.CircleGeometry(0.4, 32);
  const material = new THREE.MeshBasicMaterial({ 
    color: 0xff4444,
    side: THREE.DoubleSide 
  });
  
  const character = new THREE.Mesh(geometry, material);
  
  character.rotation.x = -Math.PI / 2;
  character.position.y = 0.01;
  
  return character;
}
