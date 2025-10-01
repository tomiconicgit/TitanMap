// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js';
import { createCharacter } from './character.js';
import { worldToTile, tileToWorld } from './grid-utils.js';
import { CharacterController } from './character-controller.js';
import { UIPanel } from './ui-panel.js';

window.onload = function () {
  // --- World State ---
  let gridWidth, gridHeight;
  let grid, groundPlane;

  // 1) Scene & lights
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(ambientLight, dirLight);

  // 2) Character (red circle) + controller
  const character = createCharacter();
  const controller = new CharacterController(character, 0, 0); // Initialized but will be reset
  scene.add(character);

  // 3) Viewport + camera (with OrbitControls)
  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;
  
  // --- Main World Regeneration Function ---
  function regenerateWorld(width, height) {
    gridWidth = width;
    gridHeight = height;

    // Remove old objects if they exist
    if (grid) scene.remove(grid);
    if (groundPlane) scene.remove(groundPlane);

    // Create new grid visuals and raycasting plane
    grid = createGrid(width, height);
    scene.add(grid);

    groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    groundPlane.rotation.x = -Math.PI / 2;
    scene.add(groundPlane);
    
    // Update the pathfinding grid size
    controller.updateGridSize(width, height);

    // Reset character to the center of the new grid
    const centerTx = Math.floor(width / 2);
    const centerTz = Math.floor(height / 2);
    controller.resetTo(centerTx, centerTz);

    // Reset camera to look at the new center
    const newCenterWorld = tileToWorld(centerTx, centerTz, width, height);
    controls.target.copy(newCenterWorld);
    camera.position.set(newCenterWorld.x + 2, 6, newCenterWorld.z + 8);
    controls.update();
  }
  
  // 4) Create the UI Panel and listen for its events
  const uiPanel = new UIPanel(document.body);
  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  // --- FOLLOW: keep camera & target translating with the character ---
  const lastCharPos = new THREE.Vector3();
  const moveDelta = new THREE.Vector3();

  // 5) Tap-to-move (tap, not drag)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const downPos = new THREE.Vector2();
  const canvas = viewport.renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => { downPos.set(e.clientX, e.clientY); });
  canvas.addEventListener('pointerup', (e) => {
    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return;

    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(groundPlane, false);
    if (hit.length === 0) return;

    const { tx, tz } = worldToTile(hit[0].point, gridWidth, gridHeight);
    controller.moveTo(tx, tz);
  });

  // 6) Loop
  viewport.onBeforeRender = (dt) => {
    lastCharPos.copy(character.position);
    controller.update(dt);
    moveDelta.subVectors(character.position, lastCharPos);
    if (moveDelta.lengthSq() > 0) {
      camera.position.add(moveDelta);
      controls.target.add(moveDelta);
    }
    controls.update();
  };

  // --- Initial Boot ---
  regenerateWorld(30, 30); // Generate the initial 30x30 world
};
