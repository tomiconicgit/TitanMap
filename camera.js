// file: camera.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Creates a PerspectiveCamera + OrbitControls.
 * We keep the camera centered on whatever we set as controls.target.
 * main.js updates target to the character each frame, so the camera follows.
 */
export function createCamera(canvas) {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(2, 6, 8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Keep the camera orbiting around target (no panning for this editor)
  controls.enablePan = false;

  // Zoom & tilt limits
  controls.minDistance = 3;
  controls.maxDistance = 30;
  controls.minPolarAngle = Math.PI / 5;    // don’t go too top-down
  controls.maxPolarAngle = Math.PI / 2.05; // don’t go under the ground

  // Target will be set to the character each frame in main.js
  controls.target.set(0, 0, 0);

  return { camera, controls };
}