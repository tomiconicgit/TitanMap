import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js'; // Import the new grid module

// 1. Create a scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

// 2. Add some lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// 3. Add the grid to the scene
const grid = createGrid();
scene.add(grid);

// 4. Initialize the viewport first to get its canvas element
const viewport = new Viewport(); 

// 5. Create the camera and controls, passing the viewport's canvas
const { camera, controls } = createCamera(viewport.renderer.domElement);
controls.target.set(0, 0, 0); // Ensure camera is looking at the center

// 6. Connect the scene and camera to the viewport
viewport.scene = scene;
viewport.camera = camera;

// 7. Tell the viewport to update the controls before each frame
viewport.onBeforeRender = () => {
  controls.update(); // Applies damping and updates the camera
};
