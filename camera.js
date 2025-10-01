// file: camera.js
import * as THREE from 'three';
import { GRID_SIZE, TILE_SIZE } from './grid-utils.js';

/**
 * Orbit-chase camera that always looks at a target (your red circle)
 * and clamps the look-at inside the grid bounds.
 */
export default class CameraRig {
  static main = null;

  static create() {
    if (CameraRig.main) return CameraRig.main;
    CameraRig.main = new CameraRig();
    return CameraRig.main;
  }

  constructor() {
    // World bounds for a center-origin grid:
    const worldSpanX = GRID_SIZE * TILE_SIZE;
    const worldSpanZ = GRID_SIZE * TILE_SIZE;

    this.worldMinX = -worldSpanX * 0.5;
    this.worldMaxX =  worldSpanX * 0.5;
    this.worldMinZ = -worldSpanZ * 0.5;
    this.worldMaxZ =  worldSpanZ * 0.5;

    this.threeCamera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      Math.max(worldSpanX, worldSpanZ) * 50
    );

    // orbit params
    this.target        = { position: new THREE.Vector3(0, 0, 0) };
    this.orbitAngle    = Math.PI / 3; // 60°
    this.orbitDistance = 6;

    // distance → height mapping
    this.minDistance = 3;
    this.maxDistance = 18;
    this.minHeight   = 3;
    this.maxHeight   = 8;

    window.addEventListener('resize', this.handleResize, { passive: true });
    this.handleResize();
    this.update();
  }

  setTarget(target) { this.target = target; this.update(); }
  notifyUserRotated() {} // placeholder

  _heightFromDistance() {
    const d = THREE.MathUtils.clamp(this.orbitDistance, this.minDistance, this.maxDistance);
    const t = (d - this.minDistance) / (this.maxDistance - this.minDistance);
    return THREE.MathUtils.lerp(this.minHeight, this.maxHeight, t);
    }

  update() {
    const tp = this.target?.position || new THREE.Vector3();

    // Clamp ONLY the look-at point
    const lookX = THREE.MathUtils.clamp(tp.x, this.worldMinX, this.worldMaxX);
    const lookZ = THREE.MathUtils.clamp(tp.z, this.worldMinZ, this.worldMaxZ);

    this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance, this.minDistance, this.maxDistance);
    const h = this._heightFromDistance();

    const camPos = new THREE.Vector3(
      lookX + this.orbitDistance * Math.sin(this.orbitAngle),
      tp.y + h,
      lookZ + this.orbitDistance * Math.cos(this.orbitAngle)
    );

    this.threeCamera.position.copy(camPos);
    this.threeCamera.lookAt(lookX, tp.y + 1, lookZ);
  }

  handleResize = () => {
    this.threeCamera.aspect = window.innerWidth / window.innerHeight;
    this.threeCamera.updateProjectionMatrix();
  };
}