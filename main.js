import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js';
import { createCharacter } from './character.js';
import { worldToTile } from './grid-utils.js';
import { CharacterController } from './character-controller.js';

window.onload = function() {
  // 1. Scene and basic setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(ambientLight, directionalLight);

  const grid = createGrid();
  scene.add(grid);

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
  
  const initialWorldPos = characterController.targetPosition;
  character.position.set(initialWorldPos.x, character.position.y, initialWorldPos.z);
  scene.add(character);

  // 3. Viewport and Camera
  const viewport = new Viewport(); 
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // 4. Input Handling (Corrected to distinguish tap vs. drag)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerDownPos = new THREE.Vector2();

  viewport.renderer.domElement.addEventListener('pointerdown', (event) => {
    // Record the position where the pointer went down
    pointerDownPos.set(event.clientX, event.clientY);
  });

  viewport.renderer.domElement.addEventListener('pointerup', (event) => {
    // Calculate the distance the pointer moved
    const pointerUpPos = new THREE.Vector2(event.clientX, event.clientY);
    const dragDistance = pointerDownPos.distanceTo(pointerUpPos);

    // If the pointer moved more than a few pixels, treat it as a camera drag and do nothing.
    if (dragDistance > 5) {
      return;
    }

    // This was a tap! Proceed with pathfinding.
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
};
