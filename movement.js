// file: movement.js
import * as THREE from 'three';
import { tileToWorld } from './tile-utils.js';

/**
 * Move the character to (tx,tz) and shift camera+target by the same delta.
 */
export function moveCharacterToTile(character, camera, controls, tx, tz, gridWidth, gridHeight) {
  const c = tileToWorld(tx, tz, gridWidth, gridHeight);
  const old = character.position.clone();
  const newPos = new THREE.Vector3(c.x, 0.35, c.z);
  const delta = newPos.clone().sub(old);

  character.position.copy(newPos);
  camera.position.add(delta);
  controls.target.add(delta);
  controls.update();
}