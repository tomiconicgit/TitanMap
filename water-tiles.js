// file: water-tiles.js
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export function createWaterTile({ tx, tz, tileToWorld, gridWidth, gridHeight, dirLight, waterNormals }) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const water = new Water(geo, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals,
    sunDirection: dirLight.position.clone().normalize(),
    sunColor: 0xffffff,
    waterColor: 0x2066cc,
    distortionScale: 1.85,
    fog: false
  });
  water.rotation.x = -Math.PI / 2;

  const wp = tileToWorld(tx, tz, gridWidth, gridHeight);
  water.position.set(wp.x, 0.02, wp.z);

  // punchier ripples like the example
  if (water.material.uniforms.size) {
    water.material.uniforms.size.value = 10.0;
  }

  water.userData.type = 'water';
  water.userData.isWater = true;
  water.name = `Water_${tx},${tz}`;
  return water;
}