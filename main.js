// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createCharacter } from './character.js';
import { UIPanel } from './ui-panel.js';
import { Sky } from 'three/addons/objects/Sky.js';

// ---- tile helpers for a single centered plane ----
function tileToWorld(tx, tz, gridWidth, gridHeight) {
  const x = tx - gridWidth / 2 + 0.5;
  const z = tz - gridHeight / 2 + 0.5;
  return { x, z };
}
function worldToTile(x, z, gridWidth, gridHeight) {
  let tx = Math.floor(x + gridWidth / 2);
  let tz = Math.floor(z + gridHeight / 2);
  tx = Math.max(0, Math.min(gridWidth - 1, tx));
  tz = Math.max(0, Math.min(gridHeight - 1, tz));
  return { tx, tz };
}

function init() {
  // --- Scene / renderer ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const viewport = new Viewport();
  const { camera, controls } = createCamera(viewport.renderer.domElement);
  viewport.scene = scene;
  viewport.camera = camera;

  // --- Directional light (controlled by Sky) ---
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  scene.add(dirLight);
  const lightTarget = new THREE.Object3D();
  scene.add(lightTarget);
  dirLight.target = lightTarget;

  // --- Character (red ball) ---
  const character = createCharacter();
  character.castShadow = true;
  scene.add(character);

  // --- Landscape (single solid mesh) + outlines ---
  let terrainMesh = null;
  let gridWidth = 10, gridHeight = 10;

  let edgesMesh = null;
  let showOutlines = false;

  // --- Tap-to-move state ---
  let freezeTapToMove = false;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const downPos = new THREE.Vector2();

  // --- Sky + PMREM environment ---
  const sky = new Sky();
  sky.name = 'Sky';
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  const SKY_PARAMS = {
    turbidity: 20,
    rayleigh: 0.508,
    mieCoefficient: 0.002,
    mieDirectionalG: 0.654,
    elevation: 70,     // <- as requested
    azimuth: 180,
    exposure: 0.3209
  };

  const pmremGen = new THREE.PMREMGenerator(viewport.renderer);
  pmremGen.compileEquirectangularShader();
  let envRT = null;
  const sun = new THREE.Vector3();

  function updateSkyAndLight(worldSpan = 100, focus = new THREE.Vector3(0, 0, 0)) {
    skyUniforms['turbidity'].value = SKY_PARAMS.turbidity;
    skyUniforms['rayleigh'].value = SKY_PARAMS.rayleigh;
    skyUniforms['mieCoefficient'].value = SKY_PARAMS.mieCoefficient;
    skyUniforms['mieDirectionalG'].value = SKY_PARAMS.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - SKY_PARAMS.elevation);
    const theta = THREE.MathUtils.degToRad(SKY_PARAMS.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(sun);

    const size = Math.max(100, worldSpan);
    sky.scale.setScalar(size);

    viewport.renderer.toneMappingExposure = SKY_PARAMS.exposure;

    if (envRT) envRT.dispose();
    envRT = pmremGen.fromScene(sky);
    scene.environment = envRT.texture;

    const lightDist = Math.max(150, size * 1.5);
    dirLight.position.copy(sun).multiplyScalar(lightDist);
    lightTarget.position.copy(focus);

    const ortho = dirLight.shadow.camera;
    const half = Math.max(50, size * 0.75);
    ortho.left = -half; ortho.right = half; ortho.top = half; ortho.bottom = -half;
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

    const geo = new THREE.PlaneGeometry(gridWidth, gridHeight, gridWidth, gridHeight);
    const mat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.95, metalness: 0.0 });
    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.position.set(0, 0, 0);
    terrainMesh.name = `Terrain_${gridWidth}x${gridHeight}`;
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // Center the ball on the middle *tile*
    const tx = Math.floor(gridWidth / 2);
    const tz = Math.floor(gridHeight / 2);
    const { x, z } = tileToWorld(tx, tz, gridWidth, gridHeight);
    character.position.set(x, 0.35, z);
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

  // --- Freeze Toggle (top-left) ---
  (function addFreezeToggle() {
    const style = document.createElement('style');
    style.textContent = `
      .hud-freeze {
        position: fixed; top: 12px; left: 12px; z-index: 20;
        display: flex; align-items: center; gap: 8px;
        background: rgba(30,32,37,0.85); color: #e8e8ea;
        padding: 8px 10px; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
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

    const checkbox = hud.querySelector('#freezeMoveToggle');
    checkbox.addEventListener('change', () => {
      freezeTapToMove = !!checkbox.checked;
    });
  })();

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
      version: 3,
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

  uiPanel.panelElement.addEventListener('load-project-data', (e) => {
    const { data } = e.detail || {};
    if (!data || !data.grid) { alert('Invalid save file.'); return; }
    regenerateWorld(data.grid.width, data.grid.height);

    if (data.character?.position) character.position.fromArray(data.character.position);
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

  // --- Tap-to-move input on the canvas (camera follows) ---
  const canvas = viewport.renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => {
    downPos.set(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', (e) => {
    const up = new THREE.Vector2(e.clientX, e.clientY);
    if (downPos.distanceTo(up) > 5) return;      // ignore drags
    if (freezeTapToMove) return;
    if (!terrainMesh) return;

    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(terrainMesh, false);
    if (!hit.length) return;

    const p = hit[0].point;
    const { tx, tz } = worldToTile(p.x, p.z, gridWidth, gridHeight);
    const c = tileToWorld(tx, tz, gridWidth, gridHeight);

    // --- FOLLOW CAM: shift camera and controls.target by same delta as the ball ---
    const old = character.position.clone();
    const newPos = new THREE.Vector3(c.x, 0.35, c.z);
    const delta = newPos.clone().sub(old);

    character.position.copy(newPos);
    camera.position.add(delta);
    controls.target.add(delta);
    controls.update();
  });

  // --- Loop ---
  viewport.onBeforeRender = () => {
    controls.update();
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}