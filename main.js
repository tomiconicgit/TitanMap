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

  // -------- Water normals (LOCAL file) --------
  const WATER_NORMALS_URL = './textures/waternormals.jpg';
  const texLoader = new THREE.TextureLoader();
  const waterNormals = texLoader.load(WATER_NORMALS_URL, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });

  // Global time so ALL water tiles animate in sync
  let waterGlobalTime = 0;

  // ======== Procedural SAND (shared material) ========
  // Perlin noise (compact, deterministic) for texture generation
  class Perlin {
    constructor(seed = 1337) {
      this.p = new Uint8Array(512);
      const perm = new Uint8Array(256);
      let s = seed >>> 0;
      const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
      for (let i = 0; i < 256; i++) perm[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
      }
      for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    }
    fade(t){ return t*t*t*(t*(t*6-15)+10); }
    lerp(a,b,t){ return a+(b-a)*t; }
    grad(hash, x, y) {
      const h = hash & 3;
      const u = h < 2 ? x : y;
      const v = h < 2 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2*v : 2*v) * 0.5;
    }
    noise(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = this.fade(x), v = this.fade(y);
      const A = this.p[X] + Y, B = this.p[X+1] + Y;
      return this.lerp(
        this.lerp(this.grad(this.p[A], x, y), this.grad(this.p[B], x-1, y), u),
        this.lerp(this.grad(this.p[A+1], x, y-1), this.grad(this.p[B+1], x-1, y-1), u),
        v
      );
    }
  }

  // Config for dune direction & scales (tweak to taste)
  const SAND_WIND_DIR = Math.PI * 0.25; // 45°
  const SAND_NORMAL_SIZE = 512;         // generated normal map resolution
  const SAND_REPEAT = 6;                // repeats per world unit (affects world-space UV scaling)
  const SAND_COLOR = 0xD8C6A3;          // base sand albedo

  // Generate a directional-ripple sand normal map (DataTexture)
  function generateSandNormalMap(size = SAND_NORMAL_SIZE, windAngle = SAND_WIND_DIR) {
    const data = new Uint8Array(size * size * 4);
    const pRip = new Perlin(12345);
    const pMed = new Perlin(54321);
    const pFine = new Perlin(77777);

    // rotate coords to align ripples with wind
    const cosA = Math.cos(windAngle), sinA = Math.sin(windAngle);

    // multi-scale height field
    const hAt = (nx, ny) => {
      // rotate normalized coords
      const ax = nx * cosA + ny * sinA;
      const ay = -nx * sinA + ny * cosA;

      // elongated ripples (ax long, ay short), plus medium & fine detail
      const ripples = pRip.noise(ax * 28.0, ay * 9.0) * 1.3;
      const medium  = pMed.noise(nx * 10.0, ny * 10.0) * 0.35;
      const fine    = pFine.noise(nx * 65.0, ny * 65.0) * 0.15;
      return ripples + medium + fine;
    };

    const strength = 40; // normal intensity
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size, ny = y / size;

        // central height
        const h = hAt(nx, ny);

        // finite differences for slope
        const hL = hAt((x-1+size)%size/size, ny);
        const hR = hAt((x+1)%size/size, ny);
        const hU = hAt(nx, (y-1+size)%size/size);
        const hD = hAt(nx, (y+1)%size/size);

        const dx = hR - hL;
        const dy = hD - hU;

        const i = (y * size + x) * 4;
        data[i    ] = Math.max(0, Math.min(255, 128 + strength * dx)); // X
        data[i + 1] = Math.max(0, Math.min(255, 128 + strength * dy)); // Y
        data[i + 2] = 255;                                              // Z
        data[i + 3] = 255;
      }
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  // Subtle albedo variation map (optional)
  function generateSandAlbedo(size = 256, windAngle = SAND_WIND_DIR) {
    const data = new Uint8Array(size * size * 3);
    const p = new Perlin(424242);
    const cosA = Math.cos(windAngle), sinA = Math.sin(windAngle);
    const base = new THREE.Color(SAND_COLOR);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size, ny = y / size;
        const ax = nx * cosA + ny * sinA;
        const ay = -nx * sinA + ny * cosA;
        const v = 0.5 * p.noise(ax * 6.0, ay * 2.0) + 0.5; // [0..1]
        // brighten slightly on crests
        const c = base.clone().multiplyScalar(0.92 + v * 0.12);
        const i = (y * size + x) * 3;
        data[i] = Math.round(c.r * 255);
        data[i+1] = Math.round(c.g * 255);
        data[i+2] = Math.round(c.b * 255);
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  // Shared sand textures/material
  const SAND_NORMAL_TEX = generateSandNormalMap();
  const SAND_ALBEDO_TEX = generateSandAlbedo();
  const SAND_MATERIAL = new THREE.MeshStandardMaterial({
    color: 0xffffff,            // let the albedo map set the color
    map: SAND_ALBEDO_TEX,
    roughness: 0.95,
    metalness: 0.0,
    normalMap: SAND_NORMAL_TEX,
    normalScale: new THREE.Vector2(1.0, 1.0)
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
    setFreeze(false, /*disableUI*/ false);
  });

  // Terrain selection toggling
  uiPanel.panelElement.addEventListener('terrain-select', (e) => {
    const { type, active } = e.detail || {};
    if (!type) return;

    if (active) {
      // If marker mode is on, turn it off first
      if (markerMode) {
        markerMode = false;
        uiPanel.setMarkerToggle(false);
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
    if (freezeTapToMove) return;

    controller.moveTo(tx, tz);
  });

  // Camera follow + water ticking
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

    // Advance ONE global time, then apply to all water tiles
    waterGlobalTime += dt;
    if (waterTiles.size) {
      for (const w of waterTiles) {
        const u = w.material?.uniforms;
        if (u && u.time) u.time.value = waterGlobalTime;
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
    // These remain flat-color; sand is special and uses SAND_MATERIAL
    dirt:   new THREE.MeshStandardMaterial({ color: 0x6F451F, roughness: 0.95, metalness: 0.0, flatShading: true }),
    grass:  new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.9,  metalness: 0.0, flatShading: true }),
    stone:  new THREE.MeshStandardMaterial({ color: 0x7D7D7D, roughness: 1.0,  metalness: 0.0, flatShading: true }),
    gravel: new THREE.MeshStandardMaterial({ color: 0x9A9A9A, roughness: 0.95, metalness: 0.0, flatShading: true }),
    // water handled specially with Water() below
  };

  // Helpers to set world-space UVs so patterns are continuous across tiles
  function setWorldSpaceUVs(geo, tx, tz, scale = SAND_REPEAT) {
    // World edges of this 1×1 tile
    const center = tileToWorld(tx, tz, gridWidth, gridHeight);
    const x0 = center.x - 0.5, x1 = center.x + 0.5;
    const z0 = center.z - 0.5, z1 = center.z + 0.5;

    const uvs = new Float32Array([
      x0 * scale, z1 * scale,
      x1 * scale, z1 * scale,
      x0 * scale, z0 * scale,
      x1 * scale, z0 * scale
    ]);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  function createWaterTile(tx, tz) {
    const geo = new THREE.PlaneGeometry(1, 1);

    // world-space UVs for seamless normals
    const center = tileToWorld(tx, tz, gridWidth, gridHeight);
    const x0 = center.x - 0.5, x1 = center.x + 0.5;
    const z0 = center.z - 0.5, z1 = center.z + 0.5;
    const UV_SCALE = 1.0;
    const uvs = new Float32Array([
      x0 * UV_SCALE, z1 * UV_SCALE,
      x1 * UV_SCALE, z1 * UV_SCALE,
      x0 * UV_SCALE, z0 * UV_SCALE,
      x1 * UV_SCALE, z0 * UV_SCALE
    ]);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const water = new Water(geo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,                               // local texture, repeat-wrapped
      sunDirection: dirLight.position.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0x2066cc,
      distortionScale: 3.7,
      fog: !!scene.fog
    });

    // “Ocean” look: larger ripples
    if (water.material.uniforms.size) {
      water.material.uniforms.size.value = 10;
    }
    if (water.material.uniforms.time) {
      water.material.uniforms.time.value = waterGlobalTime;
    }

    water.rotation.x = -Math.PI / 2;
    water.position.set(center.x, 0.02, center.z);
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
      if (old.userData?.type === type) return;
      if (old.userData?.isWater) waterTiles.delete(old);
      terrainGroup.remove(old);
      old.geometry?.dispose?.();
      if (old.userData?.isWater) old.material?.dispose?.();
      paintedTiles.delete(key);
    }

    // WATER
    if (type === 'water') {
      const mesh = createWaterTile(tx, tz);
      terrainGroup.add(mesh);
      paintedTiles.set(key, mesh);
      waterTiles.add(mesh);
      return;
    }

    // SAND (procedural + seamless across tiles)
    if (type === 'sand') {
      const geo = new THREE.PlaneGeometry(1, 1);
      setWorldSpaceUVs(geo, tx, tz, SAND_REPEAT);
      const mesh = new THREE.Mesh(geo, SAND_MATERIAL);
      mesh.rotation.x = -Math.PI / 2;
      const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
      mesh.position.set(wp.x, 0.015, wp.z);
      mesh.name = `Tile_${key}_sand`;
      mesh.userData.type = 'sand';
      terrainGroup.add(mesh);
      paintedTiles.set(key, mesh);
      return;
    }

    // Other solid tile types (flat)
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = MATERIALS[type] || MATERIALS.gravel;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
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

    return {
      version: 10,
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
        paintingMode: false, // always OFF on save
        selected: null,
        tiles,
        // store sand/wind config in case you want to tweak later
        sand: { windDir: SAND_WIND_DIR, repeat: SAND_REPEAT }
      }
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

    // Restore freeze
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
      // While marking or painting, freeze is locked ON — ignore manual changes
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