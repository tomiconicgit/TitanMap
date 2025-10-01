import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';

// 1. Create a scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

// 2. Add some lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// 3. Add an object to look at
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ 
    color: 0x0099ff, 
    roughness: 0.7 
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// 4. Initialize the viewport first to get its canvas element
const viewport = new Viewport(); 

// 5. Create the camera and controls, passing the viewport's canvas
const { camera, controls } = createCamera(viewport.renderer.domElement);

// 6. Connect the scene and camera to the viewport
viewport.scene = scene;
viewport.camera = camera;

// 7. Tell the viewport to update the controls before each frame
viewport.onBeforeRender = () => {
  controls.update(); // Applies damping and updates the camera
};
