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

// -----------------------------------------------------------------------------
// High-level notes
// - Flat editing, pathfinding and painting remain as before.
// - New Height tool sculpts a shared vertex height field (heightGrid).
//   We render it as a single deformable mesh (terrainMesh) with w×h segments.
// - Pin mode (green tiles) prevents those tiles' corners from moving. Any height
//   differences along edges to non-pinned neighbors get a vertical "wall" quad.
// - Height step is 0.2, range [-50, 50]. Saved to file along with pins.
// -----------------------------------------------------------------------------

window.onload = function () {
  let gridWidth, gridHeight;
  let gridGroup;               // lines
  let groundPlane;             // invisible input plane (kept flat for simple tile picking)
  let terrainMesh;             // sculptable mesh driven by heightGrid
  let cliffGroup;              // holds the vertical walls along discontinuities

  // Shared discrete height field at grid vertices (size: (w+1) × (h+1))
  // heightGrid[vx][vz] in world units (meters)
  let heightGrid = [];         // created on regenerateWorld
  const HEIGHT_STEP = 0.2;     // requested finer steps
  const HEIGHT_MIN  = -50.0;
  const HEIGHT_MAX  = +50.0;

  // Pin state per tile (w × h) — green-highlighted tiles
  // pinTiles[tx][tz] = true|false
  let pinTiles = [];

  // Painting
  let paintingMode = false;
  let currentPaintType = null; // 'sand'|'dirt'|'grass'|'stone'|'gravel'|'water'|null
  const terrainGroup = new THREE.Group(); // container for painted tiles & water tiles
  terrainGroup.name = 'TerrainPaint';
  const paintedTiles = new Map(); // "tx,tz" -> mesh
  const waterTiles = new Set();   // Water() meshes to tick time

  // Height tool
  let heightMode = false;  // toggle #1 (enables sculpting, auto-freezes move)
  let pinMode = false;     // toggle #2 (select green pinned tiles)
  let desiredHeight = 0;   // UI-selected height value

  // Marker mode (unchanged)
  let markerMode = false;
  const markerGroup = new THREE.Group();
  markerGroup.name = 'MarkerLayer';
  const markedTiles = new Map(); // "tx,tz" -> mesh

  // Freeze toggle (top-left HUD)
  let freezeTapToMove = false;
  let freezeCheckboxEl = null;

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

  // Water normals (local path — you said you have it)
  const WATER_NORMALS_URL = './textures/waternormals.jpg';
  const waterNormals = new THREE.TextureLoader().load(WATER_NORMALS_URL, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });

  // ---------- World regen ----------
  function make2D(w, h, fill = 0) {
    const a = new Array(w);
    for (let x = 0; x < w; x++) {
      a[x] = new Array(h);
      for (let y = 0; y < h; y++) a[x][y] = fill;
    }
    return a;
  }

  function regenerateWorld(width, height) {
    gridWidth = width|0;
    gridHeight = height|0;

    // remove old
    if (gridGroup) scene.remove(gridGroup);
    if (groundPlane) scene.remove(groundPlane);
    if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); }
    if (cliffGroup) { scene.remove(cliffGroup); cliffGroup.clear(); }

    gridGroup = createGrid(gridWidth, gridHeight);
    scene.add(gridGroup);

    // Flat picking plane (always flat for simple tile math)
    groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(gridWidth, gridHeight),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })
    );
    groundPlane.name = 'TapPlane';
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.set(0, 0, 0);
    groundPlane.frustumCulled = false;
    scene.add(groundPlane);

    // Height grid & pins reset
    heightGrid = make2D(gridWidth + 1, gridHeight + 1, 0);
    pinTiles   = make2D(gridWidth, gridHeight, false);

    // Sculptable mesh (w×h segments, 1m per tile)
    terrainMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(gridWidth, gridHeight, gridWidth, gridHeight),
      new THREE.MeshStandardMaterial({
        color: 0x24262b,
        roughness: 1.0,
        metalness: 0.0,
        side: THREE.DoubleSide,
        flatShading: true
      })
    );
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.position.set(0, 0, 0);
    terrainMesh.receiveShadow = true;
    terrainMesh.name = 'SculptMesh';
    scene.add(terrainMesh);

    // Vertical “cliff” quads live here
    cliffGroup = new THREE.Group();
    cliffGroup.name = 'Cliffs';
    scene.add(cliffGroup);

    // Clear overlays
    clearAllMarkers();
    clearAllPainted();

    // Controller + camera to center
    controller.updateGridSize(gridWidth, gridHeight);
    const cTx = Math.floor(gridWidth / 2);
    const cTz = Math.floor(gridHeight / 2);
    controller.resetTo(cTx, cTz);

    const center = tileToWorld(cTx, cTz, gridWidth, gridHeight);
    controls.target.copy(center);
    camera.position.set(center.x + 2, 6, center.z + 8);
    controls.update();

    // Sync mesh vertices from (all-zero) heightGrid
    applyHeightGridToMesh();
    rebuildCliffsAll();
  }

  // ---------- UI ----------
  const uiPanel = new UIPanel(document.body);

  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  // Terrain Tab
  uiPanel.panelElement.addEventListener('terrain-tab-opened', () => {
    // stop painting & unfreeze
    if (paintingMode) { paintingMode = false; currentPaintType = null; }
    uiPanel.clearTerrainSelection();
    setFreeze(false, false);
  });

  uiPanel.panelElement.addEventListener('terrain-select', (e) => {
    const { type, active } = e.detail || {};
    if (!type) return;
    if (active) {
      // stop other modes
      if (markerMode) { markerMode = false; uiPanel.setMarkerToggle(false); }
      if (heightMode) { setHeightMode(false); }
      currentPaintType = type;
      paintingMode = true;
      setFreeze(true, true);
    } else {
      paintingMode = false;
      currentPaintType = null;
      setFreeze(false, false);
    }
  });

  // Marker Mode
  uiPanel.panelElement.addEventListener('marker-toggle-request', (e) => {
    const { wantOn } = e.detail || {};
    if (wantOn) {
      // cancel paint & height
      if (paintingMode) { paintingMode = false; currentPaintType = null; uiPanel.clearTerrainSelection(); }
      if (heightMode)   { setHeightMode(false); }
      markerMode = true;
      setFreeze(true, true);
    } else {
      markerMode = false;
      controller.applyNonWalkables([...markedTiles.keys()]);
      setFreeze(false, false);
    }
  });

  // Height Tab
  uiPanel.panelElement.addEventListener('height-mode-toggle', (e) => {
    const { on } = e.detail || {};
    setHeightMode(!!on);
  });

  uiPanel.panelElement.addEventListener('height-pin-toggle', (e) => {
    pinMode = !!(e.detail?.on);
    // When entering Pin mode we keep Height mode ON, but taps only toggle pins.
  });

  uiPanel.panelElement.addEventListener('height-change', (e) => {
    // Expected: { value } numeric, clamped step of 0.2
    let v = Number(e.detail?.value ?? 0);
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, v));
    // Snap to 0.2 step to prevent tiny floating errors
    desiredHeight = Math.round(v / HEIGHT_STEP) * HEIGHT_STEP;
    uiPanel.setHeightDisplay(desiredHeight);
  });

  // Save / Load
  uiPanel.panelElement.addEventListener('save-project', () => {
    const data = getProjectData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'titanmap.json';
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

  // ---------- Pointer / Tap ----------
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

    // Height tool first (it also freezes move)
    if (heightMode) {
      if (pinMode) { togglePin(tx, tz); return; }
      setTileHeight(tx, tz, desiredHeight);
      return;
    }

    // Marker tool
    if (markerMode) { addMarker(tx, tz); return; }

    // Painting tool
    if (paintingMode && currentPaintType) { paintTile(tx, tz, currentPaintType); return; }

    if (freezeTapToMove) return;

    controller.moveTo(tx, tz);
  });

  // ---------- Camera follow ----------
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

    // Tick water tiles
    if (waterTiles.size) {
      for (const w of waterTiles) {
        const u = w.material?.uniforms;
        if (u && u.time) u.time.value += dt;
      }
    }

    controls.update();
  };

  // ---------- Boot ----------
  addFreezeToggle();
  regenerateWorld(30, 30);

  // =====================================================================
  // Marker helpers (unchanged)
  // =====================================================================
  function tileKey(x, y) { return `${x},${y}`; }

  function addMarker(tx, tz) {
    if (!inBoundsTile(tx, tz)) return;
    const key = tileKey(tx, tz);
    if (markedTiles.has(key)) return;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
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

  // =====================================================================
  // Terrain painting
  // =====================================================================
  const MATERIALS = {
    sand:   new THREE.MeshStandardMaterial({ color: 0xD8C6A3, roughness: 0.95, metalness: 0.0, flatShading: true, transparent: true, opacity: 0.98 }),
    dirt:   new THREE.MeshStandardMaterial({ color: 0x6F451F, roughness: 0.95, metalness: 0.0, flatShading: true, transparent: true, opacity: 0.98 }),
    grass:  new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.9,  metalness: 0.0, flatShading: true, transparent: true, opacity: 0.98 }),
    stone:  new THREE.MeshStandardMaterial({ color: 0x7D7D7D, roughness: 1.0,  metalness: 0.0, flatShading: true, transparent: true, opacity: 0.98 }),
    gravel: new THREE.MeshStandardMaterial({ color: 0x9A9A9A, roughness: 0.95, metalness: 0.0, flatShading: true, transparent: true, opacity: 0.98 }),
  };

  function createWaterTile(tx, tz) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const water = new Water(geo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: dirLight.position.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0x2066cc,
      distortionScale: 1.85,
      fog: !!scene.fog
    });
    water.rotation.x = -Math.PI / 2;
    const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
    // Elevate water slightly above sculpt mesh at that tile center height
    const centerY = averageTileCornersHeight(tx, tz);
    water.position.set(wp.x, centerY + 0.02, wp.z);

    if (water.material.uniforms.size) {
      // slightly larger ripples for 1×1 — tweakable
      water.material.uniforms.size.value = 1.0;
    }

    water.userData.type = 'water';
    water.userData.isWater = true;
    water.name = `Water_${tx},${tz}`;
    return water;
  }

  function paintTile(tx, tz, type) {
    if (!inBoundsTile(tx, tz)) return;
    const key = tileKey(tx, tz);

    const old = paintedTiles.get(key);
    if (old) {
      if (old.userData?.type === type) return;
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
    const mat = MATERIALS[type] || MATERIALS.sand;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
    const y = averageTileCornersHeight(tx, tz);
    mesh.position.set(wp.x, y + 0.015, wp.z);
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

  // =====================================================================
  // Height sculpting
  // =====================================================================

  function inBoundsTile(tx, tz) {
    return tx >= 0 && tx < gridWidth && tz >= 0 && tz < gridHeight;
  }
  function inBoundsVertex(vx, vz) {
    return vx >= 0 && vx <= gridWidth && vz >= 0 && vz <= gridHeight;
  }

  function setHeightMode(on) {
    // Turning height mode ON cancels paint & marker and locks Freeze
    if (on) {
      if (paintingMode) { paintingMode = false; currentPaintType = null; uiPanel.clearTerrainSelection(); }
      if (markerMode)   { markerMode = false;   uiPanel.setMarkerToggle(false); }
      heightMode = true;
      setFreeze(true, true);
    } else {
      heightMode = false;
      pinMode = false;
      // Clear green pins visual (UI says: turning the 1st toggle off removes highlight)
      clearAllPinsVisual();
      setFreeze(false, false);
    }
    uiPanel.reflectHeightUI(heightMode, pinMode, desiredHeight);
  }

  function togglePin(tx, tz) {
    if (!inBoundsTile(tx, tz)) return;
    pinTiles[tx][tz] = !pinTiles[tx][tz];
    // visual: green overlay quad
    setPinVisual(tx, tz, pinTiles[tx][tz]);
  }

  // Pin visuals are simple green overlay planes (similar to marker)
  const pinVisuals = new Map(); // "tx,tz" -> Mesh
  function setPinVisual(tx, tz, on) {
    const key = tileKey(tx, tz);
    if (on) {
      if (pinVisuals.has(key)) return;
      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 0x21c46d, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
      const y = averageTileCornersHeight(tx, tz);
      m.position.set(wp.x, y + 0.03, wp.z);
      m.name = `Pin_${key}`;
      scene.add(m);
      pinVisuals.set(key, m);
    } else {
      const m = pinVisuals.get(key);
      if (m) {
        scene.remove(m);
        m.geometry?.dispose?.();
        m.material?.dispose?.();
        pinVisuals.delete(key);
      }
    }
  }
  function clearAllPinsVisual() {
    for (const [, m] of pinVisuals) {
      scene.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
    pinVisuals.clear();
    // Also clear the logical pins (requirement: turning 1st toggle off removes highlight)
    for (let x = 0; x < gridWidth; x++) for (let z = 0; z < gridHeight; z++) pinTiles[x][z] = false;
  }

  function averageTileCornersHeight(tx, tz) {
    const h00 = heightGrid[tx][tz];
    const h10 = heightGrid[tx + 1][tz];
    const h01 = heightGrid[tx][tz + 1];
    const h11 = heightGrid[tx + 1][tz + 1];
    return (h00 + h10 + h01 + h11) * 0.25;
  }

  // Set the four corners of a tile to a height, respecting pinned neighbors
  function setTileHeight(tx, tz, h) {
    if (!inBoundsTile(tx, tz)) return;

    // If this tile is pinned, we don't edit it (it's an anchor).
    if (pinTiles[tx][tz]) return;

    // Grab desired new corner heights
    const newH = clamp(h, HEIGHT_MIN, HEIGHT_MAX);

    // For each of the 4 corners of the tile, try to set height unless that corner is "owned"
    // by an adjacent pinned tile. Ownership rule: if any of the tiles sharing that corner
    // is pinned, that corner is locked to its current height.
    const corners = [
      { vx: tx,     vz: tz     }, // bottom-left
      { vx: tx + 1, vz: tz     }, // bottom-right
      { vx: tx,     vz: tz + 1 }, // top-left
      { vx: tx + 1, vz: tz + 1 }  // top-right
    ];

    for (const c of corners) {
      if (!inBoundsVertex(c.vx, c.vz)) continue;
      if (cornerLockedByPins(c.vx, c.vz)) continue;
      heightGrid[c.vx][c.vz] = newH;
    }

    applyHeightGridToMesh();
    rebuildCliffsAround(tx, tz);

    // Re-seat any overlays (painted tiles or pins at these tiles and neighbors)
    refreshOverlayHeightsAround(tx, tz);
  }

  function cornerLockedByPins(vx, vz) {
    // Corner is shared by up to 4 tiles:
    // tiles: (vx-1,vz-1), (vx-1,vz), (vx,vz-1), (vx,vz)
    const tilesToCheck = [
      [vx - 1, vz - 1],
      [vx - 1, vz],
      [vx, vz - 1],
      [vx, vz]
    ];
    for (const [tx, tz] of tilesToCheck) {
      if (inBoundsTile(tx, tz) && pinTiles[tx][tz]) return true;
    }
    return false;
  }

  function applyHeightGridToMesh() {
    // terrainMesh geometry has (gridWidth+1)*(gridHeight+1) vertices laid out in x (width) then z (height)
    const geo = terrainMesh.geometry;
    const pos = geo.attributes.position;
    // PlaneGeometry grid is centered: x ∈ [-w/2, +w/2], z ∈ [-h/2, +h/2]
    // Our heightGrid indices match the segment grid ordering of PlaneGeometry.
    let i = 0;
    for (let vz = 0; vz <= gridHeight; vz++) {
      for (let vx = 0; vx <= gridWidth; vx++) {
        // x,y,z of vertex i
        // x, z stay as created by the geometry; we only update y (index i*3+1)
        const y = heightGrid[vx][vz];
        pos.setY(i, y);
        i++;
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // ----- Cliffs (vertical walls on discontinuities next to pinned tiles) -----
  function rebuildCliffsAll() {
    // Clear and rebuild along all interior edges where an edge separates at least one pinned tile
    cliffGroup.clear();
    // For each shared horizontal edge (between (tx,tz) and (tx+1,tz)), build if needed
    for (let tz = 0; tz < gridHeight; tz++) {
      for (let tx = 0; tx < gridWidth - 1; tx++) {
        addCliffIfNeeded(tx, tz, tx + 1, tz, 'vertical'); // edge along x between tile (tx,tz) and (tx+1,tz)
      }
    }
    // For each shared vertical edge (between (tx,tz) and (tx,tz+1))
    for (let tz = 0; tz < gridHeight - 1; tz++) {
      for (let tx = 0; tx < gridWidth; tx++) {
        addCliffIfNeeded(tx, tz, tx, tz + 1, 'horizontal'); // edge along z
      }
    }
  }

  function rebuildCliffsAround(tx, tz) {
    // Rebuild a 3×3 neighborhood edges around tile for performance
    const minx = Math.max(0, tx - 1), maxx = Math.min(gridWidth - 1, tx + 1);
    const minz = Math.max(0, tz - 1), maxz = Math.min(gridHeight - 1, tz + 1);

    // Remove all cliffs (simpler & safe on small maps); if perf needed, track by edge key
    cliffGroup.clear();

    // Re-add edges locally (plus neighbors’ edges)
    for (let z = 0; z < gridHeight; z++) {
      for (let x = 0; x < gridWidth - 1; x++) addCliffIfNeeded(x, z, x + 1, z, 'vertical');
    }
    for (let z = 0; z < gridHeight - 1; z++) {
      for (let x = 0; x < gridWidth; x++) addCliffIfNeeded(x, z, x, z + 1, 'horizontal');
    }
  }

  function addCliffIfNeeded(aTx, aTz, bTx, bTz, edgeKind /* 'vertical'|'horizontal' */) {
    // Only build a wall if at least one of the two tiles is pinned, AND their shared edge heights differ.
    const aPinned = pinTiles[aTx][aTz];
    const bPinned = pinTiles[bTx][bTz];
    if (!(aPinned || bPinned)) return;

    // Shared edge corner heights:
    // vertical edge ⇒ tiles share vertices (bTx,bTz) & (bTx, bTz+1) if edgeKind = 'vertical'
    // horizontal edge ⇒ share (bTx,bTz) & (bTx+1,bTz)
    let v0, v1; // [vx,vz]
    if (edgeKind === 'vertical') {
      // edge between (aTx,aTz) and (bTx,bTz) where bTx = aTx+1
      v0 = [bTx, bTz];
      v1 = [bTx, bTz + 1];
    } else {
      // horizontal edge: bTz = aTz+1
      v0 = [bTx, bTz];
      v1 = [bTx + 1, bTz];
    }
    const h0 = heightGrid[v0[0]][v0[1]];
    const h1 = heightGrid[v1[0]][v1[1]];
    const dh = h1 - h0;
    if (Math.abs(dh) < 1e-5) return;

    // Build a vertical rectangular quad spanning from min(h0,h1) to max(...) along the shared edge.
    // Wall thickness: very thin; we orient a PlaneGeometry accordingly.
    const height = Math.abs(dh);
    const midH = Math.min(h0, h1) + height * 0.5;

    // Edge midpoint position in world:
    const aCenter = tileToWorld(aTx, aTz, gridWidth, gridHeight);
    const bCenter = tileToWorld(bTx, bTz, gridWidth, gridHeight);
    const mid = new THREE.Vector3().addVectors(aCenter, bCenter).multiplyScalar(0.5);

    // Length along edge is 1m (tile size).
    const geom = new THREE.PlaneGeometry(1, height);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1f8a4e, // greenish (as in your screenshot walls)
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: true
    });
    const wall = new THREE.Mesh(geom, mat);
    wall.position.set(mid.x, midH, mid.z);
    if (edgeKind === 'vertical') {
      // edge runs along Z ⇒ rotate wall so its plane is aligned YZ (normal ±X)
      wall.rotation.y = Math.PI / 2;
    } else {
      // edge runs along X ⇒ plane aligned YX (normal ±Z)
      // default plane faces +Z, fine
    }
    wall.name = `Cliff_${aTx},${aTz}_${bTx},${bTz}`;
    cliffGroup.add(wall);
  }

  function refreshOverlayHeightsAround(tx, tz) {
    // Re-seat painted tiles & pin visuals nearby to float above terrain
    const neighbors = [
      [tx, tz], [tx - 1, tz], [tx + 1, tz], [tx, tz - 1], [tx, tz + 1],
      [tx - 1, tz - 1], [tx - 1, tz + 1], [tx + 1, tz - 1], [tx + 1, tz + 1]
    ];
    for (const [x, z] of neighbors) {
      if (!inBoundsTile(x, z)) continue;
      const key = tileKey(x, z);
      const y = averageTileCornersHeight(x, z);

      const painted = paintedTiles.get(key);
      if (painted) painted.position.y = (painted.userData?.isWater ? y + 0.02 : y + 0.015);

      const pinVis = pinVisuals.get(key);
      if (pinVis) pinVis.position.y = y + 0.03;
    }
  }

  // =====================================================================
  // Save / Load (now includes heightGrid & pinTiles)
  // =====================================================================
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

    // Flatten heightGrid and pinTiles
    const heights = [];
    for (let vz = 0; vz <= gridHeight; vz++) {
      const row = [];
      for (let vx = 0; vx <= gridWidth; vx++) row.push(Number(heightGrid[vx][vz] || 0));
      heights.push(row);
    }
    const pins = [];
    for (let tz = 0; tz < gridHeight; tz++) {
      const row = [];
      for (let tx = 0; tx < gridWidth; tx++) row.push(!!pinTiles[tx][tz]);
      pins.push(row);
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
      terrain: {
        paintingMode: false,
        selected: null,
        tiles
      },
      height: {
        step: HEIGHT_STEP,
        pinTiles: pins,
        heightGrid: heights
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
    setHeightMode(false);

    // Markers
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

    // Painted tiles
    clearAllPainted();
    const tiles = data.terrain?.tiles;
    if (Array.isArray(tiles)) {
      for (const t of tiles) {
        if (!Array.isArray(t) || t.length < 3) continue;
        const px = Number(t[0]), pz = Number(t[1]);
        const type = String(t[2]);
        if (Number.isFinite(px) && Number.isFinite(pz)) paintTile(px, pz, type);
      }
    }

    // Heights & pins
    if (Array.isArray(data.height?.heightGrid)) {
      const hg = data.height.heightGrid;
      for (let vz = 0; vz <= gridHeight && vz < hg.length; vz++) {
        for (let vx = 0; vx <= gridWidth && vx < hg[vz].length; vx++) {
          const val = Number(hg[vz][vx]);
          heightGrid[vx][vz] = Number.isFinite(val) ? val : 0;
        }
      }
      applyHeightGridToMesh();
    }
    if (Array.isArray(data.height?.pinTiles)) {
      const pt = data.height.pinTiles;
      for (let tz = 0; tz < gridHeight && tz < pt.length; tz++) {
        for (let tx = 0; tx < gridWidth && tx < pt[tz].length; tx++) {
          pinTiles[tx][tz] = !!pt[tz][tx];
          setPinVisual(tx, tz, pinTiles[tx][tz]);
        }
      }
    }
    rebuildCliffsAll();
    // Reseat overlays
    for (let z = 0; z < gridHeight; z++) for (let x = 0; x < gridWidth; x++) refreshOverlayHeightsAround(x, z);

    // Freeze
    setFreeze(!!data.settings?.freezeTapToMove, false);

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

  // =====================================================================
  // Freeze HUD
  // =====================================================================
  function addFreezeToggle() {
    const style = document.createElement('style');
    style.textContent = `
      .hud-freeze { position: fixed; top: 12px; left: 12px; z-index: 20;
        display:flex; align-items:center; gap:8px; background: rgba(30,32,37,0.85);
        color:#e8e8ea; padding:8px 10px; border:1px solid rgba(255,255,255,0.1);
        border-radius:6px; backdrop-filter:blur(8px); -webkit-backdrop-filter: blur(8px);
        font:600 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,sans-serif; }
      .switch { position:relative; display:inline-block; width:44px; height:24px; }
      .switch input { opacity:0; width:0; height:0; }
      .slider { position:absolute; cursor:pointer; inset:0; background:#3a3d46; transition:.2s; border-radius:999px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); }
      .slider:before { position:absolute; content:""; height:18px; width:18px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.2s; }
      input:checked + .slider { background:#00aaff; }
      input:checked + .slider:before { transform: translateX(20px); }
      input:disabled + .slider { filter: grayscale(0.3); opacity:0.65; cursor:not-allowed; }
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
      // Locked ON while Marker, Paint, or Height mode is active
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

  // Utils
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
};