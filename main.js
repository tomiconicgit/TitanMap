// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js';
import { createCharacter } from './character.js';
import { worldToTile } from './grid-utils.js';
import { CharacterController } from './character-controller.js';

window.onload = function () {
  // 1) Scene & lights
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(ambientLight, dirLight);

  // 2) Grid + invisible ground for raycasting (10x10 world)
  const grid = createGrid();
  scene.add(grid);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.name = 'GroundRaycastPlane';
  scene.add(groundPlane);

  // 3) Character (red circle) + controller
  const startTile = { tx: 5, tz: 5 };
  const character = createCharacter();
  const controller = new CharacterController(character, startTile.tx, startTile.tz);
  const spawn = controller.targetPosition.clone();
  character.position.set(spawn.x, character.position.y, spawn.z);
  scene.add(character);

  // 4) Viewport + camera (with OrbitControls)
  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // 5) Tap-to-move (tap, not drag)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const downPos = new THREE.Vector2();
  const canvas = viewport.renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => {
    downPos.set(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', (e) => {
    // Ignore drags (used for orbit/zoom)
    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return;

    // Raycast the (invisible) ground
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(groundPlane, false);
    if (hit.length === 0) return;

    const { tx, tz } = worldToTile(hit[0].point);
    controller.moveTo(tx, tz);
  });

  // 6) Loop — follow the character + keep controls responsive
  viewport.onBeforeRender = (dt) => {
    controller.update(dt);

    // Lock the orbit focus to the character so the camera follows.
    // (Do this every frame so it stays glued while the character moves.)
    controls.target.copy(character.position);

    // Smooth orbit/zoom/tilt
    controls.update();
  };
};