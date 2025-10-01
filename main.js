// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createCharacter } from './character.js';
import { UIPanel } from './ui-panel.js';

function init() {
  // --- Scene / renderer ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // --- Lights ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  // --- Character FIRST ---
  const character = createCharacter();
  scene.add(character);
  character.position.set(0, 0.35, 0);

  // --- Landscape (single solid mesh) ---
  let terrainMesh = null;
  let gridWidth = 10, gridHeight = 10;

  // --- Outlines overlay (tile edges) ---
  let edgesMesh = null;
  let showOutlines = false;

  function rebuildEdges() {
    if (edgesMesh) {
      scene.remove(edgesMesh);
      edgesMesh.geometry?.dispose?.();
      edgesMesh.material?.dispose?.();
      edgesMesh = null;
    }
    if (!terrainMesh || !showOutlines) return;

    const eg = new THREE.EdgesGeometry(terrainMesh.geometry);
    const emat = new THREE.LineBasicMaterial({ color: 0x00aaff });
    edgesMesh = new THREE.LineSegments(eg, emat);

    edgesMesh.position.copy(terrainMesh.position);
    edgesMesh.rotation.copy(terrainMesh.rotation);
    edgesMesh.position.y += 0.001; // avoid z-fighting
    edgesMesh.renderOrder = 1;

    scene.add(edgesMesh);
  }

  function regenerateWorld(width, height) {
    gridWidth = width | 0;
    gridHeight = height | 0;

    if (terrainMesh) {
      scene.remove(terrainMesh);
      terrainMesh.geometry?.dispose?.();
      terrainMesh.material?.dispose?.();
      terrainMesh = null;
    }

    // Size = tiles, Segments = tiles
    const geo = new THREE.PlaneGeometry(gridWidth, gridHeight, gridWidth, gridHeight);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x777777,
      roughness: 0.95,
      metalness: 0.0
    });
    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.position.set(0, 0, 0);
    terrainMesh.name = `Terrain_${gridWidth}x${gridHeight}`;
    scene.add(terrainMesh);

    // reset character to center
    character.position.set(0, 0.35, 0);

    controls.target.set(0, 0, 0);
    camera.position.set(3, 6, 9);
    controls.update();

    rebuildEdges();
  }

  // initial world
  regenerateWorld(10, 10);

  // --- UI Panel ---
  const uiPanel = new UIPanel(document.body);

  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  uiPanel.panelElement.addEventListener('grid-outline-toggle', (e) => {
    showOutlines = !!(e.detail && e.detail.wantOn);
    rebuildEdges();
  });

  uiPanel.panelElement.addEventListener('save-project', (e) => {
    const { filename } = e.detail;
    const data = {
      version: 1,
      timestamp: Date.now(),
      grid: { width: gridWidth, height: gridHeight },
      character: { position: character.position.toArray() },
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray()
      },
      view: { outlines: !!showOutlines }
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
    if (!data || !data.grid) {
      alert('Invalid save file.');
      return;
    }
    regenerateWorld(data.grid.width, data.grid.height);

    if (data.character?.position) {
      character.position.fromArray(data.character.position);
    }
    if (data.camera?.position && data.camera?.target) {
      camera.position.fromArray(data.camera.position);
      controls.target.fromArray(data.camera.target);
      controls.update();
    }
    if (data.view && typeof data.view.outlines === 'boolean') {
      showOutlines = data.view.outlines;
      if (uiPanel.outlineToggleEl) uiPanel.outlineToggleEl.checked = showOutlines;
      rebuildEdges();
    }
  });

  // --- Loop ---
  viewport.onBeforeRender = () => {
    controls.update();
  };
}

// Run immediately (don’t rely on window.onload with modules)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}