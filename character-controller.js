import * as THREE from 'three';
import { tileToWorld } from './grid-utils.js';

export class CharacterController {
  constructor(characterMesh, startTx, startTz, speed = 4) {
    this.mesh = characterMesh;
    this.tilePos = { tx: startTx, tz: startTz };
    this.speed = speed;

    this.path = [];
    this.targetPosition = tileToWorld(startTx, startTz);
    this.isMoving = false;

    this.pfGrid = new PF.Grid(10, 10);
    this.finder = new PF.AStarFinder({
      allowDiagonal: true,
      dontCrossCorners: true
    });
  }

  moveTo(tx, tz) {
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
    const nextTile = this.path[0];
    const worldPos = tileToWorld(nextTile[0], nextTile[1]);
    this.targetPosition.set(worldPos.x, this.mesh.position.y, worldPos.z);
  }

  update(deltaTime) {
    if (!this.isMoving) return;

    const distance = this.mesh.position.distanceTo(this.targetPosition);
    
    if (distance < 0.05) {
      this.tilePos = { tx: this.path[0][0], tz: this.path[0][1] };
      this.path.shift();
      if (this.path.length === 0) {
        this.isMoving = false;
        return;
      }
      this.setNextTarget();
    }

    const moveAmount = this.speed * deltaTime;
    this.mesh.position.lerp(this.targetPosition, moveAmount / distance);
  }
}
