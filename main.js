// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createCharacter } from './character.js';
import { UIPanel } from './ui-panel.js';
import { Sky } from 'three/addons/objects/Sky.js';

// Convert tile index (tx, tz) to world center on the single plane
function tileToWorld(tx, tz, gridWidth, gridHeight) {
  const halfW = gridWidth / 2;
  const halfH = gridHeight / 2;
  const x = tx - halfW + 0.5; // center of the tile
  const z = tz - halfH + 0.5;
  return { x, z };
}

function init() {
  // --- Scene / renderer ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // --- Lights (Directional; driven by Sky) ---
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  // reasonable default shadow camera; will be resized on world regen
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  scene.add(dirLight);
  // light target so we can move it explicitly
  const lightTarget = new THREE.Object3D();
  scene.add(lightTarget);
  dirLight.target = lightTarget;

  // --- Ambient is not needed; IBL from sky will handle fill ---
  // scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  // --- Character FIRST ---
  const character = createCharacter();
  character.castShadow = true;
  character.receiveShadow = false;
  scene.add(character);

  // --- Landscape (single solid mesh) ---
  let terrainMesh = null;
  let gridWidth = 10, gridHeight = 10;

  // --- Outlines overlay (custom 1×1 tile grid) ---
  let edgesMesh = null;
  let showOutlines = false;

  // --- Sky setup + PMREM environment ---
  const sky = new Sky();
  sky.name = 'Sky';
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;

  // Sky params from your spec
  const SKY_PARAMS = {
    turbidity: 20,
    rayleigh: 0.508,
    mieCoefficient: 0.002,   // note: correct key spelling
    mieDirectionalG: 0.654,
    elevation: 90,
    azimuth: 180,
    exposure: 0.3209
  };

  // PMREM (environment map from sky)
  const pmremGen = new THREE.PMREMGenerator(viewport.renderer);
  pmremGen.compileEquirectangularShader();
  let envRT = null; // keep last env map to dispose on updates

  // helper: update sky uniforms, sun position, renderer exposure,
  // env map, and light position/target
  const sun = new THREE.Vector3();
  function updateSkyAndLight(worldSpan = 100, focus = new THREE.Vector3(0, 0, 0)) {
    // uniforms
    skyUniforms['turbidity'].value = SKY_PARAMS.turbidity;
    skyUniforms['rayleigh'].value = SKY_PARAMS.rayleigh;
    skyUniforms['mieCoefficient'].value = SKY_PARAMS.mieCoefficient;
    skyUniforms['mieDirectionalG'].value = SKY_PARAMS.mieDirectionalG;

    // degrees -> spherical coords
    const phi = THREE.MathUtils.degToRad(90 - SKY_PARAMS.elevation);
    const theta = THREE.MathUtils.degToRad(SKY_PARAMS.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(sun);

    // scale sky to cover mesh outline (min 100)
    const size = Math.max(100, worldSpan);
    sky.scale.setScalar(size);

    // tone mapping exposure
    viewport.renderer.toneMappingExposure = SKY_PARAMS.exposure;

    // rebuild env map from sky (for IBL)
    if (envRT) envRT.dispose();
    envRT = pmremGen.fromScene(sky);
    scene.environment = envRT.texture;

    // light controlled by sky sun direction
    const lightDist = Math.max(150, size * 1.5);
    dirLight.position.copy(sun).multiplyScalar(lightDist);
    lightTarget.position.copy(focus);

    // shadow frustum sized to scene
    const ortho = dirLight.shadow.camera;
    const half = Math.max(50, size * 0.75);
    ortho.left = -half;
    ortho.right = half;
    ortho.top = half;
    ortho.bottom = -half;
    ortho.updateProjectionMatrix();
  }

  function rebuildEdges() {
    if (edgesMesh) {
      scene.remove(edgesMesh);
      edgesMesh.geometry?.dispose?.();
      edgesMesh.material?.dispose?.();
      edgesMesh = null;
    }
    if (!terrainMesh || !showOutlines) return;

    const w = gridWidth | 0;
    const h = gridHeight | 0;

    const verts = [];
    const xMin = -w / 2, xMax = w / 2;
    const yMin = -h / 2, yMax = h / 2;

    for (let xi = 0; xi <= w; xi++) {
      const x = xMin + xi;
      verts.push(x, yMin, 0,  x, yMax, 0);
    }
    for (let yi = 0; yi <= h; yi++) {
      const y = yMin + yi;
      verts.push(xMin, y, 0,  xMax, y, 0);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

    const mat = new THREE.LineBasicMaterial({ color: 0x00aaff });
    edgesMesh = new THREE.LineSegments(geo, mat);

    edgesMesh.position.copy(terrainMesh.position);
    edgesMesh.rotation.copy(terrainMesh.rotation);
    edgesMesh.position.y += 0.001;
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

    // Size = tiles, Segments = tiles (each tile is a quad)
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
    terrainMesh.receiveShadow = true; // receive shadows on ground
    scene.add(terrainMesh);

    // Center the ball on the middle tile
    const tx = Math.floor(gridWidth / 2);
    const tz = Math.floor(gridHeight / 2);
    const { x, z } = tileToWorld(tx, tz, gridWidth, gridHeight);
    character.position.set(x, 0.35, z);
    // make sure character casts
    character.castShadow = true;

    // Focus camera near that tile
    controls.target.set(x, 0, z);
    camera.position.set(x + 3, 6, z + 9);
    controls.update();

    rebuildEdges();

    // Update sky/env/light to match scene span (min 100)
    const span = Math.max(gridWidth, gridHeight);
    updateSkyAndLight(span, new THREE.Vector3(x, 0, z));
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
      version: 2,
      timestamp: Date.now(),
      grid: { width: gridWidth, height: gridHeight },
      character: { position: character.position.toArray() },
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray()
      },
      view: { outlines: !!showOutlines },
      sky: { ...SKY_PARAMS }
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
    if (data.sky) {
      Object.assign(SKY_PARAMS, data.sky);
      const span = Math.max(gridWidth, gridHeight);
      updateSkyAndLight(span, controls.target.clone());
    }
  });

  // --- Loop ---
  viewport.onBeforeRender = () => {
    // nothing per frame right now; sky/light are static given your parameters
    // (if later you animate azimuth/elevation, call updateSkyAndLight() here)
    controls.update();
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}