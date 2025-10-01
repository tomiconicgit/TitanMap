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

  // --- Outlines overlay (custom 1×1 tile grid) ---
  let edgesMesh = null;
  let showOutlines = false;

  function rebuildEdges() {
    // remove old overlay
    if (edgesMesh) {
      scene.remove(edgesMesh);
      edgesMesh.geometry?.dispose?.();
      edgesMesh.material?.dispose?.();
      edgesMesh = null;
    }
    if (!terrainMesh || !showOutlines) return;

    const w = gridWidth | 0;
    const h = gridHeight | 0;

    // Build true 1×1 tile lines in plane-local XY, z=0
    const verts = [];
    const xMin = -w / 2, xMax = w / 2;
    const yMin = -h / 2, yMax = h / 2;

    // vertical lines
    for (let xi = 0; xi <= w; xi++) {
      const x = xMin + xi;
      verts.push(x, yMin, 0,  x, yMax, 0);
    }
    // horizontal lines
    for (let yi = 0; yi <= h; yi++) {
      const y = yMin + yi;
      verts.push(xMin, y, 0,  xMax, y, 0);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

    const mat = new THREE.LineBasicMaterial({ color: 0x00aaff });
    edgesMesh = new THREE.LineSegments(geo, mat);

    // Match the plane’s transform (plane rotated -PI/2 on X => XY -> XZ)
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

    // Size = tiles, Segments = tiles (each tile is a quad between vertices)
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

  // Grid size -> regenerate
  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
  });

  // Toggle tile outlines
  uiPanel.panelElement.addEventListener('grid-outline-toggle', (e) => {
    showOutlines = !!(e.detail && e.detail.wantOn);
    rebuildEdges();
  });

  // Save
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

  // Load
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

// Run immediately (robust with modules)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}