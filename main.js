// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createCharacter } from './character.js';
import { UIPanel } from './ui-panel.js';

import { Terrain } from './terrain.js';
import { SkySystem } from './sky.js';
import { MarkerTool } from './marker.js';
import { FreezeHUD } from './hud-freeze.js';

import { tileToWorld, worldToTile, keyFor } from './tile-utils.js';
import { moveCharacterToTile } from './movement.js';

function init() {
  // Scene & renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // Light + Sky
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  scene.add(dirLight);

  const sky = new SkySystem(scene, viewport.renderer, dirLight);

  // Character
  const character = createCharacter();
  character.castShadow = true;
  scene.add(character);

  // Terrain
  const terrain = new Terrain(scene);

  // Marker
  const markerTool = new MarkerTool(scene, tileToWorld);
  let markerMode = false;
  const blockedTiles = new Set();

  // Freeze HUD
  const freezeHUD = new FreezeHUD();
  let freezeTapToMove = false;
  freezeHUD.onChange((checked) => {
    if (markerMode) { freezeHUD.set(true); return; } // locked during marker mode
    freezeTapToMove = !!checked;
  });

  // UI Panel (your existing UI)
  const uiPanel = new UIPanel(document.body);

  // World state
  let gridWidth = 10, gridHeight = 10;

  function regenerateWorld(w, h) {
    gridWidth = w | 0; gridHeight = h | 0;

    terrain.rebuild(gridWidth, gridHeight);

    // center character on middle tile
    const tx = Math.floor(gridWidth / 2);
    const tz = Math.floor(gridHeight / 2);
    const c = tileToWorld(tx, tz, gridWidth, gridHeight);
    character.position.set(c.x, 0.35, c.z);

    controls.target.set(c.x, 0, c.z);
    camera.position.set(c.x + 3, 6, c.z + 9);
    controls.update();

    markerTool.setGridSize(gridWidth, gridHeight);
    blockedTiles.clear(); // new world => clear blockers

    const span = Math.max(gridWidth, gridHeight);
    sky.update(span, new THREE.Vector3(c.x, 0, c.z));
  }

  // Initial world
  regenerateWorld(10, 10);

  // UI: Grid size -> regenerate
  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  // UI: outlines
  uiPanel.panelElement.addEventListener('grid-outline-toggle', (e) => {
    const on = !!(e.detail && e.detail.wantOn);
    terrain.setOutlinesVisible(on);
  });

  // UI: marker toggle
  uiPanel.panelElement.addEventListener('marker-toggle-request', (e) => {
    const wantOn = !!(e.detail && e.detail.wantOn);
    markerMode = wantOn;

    if (wantOn) {
      // entering marker mode: show layer with EXISTING blocked tiles + lock freeze
      markerTool.setGridSize(gridWidth, gridHeight);
      markerTool.syncToKeys(blockedTiles);
      markerTool.setVisible(true);

      freezeTapToMove = true;
      freezeHUD.set(true);
      freezeHUD.setDisabled(true);
    } else {
      // leaving: take overlays as newly blocked, hide layer, unfreeze
      for (const k of markerTool.getMarkedKeys()) blockedTiles.add(k);
      markerTool.setVisible(false); // keep overlays in memory? we can clear now to rebuild next time:
      markerTool.clearAll();

      freezeTapToMove = false;
      freezeHUD.set(false);
      freezeHUD.setDisabled(false);
    }
  });

  // UI: Save/Load passthrough
  uiPanel.panelElement.addEventListener('save-project', (e) => {
    const { filename } = e.detail;
    const data = {
      version: 5,
      timestamp: Date.now(),
      grid: { width: gridWidth, height: gridHeight },
      character: { position: character.position.toArray() },
      camera: { position: camera.position.toArray(), target: controls.target.toArray() },
      view: { outlines: !!terrain.showOutlines },
      sky: { ...sky.params },
      blocked: [...blockedTiles]
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'titanmap.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  uiPanel.panelElement.addEventListener('load-project-data', (e) => {
    const { data } = e.detail || {};
    if (!data || !data.grid) { alert('Invalid save file.'); return; }

    regenerateWorld(data.grid.width, data.grid.height);

    if (data.character?.position) character.position.fromArray(data.character.position);
    if (data.camera?.position && data.camera?.target) {
      camera.position.fromArray(data.camera.position);
      controls.target.fromArray(data.camera.target);
      controls.update();
    }
    if (data.view && typeof data.view.outlines === 'boolean') {
      terrain.setOutlinesVisible(!!data.view.outlines);
      if (uiPanel.outlineToggleEl) uiPanel.outlineToggleEl.checked = !!data.view.outlines;
    }
    if (data.sky) {
      Object.assign(sky.params, data.sky);
      const span = Math.max(gridWidth, gridHeight);
      sky.update(span, controls.target.clone());
    }
    blockedTiles.clear();
    if (Array.isArray(data.blocked)) {
      for (const k of data.blocked) blockedTiles.add(String(k));
    }
  });

  // Pointer tap handling (movement/marking)
  const canvas = viewport.renderer.domElement;
  const downPos = new THREE.Vector2();

  canvas.addEventListener('pointerdown', (e) => {
    downPos.set(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', (e) => {
    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return;            // ignore drags

    const p = terrain.raycastPointer(e, camera, canvas);
    if (!p) return;

    const { tx, tz } = worldToTile(p.x, p.z, gridWidth, gridHeight);

    if (markerMode) {
      markerTool.mark(tx, tz);
      return;
    }

    if (freezeTapToMove) return;
    if (blockedTiles.has(keyFor(tx, tz))) return;

    moveCharacterToTile(character, camera, controls, tx, tz, gridWidth, gridHeight);
  });

  // Render loop
  viewport.onBeforeRender = () => {
    controls.update();
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}