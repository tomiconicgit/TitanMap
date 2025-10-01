import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createCamera(canvas) {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000 
  );
  
  camera.position.set(2, 3, 5);

  const controls = new OrbitControls(camera, canvas);
  
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 2;
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI / 2.1;
  
  // The controls need a camera to look at a target
  controls.target.set(0, 0, 0);

  return { camera, controls };
}
