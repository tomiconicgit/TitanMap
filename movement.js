// file: movement.js
import * as THREE from 'three';
import { tileToWorld } from './tile-utils.js';

export class MovementController {
  constructor(character, camera, controls, terrain, opts = {}) {
    this.character = character;
    this.camera = camera;
    this.controls = controls;
    this.terrain = terrain;

    this.speedTilesPerSec = opts.speedTilesPerSec ?? 6; // tiles/sec across XZ
    this.ballRadius = opts.ballRadius ?? 0.35;

    this._moving = false;
    this._start = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._t = 0;
    this._duration = 0;
  }

  isMoving() { return this._moving; }

  moveToTile(tx, tz, gridW, gridH) {
    if (this._moving) return;
    const dst = tileToWorld(tx, tz, gridW, gridH);
    this._start.copy(this.character.position);
    this._target.set(dst.x, 0, dst.z);

    const dx = this._target.x - this._start.x;
    const dz = this._target.z - this._start.z;
    const dist = Math.hypot(dx, dz);
    this._duration = dist / Math.max(1e-5, this.speedTilesPerSec);
    this._t = 0;
    this._moving = true;
  }

  update(dt) {
    if (!this._moving) return;

    const prev = this.character.position.clone();

    this._t += dt;
    const k = Math.min(1, this._t / Math.max(1e-6, this._duration));
    const x = THREE.MathUtils.lerp(this._start.x, this._target.x, k);
    const z = THREE.MathUtils.lerp(this._start.z, this._target.z, k);
    const y = this.terrain.getHeightAt(x, z) + this.ballRadius;

    this.character.position.set(x, y, z);

    // camera follow: move camera & target by the same delta
    const delta = this.character.position.clone().sub(prev);
    if (delta.lengthSq() > 0) {
      this.camera.position.add(delta);
      this.controls.target.add(delta);
    }

    if (k >= 1) {
      this._moving = false;
    }
  }
}