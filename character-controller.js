// character-controller.js
import * as THREE from 'three';
import { tileToWorld } from './grid-utils.js';

export class CharacterController {
  constructor(characterMesh, startTx, startTz, speed = 4) {
    this.mesh = characterMesh;
    this.tilePos = { tx: startTx, tz: startTz };
    this.speed = speed;

    this.path = [];
    this.targetPosition = tileToWorld(startTx, startTz).clone();
    this.isMoving = false;

    // ✅ Use the global PF that was attached by pathfinding-browser.js
    const PF = (typeof window !== 'undefined') ? window.PF : null;
    if (!PF) {
      console.error('[CharacterController] Pathfinding library (PF) not found. ' +
                    'Ensure pathfinding-browser.js is loaded before main.js.');
    }

    this.pfGrid = new PF.Grid(10, 10);
    this.finder = new PF.AStarFinder({
      allowDiagonal: true,
      dontCrossCorners: true
    });
  }

  moveTo(tx, tz) {
    // Don’t queue a new path while already moving
    if (this.isMoving || (tx === this.tilePos.tx && tz === this.tilePos.tz)) return;
    if (tx < 0 || tx > 9 || tz < 0 || tz > 9) return;

    const grid = this.pfGrid.clone();
    const start = this.tilePos;

    const path = this.finder.findPath(start.tx, start.tz, tx, tz, grid);

    if (path && path.length > 1) {
      this.path = path.slice(1);
      this.isMoving = true;
      this.setNextTarget();
    }
  }

  setNextTarget() {
    if (this.path.length === 0) {
      this.isMoving = false;
      return;
    }
    const [nx, nz] = this.path[0];
    const worldPos = tileToWorld(nx, nz);
    this.targetPosition.set(worldPos.x, this.mesh.position.y, worldPos.z);
  }

  update(dt) {
    if (!this.isMoving) return;

    const dist = this.mesh.position.distanceTo(this.targetPosition);

    if (dist < 0.05) {
      // Arrived at this tile -> advance
      const [nx, nz] = this.path[0];
      this.tilePos = { tx: nx, tz: nz };
      this.path.shift();
      if (this.path.length === 0) {
        this.isMoving = false;
        return;
      }
      this.setNextTarget();
      return;
    }

    // Move toward target (clamp t so we never overshoot)
    const step = this.speed * dt;
    const t = Math.min(1, step / Math.max(1e-6, dist));
    this.mesh.position.lerp(this.targetPosition, t);
  }
}