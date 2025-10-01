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
  // World state
  let gridWidth, gridHeight;
  let gridGroup, groundPlane;

  // Scene & lights
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  // Character
  const character = createCharacter();
  const controller = new CharacterController(character, 0, 0); // real pos set on first regenerate
  scene.add(character);

  // Viewport + camera
  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // Build / rebuild world
  function regenerateWorld(width, height) {
    gridWidth = width;
    gridHeight = height;

    if (gridGroup) scene.remove(gridGroup);
    if (groundPlane) scene.remove(groundPlane);

    // Rect grid lines
    gridGroup = createGrid(width, height);
    scene.add(gridGroup);

    // Raycast plane — invisible but RAYCASTABLE (transparent instead of visible:false)
    groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    groundPlane.rotation.x = -Math.PI / 2;
    scene.add(groundPlane);

    // Pathfinding grid size
    controller.updateGridSize(width, height);

    // Reset character to center of new grid
    const cTx = Math.floor(width / 2);
    const cTz = Math.floor(height / 2);
    controller.resetTo(cTx, cTz);

    // Reset camera to look at new center (keeps your orbit behavior)
    const center = tileToWorld(cTx, cTz, width, height);
    controls.target.copy(center);
    camera.position.set(center.x + 2, 6, center.z + 8);
    controls.update();
  }

  // UI Panel
  const uiPanel = new UIPanel(document.body);
  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  // Tap-to-move (tap, not drag)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const downPos = new THREE.Vector2();
  const canvas = viewport.renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => { downPos.set(e.clientX, e.clientY); });

  canvas.addEventListener('pointerup', (e) => {
    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return; // ignore drags used for orbit

    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    // NOTE: use the latest groundPlane reference (we replace it on regenerate)
    const hit = raycaster.intersectObject(groundPlane, false);
    if (hit.length === 0) return;

    const { tx, tz } = worldToTile(hit[0].point, gridWidth, gridHeight);
    controller.moveTo(tx, tz);
  });

  // Follow camera: translate camera + target by character's movement delta
  const lastCharPos = new THREE.Vector3();
  const delta = new THREE.Vector3();

  viewport.onBeforeRender = (dt) => {
    lastCharPos.copy(character.position);
    controller.update(dt);
    delta.subVectors(character.position, lastCharPos);
    if (delta.lengthSq() > 0) {
      camera.position.add(delta);
      controls.target.add(delta);
    }
    controls.update();
  };

  // Boot
  regenerateWorld(30, 30);
};