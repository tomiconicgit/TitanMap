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
  let gridGroup, groundPlane;

  // Freeze toggle (top-left HUD)
  let freezeTapToMove = false;
  let freezeCheckboxEl = null;

  // Marker Mode
  let markerMode = false;
  const markerGroup = new THREE.Group();
  markerGroup.name = 'MarkerLayer';
  const markedTiles = new Map(); // key "x,y" -> mesh

  // Terrain Painting Mode
  let paintingMode = false;
  let currentPaintType = null; // 'sand'|'dirt'|'grass'|'stone'|'gravel'|'water'|null
  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'TerrainPaint';
  const paintedTiles = new Map(); // key -> mesh
  const waterTiles = new Set();   // track Water meshes to tick their time

  // Height tool state
  let heightMode = false;
  let pinMode = false;
  let currentHeightValue = 0;
  let heightTool = null;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);
  scene.add(markerGroup);
  scene.add(terrainGroup);

  // Character & controller
  const character = createCharacter();
  const controller = new CharacterController(character, 0, 0);
  scene.add(character);

  // Viewport & camera
  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // -------- Shared Water normals texture (local file) --------
  const WATER_NORMALS_URL = './textures/waternormals.jpg';
  const waterNormals = new THREE.TextureLoader().load(WATER_NORMALS_URL, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });

  // World generation
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

    // Clear markers & painted tiles on grid change
    clearAllMarkers();
    clearAllPainted();

    // Init/Reset height tool
    if (!heightTool) heightTool = new HeightTool(scene, paintedTiles, width, height);
    else heightTool.reset(width, height);

    controller.updateGridSize(width, height);

    const cTx = Math.floor(width / 2);
    const cTz = Math.floor(height / 2);
    controller.resetTo(cTx, cTz);

    const center = tileToWorld(cTx, cTz, width, height);
    controls.target.copy(center);
    camera.position.set(center.x + 2, 6, center.z + 8);
    controls.update();
  }

  // UI Panel
  const uiPanel = new UIPanel(document.body);

  // Grid generate handler
  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  // When Terrain tab is opened: ensure NO selection and turn painting OFF + unfreeze
  uiPanel.panelElement.addEventListener('terrain-tab-opened', () => {
    if (paintingMode) {
      paintingMode = false;
      currentPaintType = null;
    }
    uiPanel.clearTerrainSelection();
    if (!heightMode && !markerMode) setFreeze(false, /*disableUI*/ false);
  });

  // Terrain selection toggling
  uiPanel.panelElement.addEventListener('terrain-select', (e) => {
    const { type, active } = e.detail || {};
    if (!type) return;

    if (active) {
      // If marker or height mode is on, turn them off first
      if (markerMode) { markerMode = false; uiPanel.setMarkerToggle(false); }
      if (heightMode) {
        heightMode = false; pinMode = false;
        heightTool?.removeAllPins();
      }
      currentPaintType = type;
      paintingMode = true;
      setFreeze(true, /*disableUI*/ true); // freeze move while painting
    } else {
      // stop painting
      paintingMode = false;
      currentPaintType = null;
      setFreeze(false, /*disableUI*/ false);
    }
  });

  // ===== Marker Mode drives Freeze =====
  uiPanel.panelElement.addEventListener('marker-toggle-request', (e) => {
    const { wantOn } = e.detail || {};
    if (wantOn) {
      // If painting or height, stop them first
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
      setFreeze(true, /*disableUI*/ true);
    } else {
      markerMode = false;
      controller.applyNonWalkables([...markedTiles.keys()]);
      setFreeze(false, /*disableUI*/ false);
    }
  });

  // ===== Height tool wiring =====
  uiPanel.panelElement.addEventListener('height-tab-opened', () => {
    // no-op (keep current value)
  });

  // Toggle 1: Height Mode
  uiPanel.panelElement.addEventListener('height-toggle-request', (e) => {
    const { wantOn } = e.detail || {};
    heightMode = !!wantOn;

    if (heightMode) {
      // turn off other modes
      if (markerMode) { markerMode = false; uiPanel.setMarkerToggle(false); }
      if (paintingMode) { paintingMode = false; currentPaintType = null; uiPanel.clearTerrainSelection(); }
      setFreeze(true, /*disableUI*/ true);
    } else {
      // Exiting height mode: clear pin highlights and unfreeze
      pinMode = false;
      heightTool?.removeAllPins();
      setFreeze(false, /*disableUI*/ false);
    }
  });

  // Toggle 2: Pin Mode
  uiPanel.panelElement.addEventListener('pin-toggle-request', (e) => {
    const { wantOn } = e.detail || {};
    pinMode = !!wantOn;
    // While pin mode is ON, taps toggle green highlights; heights are not applied.
  });

  // Height numeric value
  uiPanel.panelElement.addEventListener('height-set', (e) => {
    const { value } = e.detail || {};
    if (Number.isFinite(value)) currentHeightValue = Math.max(-50, Math.min(50, value | 0));
  });

  // SAVE (now includes painted tiles + heightfield)
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

  // LOAD
  uiPanel.panelElement.addEventListener('load-project-data', (e) => {
    const { data } = e.detail || {};
    if (!data || !data.grid) { alert('Invalid save file.'); return; }
    applyProjectData(data);
  });

  // Tap/Drag handling
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const downPos = new THREE.Vector2();
  const canvas = viewport.renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => { downPos.set(e.clientX, e.clientY); });
  canvas.addEventListener('pointerup', (e) => {
    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return; // ignore drags

    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(groundPlane, false);
    if (hit.length === 0) return;

    const { tx, tz } = worldToTile(hit[0].point, gridWidth, gridHeight);

    if (markerMode) { addMarker(tx, tz); return; }
    if (paintingMode && currentPaintType) { paintTile(tx, tz, currentPaintType); return; }

    // Height tool behavior
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

  // Camera follow + water tick
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

    // Tick all water tiles
    if (waterTiles.size) {
      for (const w of waterTiles) {
        const u = w.material?.uniforms;
        if (u && u.time) u.time.value += dt;
      }
    }

    controls.update();
  };

  // Boot
  addFreezeToggle();
  regenerateWorld(30, 30);

  // -------- Marker helpers --------
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

  // -------- Terrain painting --------
  const MATERIALS = {
    sand:   new THREE.MeshStandardMaterial({ color: 0xD8C6A3, roughness: 0.95, metalness: 0.0, flatShading: true }),
    dirt:   new THREE.MeshStandardMaterial({ color: 0x6F451F, roughness: 0.95, metalness: 0.0, flatShading: true }),
    grass:  new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.9,  metalness: 0.0, flatShading: true }),
    stone:  new THREE.MeshStandardMaterial({ color: 0x7D7D7D, roughness: 1.0,  metalness: 0.0, flatShading: true }),
    gravel: new THREE.MeshStandardMaterial({ color: 0x9A9A9A, roughness: 0.95, metalness: 0.0, flatShading: true }),
    // water handled specially
  };

  function createWaterTile(tx, tz) {
    // 1×1 tile water using three/examples/jsm/objects/Water
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
    water.position.set(wp.x, 0.02, wp.z);

    // Make ripples "larger" like the example (size ~= wavelength)
    if (water.material.uniforms.size) {
      water.material.uniforms.size.value = 10.0; // was 0.8
    }

    water.userData.type = 'water';
    water.userData.isWater = true;
    water.name = `Water_${tx},${tz}`;
    return water;
  }

  function paintTile(tx, tz, type) {
    if (tx < 0 || tx >= gridWidth || tz < 0 || tz >= gridHeight) return;
    const key = tileKey(tx, tz);

    // Remove/replace existing mesh if present
    const old = paintedTiles.get(key);
    if (old) {
      if (old.userData?.type === type) return; // same type
      if (old.userData?.isWater) waterTiles.delete(old);

      terrainGroup.remove(old);
      old.geometry?.dispose?.();
      if (old.userData?.isWater) old.material?.dispose?.();
      paintedTiles.delete(key);
    }

    let mesh;
    if (type === 'water') {
      mesh = createWaterTile(tx, tz);
      terrainGroup.add(mesh);
      paintedTiles.set(key, mesh);
      waterTiles.add(mesh);
    } else {
      const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
      const mat = MATERIALS[type] || MATERIALS.sand;
      mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
      mesh.position.set(wp.x, 0.015, wp.z);
      mesh.name = `Tile_${key}_${type}`;
      mesh.userData.type = type;

      // Apply existing heightfield to this new tile so it fits neighbors
      heightTool?.refreshTile(tx, tz);

      terrainGroup.add(mesh);
      paintedTiles.set(key, mesh);
    }
  }

  function clearAllPainted() {
    for (const [, mesh] of paintedTiles) {
      terrainGroup.remove(mesh);
      mesh.geometry?.dispose?.();
      if (mesh.userData?.isWater) mesh.material?.dispose?.();
    }
    paintedTiles.clear();
    waterTiles.clear();
  }

  // -------- Save/Load helpers --------
  function getProjectData() {
    const charTx = controller.tilePos?.tx ?? Math.floor(gridWidth / 2);
    const charTz = controller.tilePos?.tz ?? Math.floor(gridHeight / 2);
    const markers = [...markedTiles.keys()].map(k => k.split(',').map(Number));

    // Serialize painted tiles as [x, y, type]
    const tiles = [];
    for (const [key, mesh] of paintedTiles) {
      const [xStr, yStr] = key.split(',');
      const tx = Number(xStr), tz = Number(yStr);
      const t = mesh?.userData?.type;
      if (Number.isFinite(tx) && Number.isFinite(tz) && typeof t === 'string') {
        tiles.push([tx, tz, t]);
      }
    }

    // Height save: corner heightfield + pins + current value
    const height = {
      value: currentHeightValue,
      pins: [...(heightTool?.pinned ?? [])].map(k => k.split(',').map(Number)),
      width: gridWidth,
      height: gridHeight,
      field: Array.from(heightTool?.heights ?? []) // Float32Array -> plain array
    };

    return {
      version: 8,
      timestamp: Date.now(),
      grid: { width: gridWidth, height: gridHeight },
      character: { tx: charTx, tz: charTz },
      camera: {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z]
      },
      settings: {
        freezeTapToMove: !!freezeTapToMove,
        markerMode: !!markerMode
      },
      markers,
      terrain: {
        paintingMode: false, // always OFF on save/load
        selected: null,
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

    // Modes OFF after load
    paintingMode = false; currentPaintType = null; uiPanel.clearTerrainSelection();
    markerMode = false;  uiPanel.setMarkerToggle(false);
    heightMode = false;  pinMode = false;
    heightTool?.removeAllPins();

    // Restore markers
    clearAllMarkers();
    if (Array.isArray(data.markers)) {
      for (const pair of data.markers) {
        if (Array.isArray(pair) && pair.length === 2) {
          const mx = Number(pair[0]), mz = Number(pair[1]);
          if (Number.isFinite(mx) && Number.isFinite(mz)) addMarker(mx, mz);
        }
      }
      controller.applyNonWalkables([...markedTiles.keys()]);
    }

    // Restore painted tiles
    clearAllPainted();
    const tiles = data.terrain?.tiles;
    if (Array.isArray(tiles)) {
      for (const t of tiles) {
        if (!Array.isArray(t) || t.length < 3) continue;
        const px = Number(t[0]), pz = Number(t[1]);
        const type = String(t[2]);
        if (Number.isFinite(px) && Number.isFinite(pz)) {
          paintTile(px, pz, type);
        }
      }
    }

    // Restore heightfield if present and size matches
    if (data.height && Array.isArray(data.height.field)) {
      const savedW = Number(data.height.width) || w;
      const savedH = Number(data.height.height) || h;
      if (savedW === w && savedH === h) {
        const src = data.height.field;
        const dst = heightTool.heights;
        const n = Math.min(dst.length, src.length);
        for (let i = 0; i < n; i++) dst[i] = Number(src[i]) || 0;
        // restore pins (overlay will show after you enter height mode again; we don't toggle it on load)
        if (Array.isArray(data.height.pins)) {
          heightTool.removeAllPins(); // clears and overlay meshes
          for (const pair of data.height.pins) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const px = Number(pair[0]), pz = Number(pair[1]);
            if (Number.isFinite(px) && Number.isFinite(pz)) {
              // don't create overlays now (stay hidden after load) — keep data only
              heightTool.pinned.add(tileKey(px, pz));
            }
          }
        }
        currentHeightValue = Number(data.height.value) || 0;
        // re-apply heights to any painted tiles
        heightTool.refreshAllPainted();
      }
    }

    // Restore freeze (kept OFF unless explicitly saved ON)
    setFreeze(!!data.settings?.freezeTapToMove, /*disableUI*/ false);

    // Camera
    if (Array.isArray(data.camera?.position) && Array.isArray(data.camera?.target)) {
      const [cx, cy, cz] = data.camera.position;
      const [txx, tyy, tzz] = data.camera.target;
      if ([cx, cy, cz].every(Number.isFinite) && [txx, tyy, tzz].every(Number.isFinite)) {
        camera.position.set(cx, cy, cz);
        controls.target.set(txx, tyy, tzz);
        controls.update();
      }
    } else {
      const center = tileToWorld(tx, tz, w, h);
      controls.target.copy(center);
      camera.position.set(center.x + 2, 6, center.z + 8);
      controls.update();
    }
  }

  // -------- Freeze HUD (top-left) --------
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
      // While marking, painting, or height editing, freeze is locked ON
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