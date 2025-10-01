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
  let gridWidth, gridHeight;
  let gridGroup, groundPlane;

  // --- NEW: tap-to-move freeze flag
  let freezeTapToMove = false;

  // --- HUD: add a top-left toggle switch
  addFreezeToggle();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  const character = createCharacter();
  const controller = new CharacterController(character, 0, 0);
  scene.add(character);

  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  function regenerateWorld(width, height) {
    gridWidth = width;
    gridHeight = height;

    if (gridGroup) scene.remove(gridGroup);
    if (groundPlane) scene.remove(groundPlane);

    gridGroup = createGrid(width, height);
    scene.add(gridGroup);

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
    groundPlane.position.set(0, 0, 0);
    groundPlane.name = 'TapPlane';
    groundPlane.frustumCulled = false;
    scene.add(groundPlane);

    controller.updateGridSize(width, height);

    const cTx = Math.floor(width / 2);
    const cTz = Math.floor(height / 2);
    controller.resetTo(cTx, cTz);

    const center = tileToWorld(cTx, cTz, width, height);
    controls.target.copy(center);
    camera.position.set(center.x + 2, 6, center.z + 8);
    controls.update();
  }

  const uiPanel = new UIPanel(document.body);
  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const downPos = new THREE.Vector2();
  const canvas = viewport.renderer.domElement;

  // We still record pointerdown (for drag distance),
  // but we won't move on pointerup if freeze is enabled.
  canvas.addEventListener('pointerdown', (e) => {
    downPos.set(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', (e) => {
    // NEW: freeze tap-to-move
    if (freezeTapToMove) return;

    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return; // ignore drags

    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(groundPlane, false);
    if (hit.length === 0) return;

    const { tx, tz } = worldToTile(hit[0].point, gridWidth, gridHeight);
    controller.moveTo(tx, tz);
  });

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

  regenerateWorld(30, 30);

  // ---------- helpers ----------
  function addFreezeToggle() {
    // styles
    const style = document.createElement('style');
    style.textContent = `
      .hud-freeze {
        position: fixed; top: 12px; left: 12px; z-index: 20;
        display: flex; align-items: center; gap: 8px;
        background: rgba(30,32,37,0.85);
        color: #e8e8ea; padding: 8px 10px;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px; backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        font: 600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;
      }
      .switch {
        position: relative; display: inline-block; width: 44px; height: 24px;
      }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; cursor: pointer; inset: 0;
        background: #3a3d46; transition: .2s; border-radius: 999px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
      }
      .slider:before {
        position: absolute; content: "";
        height: 18px; width: 18px; left: 3px; top: 3px;
        background: #fff; border-radius: 50%; transition: .2s;
      }
      input:checked + .slider { background: #00aaff; }
      input:checked + .slider:before { transform: translateX(20px); }
    `;
    document.head.appendChild(style);

    // UI
    const hud = document.createElement('div');
    hud.className = 'hud-freeze';
    hud.innerHTML = `
      <label class="switch" title="Freeze tap-to-move">
        <input type="checkbox" id="freezeMoveToggle">
        <span class="slider"></span>
      </label>
      <span>Freeze tap-to-move</span>
    `;
    document.body.appendChild(hud);

    const checkbox = hud.querySelector('#freezeMoveToggle');
    checkbox.addEventListener('change', () => {
      freezeTapToMove = checkbox.checked;
    });
  }
};