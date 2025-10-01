// file: main.js
import * as THREE from 'three';
import Viewport from './viewport.js';
import { createCamera } from './camera.js';
import { createCharacter } from './character.js';

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

  // --- Solid landscape: 10x10 size, 10x10 segments (tiles) ---
  const SIZE_X = 10, SIZE_Z = 10;            // physical size
  const SEG_X = 10, SEG_Z = 10;              // segments = tiles
  const terrainGeo = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, SEG_X, SEG_Z);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x777777, roughness: 0.95, metalness: 0.0
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.rotation.x = -Math.PI / 2;     // lay flat on XZ
  terrainMesh.position.set(0, 0, 0);
  terrainMesh.receiveShadow = false;
  terrainMesh.name = 'TerrainMeshSolid10x10';
  scene.add(terrainMesh);

  // --- Character: red 3D ball ---
  const character = createCharacter();        // now a sphere (see character.js below)
  scene.add(character);

  // place character at center tile (roughly)
  character.position.set(0, 0.35, 0);

  // --- Camera framing ---
  controls.target.set(0, 0, 0);
  camera.position.set(3, 6, 9);
  controls.update();

  // --- Minimal loop ---
  viewport.onBeforeRender = (dt) => {
    controls.update();
  };
};