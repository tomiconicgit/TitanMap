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

window.onload = function () {
  let gridWidth, gridHeight;
  let gridGroup, groundPlane;

  // Freeze HUD
  let freezeTapToMove = false;
  let freezeCheckboxEl = null;

  // Marker mode
  let markerMode = false;
  const markerGroup = new THREE.Group();
  markerGroup.name = 'MarkerLayer';
  const markedTiles = new Map(); // "x,y" -> mesh

  // Terrain paint mode
  let paintingMode = false;
  let currentPaintType = null; // 'sand'|'dirt'|'grass'|'stone'|'gravel'|'water'|null
  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'TerrainPaint';
  const paintedTiles = new Map(); // "x,y" -> mesh
  const waterTiles = new Set();   // Water meshes to tick

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight, markerGroup, terrainGroup);

  // Character + controller
  const character = createCharacter();
  const controller = new CharacterController(character, 0, 0);
  scene.add(character);

  // Viewport & camera
  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // -------- Water normals (LOCAL) --------
  // Place the file at: /textures/waternormals.jpg (relative to index.html)
  const waterNormals = new THREE.TextureLoader().load('./textures/waternormals.jpg', (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });

  // -------- Procedural SAND (shared textures & material) --------
  // Wind direction for dunes (radians): 45deg looks nice
  const SAND_WIND_DIR = Math.PI * 0.25;
  // World-space repeat density (# of texture repeats per world unit)
  // Lower number = larger dunes; tweak to taste.
  const SAND_REPEAT = 0.35;
  // Normal texture size (power of two)
  const SAND_NORMAL_SIZE = 512;

  // hash-based 2D value noise (fast & deterministic for our albedo/normal)
  function hash2(x, y) {
    // deterministic float 0..1
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }
  function valueNoise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi,       yf = y - yi;
    const u = xf*xf*(3 - 2*xf);
    const v = yf*yf*(3 - 2*yf);

    const a = hash2(xi,     yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi,     yi + 1);
    const d = hash2(xi + 1, yi + 1);

    const i1 = a + (b - a) * u;
    const i2 = c + (d - c) * u;
    return i1 + (i2 - i1) * v; // 0..1
  }
  function fbm2(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let amp = 0.5, freq = 1.0, sum = 0.0, norm = 0.0;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / Math.max(1e-6, norm); // ~0..1
  }

  // Build an sRGB albedo data texture with directional dunes
  function generateSandAlbedo(size = 256, windAngle = SAND_WIND_DIR) {
    const data = new Uint8Array(size * size * 3);

    // base colors (light & dark sand)
    const baseA = new THREE.Color(0xE0C79C); // lighter
    const baseB = new THREE.Color(0xC9B084); // darker

    // rotate coords to align ripples with wind
    const cosA = Math.cos(windAngle);
    const sinA = Math.sin(windAngle);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;

        // directional coords
        const dx = nx * cosA + ny * sinA;
        const dy = -nx * sinA + ny * cosA;

        // dunes: stretched fbm along wind direction to create long bands
        const dunes = fbm2(dx * 8.0, dy * 2.5, 5, 2.0, 0.5);       // 0..1
        // micro ripples
        const ripples = fbm2(dx * 40.0, dy * 10.0, 3, 2.5, 0.55);  // 0..1
        // grains noise
        const grains = fbm2(nx * 120.0, ny * 120.0, 2, 2.0, 0.6);  // 0..1

        // combine
        let tone = dunes * 0.55 + ripples * 0.35 + grains * 0.10;  // 0..1
        tone = Math.min(1, Math.max(0, (tone - 0.35) * 1.25 + 0.5));

        const col = baseB.clone().lerp(baseA, tone);
        const idx = (y * size + x) * 3;
        data[idx + 0] = Math.round(col.r * 255);
        data[idx + 1] = Math.round(col.g * 255);
        data[idx + 2] = Math.round(col.b * 255);
      }
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    // IMPORTANT: Albedo/baseColor must be sRGB in r168
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // Build a normal map from a synthetic height (derived from the same fields)
  function generateSandNormalMap(size = SAND_NORMAL_SIZE, windAngle = SAND_WIND_DIR) {
    const data = new Uint8Array(size * size * 4);
    const cosA = Math.cos(windAngle);
    const sinA = Math.sin(windAngle);

    // sample height
    function h(xx, yy) {
      const dx = xx * cosA + yy * sinA;
      const dy = -xx * sinA + yy * cosA;
      const dunes = fbm2(dx * 8.0, dy * 2.5, 5, 2.0, 0.5);
      const ripples = fbm2(dx * 40.0, dy * 10.0, 3, 2.5, 0.55);
      const micro = fbm2(xx * 90.0,  yy * 90.0, 2, 2.0, 0.65);
      // height in 0..1
      return dunes * 0.7 + ripples * 0.25 + micro * 0.05;
    }

    // derive normal from height by central difference
    const s = 1.0 / size;
    const strength = 2.0; // increase for deeper grooves

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;

        const hL = h(nx - s, ny);
        const hR = h(nx + s, ny);
        const hD = h(nx, ny - s);
        const hU = h(nx, ny + s);

        const dx = (hR - hL) * strength;
        const dy = (hU - hD) * strength;

        // tangent-space normal (x,y,z)
        const n = new THREE.Vector3(-dx, -dy, 1.0).normalize();

        const idx = (y * size + x) * 4;
        data[idx + 0] = Math.round((n.x * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    // normal maps stay in linear space (NO colorSpace change)
    tex.needsUpdate = true;
    return tex;
  }

  const SAND_ALBEDO_TEX = generateSandAlbedo(256, SAND_WIND_DIR);
  const SAND_NORMAL_TEX = generateSandNormalMap(SAND_NORMAL_SIZE, SAND_WIND_DIR);
  const SAND_MATERIAL = new THREE.MeshStandardMaterial({
    color: 0xffffff, // map drives color
    map: SAND_ALBEDO_TEX,
    normalMap: SAND_NORMAL_TEX,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.92,
    metalness: 0.0
  });

  // Set UVs so sand tiles share one big world-aligned pattern
  function setWorldSpaceUVs(geometry, worldCenter, repeat = SAND_REPEAT) {
    // PlaneGeometry is in XY; after mesh.rotation.x = -PI/2, XY maps to XZ world
    const pos = geometry.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i); // local x
      const ly = pos.getY(i); // local y (will become world 'z' after rotation)
      const u = (worldCenter.x + lx) * repeat;
      const v = (worldCenter.z + ly) * repeat;
      uvs[i * 2 + 0] = u;
      uvs[i * 2 + 1] = v;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  // -------- World generation --------
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

    clearAllMarkers();
    clearAllPainted();
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

  // Grid generate
  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  // When Terrain tab opened: clear selection and ensure painting off + unfreeze
  uiPanel.panelElement.addEventListener('terrain-tab-opened', () => {
    if (paintingMode) {
      paintingMode = false;
      currentPaintType = null;
    }
    uiPanel.clearTerrainSelection();
    setFreeze(false, /*disableUI*/ false);
  });

  // Terrain selection toggle
  uiPanel.panelElement.addEventListener('terrain-select', (e) => {
    const { type, active } = e.detail || {};
    if (!type) return;

    if (active) {
      if (markerMode) {
        markerMode = false;
        uiPanel.setMarkerToggle(false);
      }
      currentPaintType = type;
      paintingMode = true;
      setFreeze(true, /*disableUI*/ true); // lock freeze while painting
    } else {
      paintingMode = false;
      currentPaintType = null;
      setFreeze(false, /*disableUI*/ false);
    }
  });

  // Marker toggle drives freeze
  uiPanel.panelElement.addEventListener('marker-toggle-request', (e) => {
    const { wantOn } = e.detail || {};
    if (wantOn) {
      if (paintingMode) {
        paintingMode = false;
        currentPaintType = null;
        uiPanel.clearTerrainSelection();
      }
      markerMode = true;
      setFreeze(true, /*disableUI*/ true);
    } else {
      markerMode = false;
      controller.applyNonWalkables([...markedTiles.keys()]);
      setFreeze(false, /*disableUI*/ false);
    }
  });

  // SAVE (includes markers + painted tiles)
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

  // Tap handling
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
    if (freezeTapToMove) return;

    controller.moveTo(tx, tz);
  });

  // Follow + water tick
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

    // tick water shader time
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
    // sand handled with SAND_MATERIAL + world-space UVs
    dirt:   new THREE.MeshStandardMaterial({ color: 0x6F451F, roughness: 0.95, metalness: 0.0, flatShading: true }),
    grass:  new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.9,  metalness: 0.0, flatShading: true }),
    stone:  new THREE.MeshStandardMaterial({ color: 0x7D7D7D, roughness: 1.0,  metalness: 0.0, flatShading: true }),
    gravel: new THREE.MeshStandardMaterial({ color: 0x9A9A9A, roughness: 0.95, metalness: 0.0, flatShading: true }),
  };

  function createWaterTile(tx, tz) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const w = new Water(geo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: dirLight.position.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0x2066cc,
      distortionScale: 1.85,
      fog: !!scene.fog
    });
    w.rotation.x = -Math.PI / 2;
    const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
    w.position.set(wp.x, 0.02, wp.z);

    // stronger ripples like the example (size ~ 10)
    if (w.material.uniforms.size) {
      w.material.uniforms.size.value = 10.0;
    }

    w.userData.type = 'water';
    w.userData.isWater = true;
    w.name = `Water_${tx},${tz}`;
    return w;
  }

  function paintTile(tx, tz, type) {
    if (tx < 0 || tx >= gridWidth || tz < 0 || tz >= gridHeight) return;
    const key = tileKey(tx, tz);

    // Replace existing
    const old = paintedTiles.get(key);
    if (old) {
      if (old.userData?.isWater) waterTiles.delete(old);
      terrainGroup.remove(old);
      old.geometry?.dispose?.();
      if (old.userData?.isWater) old.material?.dispose?.();
      paintedTiles.delete(key);
    }

    if (type === 'water') {
      const mesh = createWaterTile(tx, tz);
      terrainGroup.add(mesh);
      paintedTiles.set(key, mesh);
      waterTiles.add(mesh);
      return;
    }

    const geo = new THREE.PlaneGeometry(1, 1);
    const wp = tileToWorld(tx, tz, gridWidth, gridHeight);

    let mat;
    if (type === 'sand') {
      // world-space UVs so adjacent tiles share the same dunes
      setWorldSpaceUVs(geo, wp, SAND_REPEAT);
      mat = SAND_MATERIAL;
    } else {
      mat = MATERIALS[type] || MATERIALS.dirt;
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(wp.x, 0.015, wp.z);
    mesh.name = `Tile_${key}_${type}`;
    mesh.userData.type = type;

    terrainGroup.add(mesh);
    paintedTiles.set(key, mesh);
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

  // -------- Save/Load --------
  function getProjectData() {
    const charTx = controller.tilePos?.tx ?? Math.floor(gridWidth / 2);
    const charTz = controller.tilePos?.tz ?? Math.floor(gridHeight / 2);
    const markers = [...markedTiles.keys()].map(k => k.split(',').map(Number));
    const tiles = [];
    for (const [key, mesh] of paintedTiles) {
      const [xStr, yStr] = key.split(',');
      const tx = Number(xStr), tz = Number(yStr);
      const t = mesh?.userData?.type;
      if (Number.isFinite(tx) && Number.isFinite(tz) && typeof t === 'string') {
        tiles.push([tx, tz, t]);
      }
    }
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
      terrain: { tiles }
    };
  }

  function applyProjectData(data) {
    const w = Math.max(2, Math.min(200, Number(data.grid.width) || 30));
    const h = Math.max(2, Math.min(200, Number(data.grid.height) || 30));
    regenerateWorld(w, h);

    const tx0 = Math.max(0, Math.min(w - 1, Number(data.character?.tx) ?? Math.floor(w / 2)));
    const tz0 = Math.max(0, Math.min(h - 1, Number(data.character?.tz) ?? Math.floor(h / 2)));
    controller.resetTo(tx0, tz0);

    // modes OFF after load
    paintingMode = false; currentPaintType = null; uiPanel.clearTerrainSelection();
    markerMode = false;  uiPanel.setMarkerToggle(false);

    // markers
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

    // painted tiles
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

    setFreeze(!!data.settings?.freezeTapToMove, /*disableUI*/ false);

    if (Array.isArray(data.camera?.position) && Array.isArray(data.camera?.target)) {
      const [cx, cy, cz] = data.camera.position;
      const [txx, tyy, tzz] = data.camera.target;
      if ([cx, cy, cz].every(Number.isFinite) && [txx, tyy, tzz].every(Number.isFinite)) {
        camera.position.set(cx, cy, cz);
        controls.target.set(txx, tyy, tzz);
        controls.update();
      }
    } else {
      const center = tileToWorld(tx0, tz0, w, h);
      controls.target.copy(center);
      camera.position.set(center.x + 2, 6, center.z + 8);
      controls.update();
    }
  }

  // -------- Freeze HUD --------
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
      if (markerMode || paintingMode) {
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
        ? 'Locked ON while Marker or Paint Mode is active'
        : 'Freeze tap-to-move';
    }
  }
};