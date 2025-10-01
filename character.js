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
  ball.castShadow = true;
  ball.receiveShadow = true;
  ball.name = 'PlayerBall';
  ball.position.y = 0.35; // sit above plane
  return ball;
}