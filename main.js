import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js';
import { createCharacter } from './character.js';
import { tileToWorld } from './grid-utils.js'; // 1. Import the new utility

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

// Create the character
const character = createCharacter();
scene.add(character);

// 2. Define character's position in TILE coordinates (from 0 to 9)
const characterTilePos = { tx: 6, tz: 5 };

// 3. Convert tile coordinates to world position and place the character
const worldPos = tileToWorld(characterTilePos.tx, characterTilePos.tz);
character.position.set(worldPos.x, 0.01, worldPos.z);


// Initialize the viewport
const viewport = new Viewport(); 

// Create the camera and controls
const { camera, controls } = createCamera(viewport.renderer.domElement);

// Connect the scene and camera to the viewport
viewport.scene = scene;
viewport.camera = camera;

// Update the camera target in the render loop
viewport.onBeforeRender = () => {
  controls.target.copy(character.position);
  controls.update(); 
};
