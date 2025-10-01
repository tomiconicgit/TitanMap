// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js';
import { createCharacter } from './character.js';
import { worldToTile } from './grid-utils.js';
import { CharacterController } from './character-controller.js';

window.onload = function () {
  // 1) Scene & lighting
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(ambientLight, directionalLight);

  // 2) Grid + invisible ground raycast plane (10x10)
  const grid = createGrid();
  scene.add(grid);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.name = 'GroundRaycastPlane';
  scene.add(groundPlane);

  // 3) Character
  const startTile = { tx: 5, tz: 5 };
  const character = createCharacter();
  const controller = new CharacterController(character, startTile.tx, startTile.tz);
  const spawn = controller.targetPosition.clone();
  character.position.set(spawn.x, character.position.y, spawn.z);
  scene.add(character);

  // 4) Viewport & camera/controls
  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // 5) Tap-to-move input (use canvas rect for NDC; ignore drags)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const downPos = new THREE.Vector2();
  const canvas = viewport.renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => {
    downPos.set(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', (e) => {
    // If pointer moved a lot -> it was a drag (orbit/pan), not a tap
    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return;

    // Convert to NDC using the canvas' client rect (works on mobile/high-DPR)
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(groundPlane, false);
    if (hit.length === 0) return;

    const { tx, tz } = worldToTile(hit[0].point);
    controller.moveTo(tx, tz);
  });

  // 6) Render/update loop
  viewport.onBeforeRender = (dt) => {
    controller.update(dt);
    controls.target.copy(character.position);
    controls.update();
  };
};