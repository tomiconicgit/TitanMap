// file: character-controller.js
import * as THREE from 'three';
import { tileToWorld } from './grid-utils.js';

export class CharacterController {
  constructor(characterMesh, startTx, startTz, gridWidth = 10, gridHeight = 10) {
    this.mesh = characterMesh;
    this.speed = 4;
    this.path = [];
    this.isMoving = false;
    this.targetPosition = new THREE.Vector3();
    
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    this.PF = (typeof window !== 'undefined') ? window.PF : null;
    if (this.PF) {
      this.pfGrid = new this.PF.Grid(gridWidth, gridHeight);
      this.finder = new this.PF.AStarFinder({
        allowDiagonal: true,
        dontCrossCorners: true
      });
    }

    this.resetTo(startTx, startTz);
  }

  // Called when the grid is regenerated
  updateGridSize(width, height) {
    this.gridWidth = width;
    this.gridHeight = height;
    if (this.PF) {
      this.pfGrid = new this.PF.Grid(width, height);
    }
  }

  // Instantly moves the character to a new tile
  resetTo(tx, tz) {
    this.isMoving = false;
    this.path = [];
    this.tilePos = { tx, tz };
    const worldPos = tileToWorld(tx, tz, this.gridWidth, this.gridHeight);
    this.mesh.position.set(worldPos.x, this.mesh.position.y, worldPos.z);
    this.targetPosition.copy(this.mesh.position);
  }

  moveTo(tx, tz) {
    if (this.isMoving || (tx === this.tilePos.tx && tz === this.tilePos.tz)) return;
    if (tx < 0 || tx >= this.gridWidth || tz < 0 || tz >= this.gridHeight) return;

    let path = null;
    if (this.PF && this.finder) {
        const grid = this.pfGrid.clone();
        path = this.finder.findPath(this.tilePos.tx, this.tilePos.tz, tx, tz, grid);
    }
    
    if (path && path.length > 1) {
      this.path = path.slice(1);
      this.isMoving = true;
      this._setNextTarget();
    }
  }

  _setNextTarget() {
    if (this.path.length === 0) {
      this.isMoving = false;
      return;
    }
    const [nx, nz] = this.path[0];
    const wp = tileToWorld(nx, nz, this.gridWidth, this.gridHeight);
    this.targetPosition.set(wp.x, this.mesh.position.y, wp.z);
  }

  update(dt) {
    if (!this.isMoving) return;
    const dist = this.mesh.position.distanceTo(this.targetPosition);

    if (dist < 0.05) {
      const [nx, nz] = this.path[0];
      this.tilePos = { tx: nx, tz: nz };
      this.path.shift();
      if (this.path.length === 0) {
        this.isMoving = false;
        return;
      }
      this._setNextTarget();
      return;
    }

    const step = this.speed * dt;
    const t = Math.min(1, step / Math.max(1e-6, dist));
    this.mesh.position.lerp(this.targetPosition, t);
  }
}
