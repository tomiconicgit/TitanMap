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
  let gridGroup, terrainMesh; // Changed groundPlane to terrainMesh

  // ... (freeze toggle, marker mode are fine)

  // -- REFACTORED Terrain State --
  let paintingMode = false;
  let currentPaintType = null;
  // This map now stores DATA ('grass', 'sand'), not meshes.
  const paintedTileData = new Map();
  // Water meshes are special and are still separate objects.
  const waterMeshes = new Map();

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
  // REMOVED: scene.add(terrainGroup);

  // ... (character & controller, viewport & camera are fine)

  const WATER_NORMALS_URL = './textures/waternormals.jpg';
  const waterNormals = new THREE.TextureLoader().load(WATER_NORMALS_URL, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });

  // -- MODIFIED World Generation --
  function regenerateWorld(width, height) {
    gridWidth = width;
    gridHeight = height;

    if (gridGroup) scene.remove(gridGroup);
    if (terrainMesh) scene.remove(terrainMesh); // Remove old terrain mesh

    gridGroup = createGrid(width, height);
    scene.add(gridGroup);

    // --- Create the single, unified terrain mesh ---
    const terrainGeo = new THREE.PlaneGeometry(width, height, width, height);
    
    // Initialize default vertex colors
    const colors = [];
    const defaultColor = new THREE.Color(0x888888);
    for (let i = 0; i < terrainGeo.attributes.position.count; i++) {
        colors.push(defaultColor.r, defaultColor.g, defaultColor.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Use a material that supports vertex colors
    const terrainMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: false, // Set to false for smooth slopes!
        roughness: 0.9,
        metalness: 0.1
    });

    terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.name = 'TerrainMesh';
    scene.add(terrainMesh);
    // ---------------------------------------------------

    clearAllPainted();

    // Init/Reset height tool with the new terrain mesh
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

  // ... (UI Panel event listeners are mostly fine)

  // --- MODIFIED Tap/Drag handling ---
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
    // Intersect with the new terrain mesh
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

  // --- MODIFIED Water Tick ---
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

    // Tick water meshes
    if (waterMeshes.size > 0) {
      for (const w of waterMeshes.values()) {
        const u = w.material?.uniforms;
        if (u && u.time) u.time.value += dt;
      }
    }

    controls.update();
  };

  addFreezeToggle();
  regenerateWorld(30, 30);

  function tileKey(x, y) { return `${x},${y}`; }

  // ... (addMarker and clearAllMarkers are fine)

  // --- REPLACED Terrain painting materials with simple colors ---
  const MATERIALS = {
    sand:   { color: new THREE.Color(0xD8C6A3) },
    dirt:   { color: new THREE.Color(0x6F451F) },
    grass:  { color: new THREE.Color(0x2E7D32) },
    stone:  { color: new THREE.Color(0x7D7D7D) },
    gravel: { color: new THREE.Color(0x9A9A9A) },
  };

  // createWaterTile is almost the same, but we add it to the scene directly
  function createWaterTile(tx, tz) {
      // ... (implementation from your main.js is fine)
      const geo = new THREE.PlaneGeometry(1, 1);
      const water = new Water(geo, { /* ... options ... */ });
      // ... position it etc ...
      return water;
  }

  // --- REWRITTEN Paint Function ---
  function paintTile(tx, tz, type) {
    if (tx < 0 || tx >= gridWidth || tz < 0 || tz >= gridHeight) return;
    const key = tileKey(tx, tz);

    const oldType = paintedTileData.get(key);
    if (oldType === type) return;

    // If there was an old water mesh at this location, remove it
    if (waterMeshes.has(key)) {
        const oldWater = waterMeshes.get(key);
        scene.remove(oldWater);
        oldWater.geometry.dispose();
        oldWater.material.dispose();
        waterMeshes.delete(key);
    }

    if (type === 'water') {
        const water = createWaterTile(tx, tz); // This function is from your existing code
        scene.add(water);
        waterMeshes.set(key, water);
    } else {
        const mat = MATERIALS[type] || MATERIALS.sand;
        const color = mat.color;
        const terrainColors = terrainMesh.geometry.attributes.color;
        const widthSegments = gridWidth;

        // The vertices are laid out like a grid. We find the 4 corners for our tile.
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

  // --- REWRITTEN Clear Function ---
  function clearAllPainted() {
    paintedTileData.clear();
    
    for (const [, mesh] of waterMeshes) {
      scene.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    waterMeshes.clear();
    
    // Reset the main terrain mesh colors
    if (terrainMesh) {
        const colors = terrainMesh.geometry.attributes.color;
        const defaultColor = new THREE.Color(0x888888);
        for(let i = 0; i < colors.count; i++) {
            colors.setXYZ(i, defaultColor.r, defaultColor.g, defaultColor.b);
        }
        colors.needsUpdate = true;
    }
  }

  // ... The rest of your main.js (save/load, HUD) will need updates to handle the new data format,
  // but these changes fix the core visual and interactive problems.
  // getProjectData needs to save heightTool.heights and paintedTileData.
  // applyProjectData needs to load them and call heightTool.applyHeightsToMesh() and repaint the tiles.
};
