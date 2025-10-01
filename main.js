// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createCharacter } from './character.js';
import { UIPanel } from './ui-panel.js';

window.onload = function () {
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

  // --- Landscape (10x10 by default) ---
  let terrainMesh = null;
  let gridWidth = 10, gridHeight = 10;

  function regenerateWorld(width, height) {
    gridWidth = width;
    gridHeight = height;

    if (terrainMesh) scene.remove(terrainMesh);

    const geo = new THREE.PlaneGeometry(width, height, width, height);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x777777,
      roughness: 0.95,
      metalness: 0.0
    });
    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.position.set(0, 0, 0);
    terrainMesh.name = `Terrain_${width}x${height}`;
    scene.add(terrainMesh);

    // reset character to center
    const cx = 0, cz = 0;
    character.position.set(cx, 0.35, cz);

    controls.target.set(0, 0, 0);
    camera.position.set(3, 6, 9);
    controls.update();
  }

  regenerateWorld(10, 10);

  // --- Character ---
  const character = createCharacter();
  scene.add(character);
  character.position.set(0, 0.35, 0);

  // --- UI Panel ---
  const uiPanel = new UIPanel(document.body);

  uiPanel.panelElement.addEventListener('generate', (e) => {
    const { width, height } = e.detail;
    regenerateWorld(width, height);
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
  });

  // --- Loop ---
  viewport.onBeforeRender = (dt) => {
    controls.update();
  };
};