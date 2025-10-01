import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Creates a camera with orbit controls.
 * @param {HTMLCanvasElement} canvas - The canvas element the renderer is using.
 * @returns {{camera: THREE.PerspectiveCamera, controls: OrbitControls}}
 */
export function createCamera(canvas) {
  // 1. Create the camera
  const camera = new THREE.PerspectiveCamera(
    60, // Field of view
    window.innerWidth / window.innerHeight, // Aspect ratio
    0.1, // Near clipping plane
    1000 // Far clipping plane
  );
  
  // Set an initial position
  camera.position.set(0, 5, 10);

  // 2. Create the controls
  const controls = new OrbitControls(camera, canvas);
  
  // Configure controls for a smoother experience
  controls.enableDamping = true; // Adds inertia to camera movement
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false; // Prevents panning out of view
  controls.minDistance = 2; // How close you can zoom in
  controls.maxDistance = 50; // How far you can zoom out
  controls.maxPolarAngle = Math.PI / 2.1; // Prevents looking under the "ground"

  return { camera, controls };
}
