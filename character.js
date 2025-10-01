// file: character.js
import * as THREE from 'three';

export function createCharacter() {
  const geometry = new THREE.SphereGeometry(0.35, 32, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff4444,
    roughness: 0.6,
    metalness: 0.0
  });
  const ball = new THREE.Mesh(geometry, material);
  ball.castShadow = false;
  ball.receiveShadow = false;
  ball.name = 'PlayerBall';
  // sit slightly above the plane so it doesn't z-fight
  ball.position.y = 0.35;
  return ball;
}