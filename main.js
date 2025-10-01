import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js';
import { createCharacter } from './character.js'; // 1. Import the character module

// Create a scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

// Add some lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// Add the grid to the scene
const grid = createGrid();
scene.add(grid);

// 2. Create the character and add it to the scene
const character = createCharacter();
character.position.set(2, 0.01, 1); // Place it on a specific tile
scene.add(character);

// Initialize the viewport
const viewport = new Viewport(); 

// Create the camera and controls
const { camera, controls } = createCamera(viewport.renderer.domElement);

// Connect the scene and camera to the viewport
viewport.scene = scene;
viewport.camera = camera;

// 3. Update the camera target in the render loop
viewport.onBeforeRender = () => {
  // Make the camera's orbit center follow the character's position
  controls.target.copy(character.position);
  
  // This MUST be called after updating the target
  controls.update(); 
};
