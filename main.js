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
import { MovementController } from './movement.js';
import { HeightTool } from './height-tool.js';
import { TerrainPainter } from './terrain-painter.js';

function init() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  scene.add(dirLight);

  const sky = new SkySystem(scene, viewport.renderer, dirLight);

  const character = createCharacter();
  character.castShadow = true;
  scene.add(character);

  const terrain = new Terrain(scene);
  const mover = new MovementController(character, camera, controls, terrain, {
    speedTilesPerSec: 6, ballRadius: 0.35
  });

  const markerTool = new MarkerTool(scene, tileToWorld);
  let markerMode = false;
  const blockedTiles = new Set();

  const freezeHUD = new FreezeHUD();
  let freezeTapToMove = false;
  freezeHUD.onChange((checked) => {
    if (markerMode || heightMode || paintingMode) { freezeHUD.set(true); return; }
    freezeTapToMove = !!checked;
  });

  const heightTool = new HeightTool(scene, null, 10, 10);
  // NEW: whenever heights are applied, rebuild the terrain outlines so they follow the deformed mesh
  heightTool.setOnApplied(() => terrain.onHeightsUpdated());

  let heightMode = false;
  let pinMode = false;
  let currentHeightValue = 0;

  const painter = new TerrainPainter(terrain);
  let paintingMode = false;
  let currentPaintType = null;

  const uiPanel = new UIPanel(document.body);

  let gridWidth = 10, gridHeight = 10;

  function regenerateWorld(w, h) {
    gridWidth = w | 0; gridHeight = h | 0;

    terrain.rebuild(gridWidth, gridHeight);

    // snap character to center/ground
    const tx = Math.floor(gridWidth / 2);
    const tz = Math.floor(gridHeight / 2);
    const c = tileToWorld(tx, tz, gridWidth, gridHeight);
    const y = terrain.getHeightAt(c.x, c.z) + 0.35;
    character.position.set(c.x, y, c.z);

    controls.target.set(c.x, y - 0.35, c.z);
    camera.position.set(c.x + 3, y + 5.65, c.z + 9);
    controls.update();

    markerTool.setGridSize(gridWidth, gridHeight);
    blockedTiles.clear();

    heightTool.reset(terrain.mesh, gridWidth, gridHeight);

    painter.setGridSize(gridWidth, gridHeight);
    painter.painted.clear();

    const span = Math.max(gridWidth, gridHeight);
    sky.update(span, new THREE.Vector3(c.x, 0, c.z));
  }

  regenerateWorld(10, 10);

  // === UI wiring ===
  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  uiPanel.panelElement.addEventListener('grid-outline-toggle', (e) => {
    terrain.setOutlinesVisible(!!(e.detail && e.detail.wantOn));
  });

  // Terrain tab open cancels painting if active
  uiPanel.panelElement.addEventListener('terrain-tab-opened', () => {
    // no-op; we handle toggle via terrain-select below
  });

  // Select/deselect paint type
  uiPanel.panelElement.addEventListener('terrain-select', (e) => {
    const { type, active } = e.detail || {};
    if (!type) return;

    if (active) {
      // cancel marker/height if on
      if (markerMode) {
        markerMode = false;
        markerTool.setVisible(false);
        markerTool.clearAll();
      }
      if (heightMode) {
        heightMode = false; pinMode = false;
        heightTool.setPinsVisible(false);
      }
      currentPaintType = type;
      paintingMode = true;

      // freeze tap-to-move while painting
      freezeTapToMove = true;
      freezeHUD.set(true);
      freezeHUD.setDisabled(true);
    } else {
      currentPaintType = null;
      paintingMode = false;

      if (!markerMode && !heightMode) {
        freezeTapToMove = false;
        freezeHUD.set(false);
        freezeHUD.setDisabled(false);
      }
    }
  });

  // Marker toggle
  uiPanel.panelElement.addEventListener('marker-toggle-request', (e) => {
    const wantOn = !!(e.detail && e.detail.wantOn);
    markerMode = wantOn;

    if (wantOn) {
      // disable painting while marking
      paintingMode = false; currentPaintType = null;
      freezeHUD.set(true); freezeHUD.setDisabled(true);

      markerTool.setGridSize(gridWidth, gridHeight);
      markerTool.syncToKeys(blockedTiles);
      markerTool.setVisible(true);

      freezeTapToMove = true;
    } else {
      for (const k of markerTool.getMarkedKeys()) blockedTiles.add(k);
      markerTool.setVisible(false);
      markerTool.clearAll();

      if (!heightMode && !paintingMode) {
        freezeTapToMove = false;
        freezeHUD.set(false);
        freezeHUD.setDisabled(false);
      }
    }
  });

  // Height panel events
  uiPanel.panelElement.addEventListener('height-toggle-request', (e) => {
    heightMode = !!(e.detail && e.detail.wantOn);
    if (heightMode) {
      paintingMode = false; currentPaintType = null;
      freezeTapToMove = true;
      freezeHUD.set(true); freezeHUD.setDisabled(true);
      heightTool.setPinsVisible(!!pinMode);
    } else {
      heightTool.setPinsVisible(false);
      if (!markerMode && !paintingMode) {
        freezeTapToMove = false;
        freezeHUD.set(false);
        freezeHUD.setDisabled(false);
      }
    }
  });

  uiPanel.panelElement.addEventListener('pin-toggle-request', (e) => {
    pinMode = !!(e.detail && e.detail.wantOn);
    heightTool.setPinsVisible(heightMode && pinMode);
  });

  uiPanel.panelElement.addEventListener('height-set', (e) => {
    let { value } = e.detail || {};
    if (!Number.isFinite(value)) return;
    value = Math.max(-10, Math.min(10, Math.round(value / 0.2) * 0.2));
    currentHeightValue = value;
  });

  // Save
  uiPanel.panelElement.addEventListener('save-project', (e) => {
    const { filename } = e.detail;
    const data = {
      version: 8,
      timestamp: Date.now(),
      grid: { width: gridWidth, height: gridHeight },
      character: { position: character.position.toArray() },
      camera: { position: camera.position.toArray(), target: controls.target.toArray() },
      view: { outlines: !!terrain.showOutlines },
      sky: { /* stored inside sky system if you wish later */ },
      blocked: [...blockedTiles],
      paint: painter.serialize(),
      height: {
        field: Array.from(heightTool.heights),
        pins: [...heightTool.pinned]
      }
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

  // Load
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

    blockedTiles.clear();
    if (Array.isArray(data.blocked)) {
      for (const k of data.blocked) blockedTiles.add(String(k));
    }

    // restore heightfield/pins
    if (data.height?.field && Array.isArray(data.height.field)) {
      const hf = data.height.field;
      if (hf.length === (gridWidth + 1) * (gridHeight + 1)) {
        heightTool.heights.set(hf);
        heightTool.pinned = new Set(data.height.pins || []);
        heightTool.reset(terrain.mesh, gridWidth, gridHeight);

        const y = terrain.getHeightAt(character.position.x, character.position.z) + 0.35;
        character.position.y = y;
        controls.target.y = y - 0.35;
        controls.update();
      }
    }

    // restore paint
    if (Array.isArray(data.paint)) {
      painter.setGridSize(gridWidth, gridHeight);
      painter.deserialize(data.paint);
    }
  });

  // ===== Pointer handling =====
  const canvas = viewport.renderer.domElement;
  const downPos = new THREE.Vector2();

  canvas.addEventListener('pointerdown', (e) => downPos.set(e.clientX, e.clientY));
  canvas.addEventListener('pointerup', (e) => {
    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return;

    const p = terrain.raycastPointer(e, camera, canvas);
    if (!p) return;

    const { tx, tz } = worldToTile(p.x, p.z, gridWidth, gridHeight);

    // Painting
    if (paintingMode && currentPaintType) {
      painter.paint(tx, tz, currentPaintType);
      return;
    }

    // Marker
    if (markerMode) { markerTool.mark(tx, tz); return; }

    // Height
    if (heightMode) {
      if (pinMode) heightTool.togglePin(tx, tz);
      else heightTool.setTileHeight(tx, tz, currentHeightValue);
      return;
    }

    // Movement
    if (freezeTapToMove) return;
    if (blockedTiles.has(keyFor(tx, tz))) return;
    mover.moveToTile(tx, tz, gridWidth, gridHeight);
  });

  // Loop
  viewport.onBeforeRender = (dt) => {
    mover.update(dt);
    controls.update();
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}