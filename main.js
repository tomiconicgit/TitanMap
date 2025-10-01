import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js';
import { createCharacter } from './character.js';
import { worldToTile } from './grid-utils.js';
import { CharacterController } from './character-controller.js';

// 1. Scene and basic setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(ambientLight, directionalLight);

const grid = createGrid();
scene.add(grid);

// A transparent plane for raycasting clicks
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
);
groundPlane.rotation.x = -Math.PI / 2;
scene.add(groundPlane);

// 2. Character setup
const startTile = { tx: 5, tz: 5 };
const character = createCharacter();
const characterController = new CharacterController(character, startTile.tx, startTile.tz);
character.position.copy(characterController.targetPosition); // Initial position
scene.add(character);

// 3. Viewport and Camera
const viewport = new Viewport(); 
const { camera, controls } = createCamera(viewport.renderer.domElement);
viewport.scene = scene;
viewport.camera = camera;

// 4. Input Handling (Raycasting)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

window.addEventListener('pointerdown', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(groundPlane);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    const { tx, tz } = worldToTile(point);
    characterController.moveTo(tx, tz);
  }
});

// 5. Render Loop
viewport.onBeforeRender = (deltaTime) => {
  characterController.update(deltaTime);
  controls.target.copy(character.position);
  controls.update(); 
};
