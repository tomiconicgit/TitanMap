// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createGrid } from './grid.js';
import { createCharacter } from './character.js';
import { worldToTile, tileToWorld } from './grid-utils.js';
import { CharacterController } from './character-controller.js';
import { UIPanel } from './ui-panel.js';
import { Water } from 'three/addons/objects/Water.js';
import { HeightTool } from './height-tool.js';

window.onload = function () {
  let gridWidth, gridHeight;
  let gridGroup, terrainMesh;

  let freezeTapToMove = false;
  let freezeCheckboxEl = null;

  let markerMode = false;
  const markerGroup = new THREE.Group();
  markerGroup.name = 'MarkerLayer';
  const markedTiles = new Map();

  // --- REFACTORED TERRAIN STATE ---
  let paintingMode = false;
  let currentPaintType = null;
  const paintedTileData = new Map(); // Stores data ('grass', 'sand'), not meshes.
  const waterMeshes = new Map();     // Water tiles are still separate objects.

  let heightMode = false;
  let pinMode = false;
  let currentHeightValue = 0;
  let heightTool = null;

  // --- SCENE SETUP ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);
  scene.add(markerGroup);

  const character = createCharacter();
  const controller = new CharacterController(character, 0, 0);
  scene.add(character);

  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  const WATER_NORMALS_URL = './textures/waternormals.jpg';
  const waterNormals = new THREE.TextureLoader().load(WATER_NORMALS_URL, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });

  // --- WORLD GENERATION (MODIFIED) ---
  function regenerateWorld(width, height) {
    gridWidth = width;
    gridHeight = height;

    if (gridGroup) scene.remove(gridGroup);
    if (terrainMesh) scene.remove(terrainMesh);

    gridGroup = createGrid(width, height);
    scene.add(gridGroup);

    const terrainGeo = new THREE.PlaneGeometry(width, height, width, height);
    const colors = [];
    const defaultColor = new THREE.Color(0x888888);
    for (let i = 0; i < terrainGeo.attributes.position.count; i++) {
        colors.push(defaultColor.r, defaultColor.g, defaultColor.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const terrainMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: false, // Use smooth shading for better slopes
    });

    terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.name = 'TerrainMesh';
    scene.add(terrainMesh);

    clearAllPainted();

    if (!heightTool) {
      heightTool = new HeightTool(scene, terrainMesh, width, height);
    } else {
      heightTool.reset(terrainMesh, width, height);
    }

    controller.updateGridSize(width, height);

    const cTx = Math.floor(width / 2);
    const cTz = Math.floor(height / 2);
    controller.resetTo(cTx, cTz);

    const center = tileToWorld(cTx, cTz, width, height);
    controls.target.copy(center);
    camera.position.set(center.x + 2, 6, center.z + 8);
    controls.update();
  }

  // --- UI PANEL EVENT LISTENERS ---
  const uiPanel = new UIPanel(document.body);

  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  uiPanel.panelElement.addEventListener('terrain-tab-opened', () => {
    if (paintingMode) {
      paintingMode = false;
      currentPaintType = null;
    }
    uiPanel.clearTerrainSelection();
    if (!heightMode && !markerMode) setFreeze(false, false);
  });

  uiPanel.panelElement.addEventListener('terrain-select', (e) => {
    const { type, active } = e.detail || {};
    if (!type) return;

    if (active) {
      if (markerMode) { markerMode = false; uiPanel.setMarkerToggle(false); }
      if (heightMode) {
        heightMode = false; pinMode = false;
        heightTool?.removeAllPins();
      }
      currentPaintType = type;
      paintingMode = true;
      setFreeze(true, true);
    } else {
      paintingMode = false;
      currentPaintType = null;
      setFreeze(false, false);
    }
  });

  uiPanel.panelElement.addEventListener('marker-toggle-request', (e) => {
    const { wantOn } = e.detail || {};
    if (wantOn) {
      if (paintingMode) {
        paintingMode = false;
        currentPaintType = null;
        uiPanel.clearTerrainSelection();
      }
      if (heightMode) {
        heightMode = false; pinMode = false;
        heightTool?.removeAllPins();
      }
      markerMode = true;
      setFreeze(true, true);
    } else {
      markerMode = false;
      controller.applyNonWalkables([...markedTiles.keys()]);
      setFreeze(false, false);
    }
  });

  uiPanel.panelElement.addEventListener('height-tab-opened', () => {});

  uiPanel.panelElement.addEventListener('height-toggle-request', (e) => {
    const { wantOn } = e.detail || {};
    heightMode = !!wantOn;

    if (heightMode) {
      if (markerMode) { markerMode = false; uiPanel.setMarkerToggle(false); }
      if (paintingMode) { paintingMode = false; currentPaintType = null; uiPanel.clearTerrainSelection(); }
      setFreeze(true, true);
    } else {
      pinMode = false;
      heightTool?.removeAllPins();
      setFreeze(false, false);
    }
  });

  uiPanel.panelElement.addEventListener('pin-toggle-request', (e) => {
    const { wantOn } = e.detail || {};
    pinMode = !!wantOn;
  });

  uiPanel.panelElement.addEventListener('height-set', (e) => {
    const { value } = e.detail || {};
    if (Number.isFinite(value)) currentHeightValue = Math.max(-50, Math.min(50, value | 0));
  });

  uiPanel.panelElement.addEventListener('save-project', (e) => {
    const { filename } = e.detail || {};
    const data = getProjectData();
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
    applyProjectData(data);
  });

  // --- INPUT HANDLING (MODIFIED) ---
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
    const hit = raycaster.intersectObject(terrainMesh, false);
    if (hit.length === 0) return;

    const { tx, tz } = worldToTile(hit[0].point, gridWidth, gridHeight);

    if (markerMode) { addMarker(tx, tz); return; }
    if (paintingMode && currentPaintType) { paintTile(tx, tz, currentPaintType); return; }

    if (heightMode) {
      if (pinMode) {
        heightTool?.togglePin(tx, tz);
      } else {
        heightTool?.setTileHeight(tx, tz, currentHeightValue);
      }
      return;
    }

    if (freezeTapToMove) return;
    controller.moveTo(tx, tz);
  });

  // --- RENDER LOOP (MODIFIED) ---
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

    if (waterMeshes.size > 0) {
      for (const w of waterMeshes.values()) {
        w.material.uniforms['time'].value += dt;
      }
    }

    controls.update();
  };

  // --- BOOT SEQUENCE ---
  addFreezeToggle();
  regenerateWorld(30, 30);

  // --- HELPER FUNCTIONS ---

  function tileKey(x, y) { return `${x},${y}`; }

  function addMarker(tx, tz) {
    if (tx < 0 || tx >= gridWidth || tz < 0 || tz >= gridHeight) return;
    const key = tileKey(tx, tz);
    if (markedTiles.has(key)) return;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff3333, transparent: true, opacity: 0.6, side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
    m.position.set(wp.x, 0.02, wp.z);
    m.name = `Marker_${key}`;
    markerGroup.add(m);
    markedTiles.set(key, m);
  }

  function clearAllMarkers() {
    for (const [, mesh] of markedTiles) {
      markerGroup.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    markedTiles.clear();
  }

  const MATERIALS = {
    sand:   { color: new THREE.Color(0xD8C6A3) },
    dirt:   { color: new THREE.Color(0x6F451F) },
    grass:  { color: new THREE.Color(0x2E7D32) },
    stone:  { color: new THREE.Color(0x7D7D7D) },
    gravel: { color: new THREE.Color(0x9A9A9A) },
  };

  function createWaterTile(tx, tz) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const water = new Water(geo, {
      textureWidth: 256,
      textureHeight: 256,
      waterNormals,
      sunDirection: dirLight.position.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0x2066cc,
      distortionScale: 1.85,
      fog: !!scene.fog
    });
    water.rotation.x = -Math.PI / 2;
    const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
    
    // Water position will be set dynamically based on terrain height later if needed
    water.position.set(wp.x, 0.02, wp.z);
    if (water.material.uniforms.size) {
      water.material.uniforms.size.value = 10.0;
    }
    water.userData.type = 'water';
    water.name = `Water_${tx},${tz}`;
    return water;
  }

  function paintTile(tx, tz, type) {
    if (tx < 0 || tx >= gridWidth || tz < 0 || tz >= gridHeight) return;
    const key = tileKey(tx, tz);

    const oldType = paintedTileData.get(key);
    if (oldType === type) return;

    if (waterMeshes.has(key)) {
        const oldWater = waterMeshes.get(key);
        scene.remove(oldWater);
        oldWater.geometry.dispose();
        oldWater.material.dispose();
        waterMeshes.delete(key);
    }

    if (type === 'water') {
        const water = createWaterTile(tx, tz);
        // We'll need to adjust water height based on terrain later
        scene.add(water);
        waterMeshes.set(key, water);
    } else {
        const mat = MATERIALS[type] || MATERIALS.sand;
        const color = mat.color;
        const terrainColors = terrainMesh.geometry.attributes.color;
        const widthSegments = gridWidth;

        const v_tl = (tz) * (widthSegments + 1) + (tx);
        const v_tr = (tz) * (widthSegments + 1) + (tx + 1);
        const v_bl = (tz + 1) * (widthSegments + 1) + (tx);
        const v_br = (tz + 1) * (widthSegments + 1) + (tx + 1);

        terrainColors.setXYZ(v_tl, color.r, color.g, color.b);
        terrainColors.setXYZ(v_tr, color.r, color.g, color.b);
        terrainColors.setXYZ(v_bl, color.r, color.g, color.b);
        terrainColors.setXYZ(v_br, color.r, color.g, color.b);
        terrainColors.needsUpdate = true;
    }
    paintedTileData.set(key, type);
  }

  function clearAllPainted() {
    paintedTileData.clear();
    for (const [, mesh] of waterMeshes) {
      scene.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    waterMeshes.clear();
    
    if (terrainMesh) {
        const colors = terrainMesh.geometry.attributes.color;
        const defaultColor = new THREE.Color(0x888888);
        for(let i = 0; i < colors.count; i++) {
            colors.setXYZ(i, defaultColor.r, defaultColor.g, defaultColor.b);
        }
        colors.needsUpdate = true;
    }
  }

  // --- SAVE/LOAD (UPDATED) ---
  function getProjectData() {
    const charTx = controller.tilePos?.tx ?? Math.floor(gridWidth / 2);
    const charTz = controller.tilePos?.tz ?? Math.floor(gridHeight / 2);
    const markers = [...markedTiles.keys()].map(k => k.split(',').map(Number));

    // Serialize painted tile data from the new map
    const tiles = [];
    for (const [key, type] of paintedTileData.entries()) {
      const [tx, tz] = key.split(',').map(Number);
      tiles.push([tx, tz, type]);
    }

    // Serialize height data from the HeightTool
    const height = {
      value: currentHeightValue,
      pins: [...heightTool.pinned], // Save pinned tile keys
      field: Array.from(heightTool.heights) // Convert Float32Array to a plain array for JSON
    };

    return {
      version: 9, // Updated version for new format
      timestamp: Date.now(),
      grid: { width: gridWidth, height: gridHeight },
      character: { tx: charTx, tz: charTz },
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray()
      },
      settings: {
        freezeTapToMove: !!freezeTapToMove,
        markerMode: !!markerMode
      },
      markers,
      terrain: {
        tiles
      },
      height
    };
  }

  function applyProjectData(data) {
    const w = Math.max(2, Math.min(200, Number(data.grid.width) || 30));
    const h = Math.max(2, Math.min(200, Number(data.grid.height) || 30));
    regenerateWorld(w, h);

    const tx = Math.max(0, Math.min(w - 1, Number(data.character?.tx) ?? Math.floor(w / 2)));
    const tz = Math.max(0, Math.min(h - 1, Number(data.character?.tz) ?? Math.floor(h / 2)));
    controller.resetTo(tx, tz);

    paintingMode = false; currentPaintType = null; uiPanel.clearTerrainSelection();
    markerMode = false;  uiPanel.setMarkerToggle(false);
    heightMode = false;  pinMode = false;
    heightTool?.removeAllPins();

    clearAllMarkers();
    if (Array.isArray(data.markers)) {
      for (const [mx, mz] of data.markers) {
        if (Number.isFinite(mx) && Number.isFinite(mz)) addMarker(mx, mz);
      }
      controller.applyNonWalkables([...markedTiles.keys()]);
    }

    clearAllPainted();
    if (Array.isArray(data.terrain?.tiles)) {
      for (const [px, pz, type] of data.terrain.tiles) {
        if (Number.isFinite(px) && Number.isFinite(pz)) {
          paintTile(px, pz, type);
        }
      }
    }

    if (data.height && Array.isArray(data.height.field)) {
      if (data.height.field.length === heightTool.heights.length) {
        heightTool.heights.set(data.height.field);
        if (Array.isArray(data.height.pins)) {
          heightTool.pinned = new Set(data.height.pins);
        }
        currentHeightValue = Number(data.height.value) || 0;
        heightTool.applyHeightsToMesh();
      }
    }

    setFreeze(!!data.settings?.freezeTapToMove, false);

    if (Array.isArray(data.camera?.position) && Array.isArray(data.camera?.target)) {
      camera.position.fromArray(data.camera.position);
      controls.target.fromArray(data.camera.target);
      controls.update();
    }
  }

  // --- FREEZE HUD (RESTORED) ---
  function addFreezeToggle() {
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
        font: 600 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,sans-serif;
      }
      .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
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
      input:disabled + .slider { filter: grayscale(0.3); opacity: 0.65; cursor: not-allowed; }
    `;
    document.head.appendChild(style);

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

    freezeCheckboxEl = hud.querySelector('#freezeMoveToggle');
    freezeCheckboxEl.addEventListener('change', () => {
      if (markerMode || paintingMode || heightMode) {
        freezeCheckboxEl.checked = true;
        return;
      }
      freezeTapToMove = freezeCheckboxEl.checked;
    });
  }

  function setFreeze(on, disableUI) {
    freezeTapToMove = !!on;
    if (freezeCheckboxEl) {
      freezeCheckboxEl.checked = freezeTapToMove;
      freezeCheckboxEl.disabled = !!disableUI;
      freezeCheckboxEl.parentElement.title = disableUI
        ? 'Locked ON while Marker / Paint / Height mode is active'
        : 'Freeze tap-to-move';
    }
  }
};
