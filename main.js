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

  // ... (UI Panel event listeners are fine)
  // ...

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

  addFreezeToggle();
  regenerateWorld(30, 30);

  function tileKey(x, y) { return `${x},${y}`; }

  // ... (addMarker, clearAllMarkers are fine)
  // ...

  const MATERIALS = {
    sand:   { color: new THREE.Color(0xD8C6A3) },
    dirt:   { color: new THREE.Color(0x6F451F) },
    grass:  { color: new THREE.Color(0x2E7D32) },
    stone:  { color: new THREE.Color(0x7D7D7D) },
    gravel: { color: new THREE.Color(0x9A9A9A) },
  };

  // --- FULLY IMPLEMENTED createWaterTile ---
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
    water.position.set(wp.x, 0.02, wp.z); // Position slightly above base terrain
    if (water.material.uniforms.size) {
      water.material.uniforms.size.value = 10.0;
    }
    water.userData.type = 'water';
    water.name = `Water_${tx},${tz}`;
    return water;
  }

  // --- PAINT FUNCTION (REWRITTEN) ---
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

  // --- CLEAR FUNCTION (REWRITTEN) ---
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

  // The rest of your main.js file (save/load functions, HUD functions) goes here...
  // Note: Your save/load functions will need to be updated to handle the new data structures.
  // getProjectData() should now save `heightTool.heights` and the `paintedTileData` map.
  // applyProjectData() should load them, repaint the tiles, and call `heightTool.applyHeightsToMesh()`.
};
