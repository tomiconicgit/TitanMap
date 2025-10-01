// file: terrain.js
import * as THREE from 'three';

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;

    this.showOutlines = false;
    this.edgesMesh = null;

    this.width = 0;
    this.height = 0;

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
  }

  rebuild(width, height) {
    this.width = width | 0;
    this.height = height | 0;

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry?.dispose?.();
      this.mesh.material?.dispose?.();
      this.mesh = null;
    }
    if (this.edgesMesh) {
      this.scene.remove(this.edgesMesh);
      this.edgesMesh.geometry?.dispose?.();
      this.edgesMesh.material?.dispose?.();
      this.edgesMesh = null;
    }

    // Indexed geometry so height tool keeps shared vertices across tiles
    const geo = new THREE.PlaneGeometry(this.width, this.height, this.width, this.height);

    // Per-vertex color attribute (default mid gray)
    const vertCount = geo.attributes.position.count;
    const colors = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      colors[i * 3 + 0] = 0.47;
      colors[i * 3 + 1] = 0.47;
      colors[i * 3 + 2] = 0.47;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    this.mesh.name = `Terrain_${this.width}x${this.height}`;
    this.scene.add(this.mesh);

    if (this.showOutlines) this._rebuildEdges();
  }

  setOutlinesVisible(on) {
    this.showOutlines = !!on;
    if (this.showOutlines) this._rebuildEdges();
    else if (this.edgesMesh) {
      this.scene.remove(this.edgesMesh);
      this.edgesMesh.geometry?.dispose?.();
      this.edgesMesh.material?.dispose?.();
      this.edgesMesh = null;
    }
  }

  /** Call this whenever vertex positions change (e.g., after height edits). */
  onHeightsUpdated() {
    if (this.showOutlines) this._rebuildEdges();
  }

  _rebuildEdges() {
    if (!this.mesh) return;

    if (this.edgesMesh) {
      this.scene.remove(this.edgesMesh);
      this.edgesMesh.geometry?.dispose?.();
      this.edgesMesh.material?.dispose?.();
      this.edgesMesh = null;
    }

    // Use WireframeGeometry to include ALL internal grid edges
    const wg = new THREE.WireframeGeometry(this.mesh.geometry);
    const wmat = new THREE.LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.85,
      depthTest: false // always on top
    });

    this.edgesMesh = new THREE.LineSegments(wg, wmat);
    this.edgesMesh.name = 'TerrainOutlines';
    // match transform
    this.edgesMesh.position.copy(this.mesh.position);
    this.edgesMesh.rotation.copy(this.mesh.rotation);
    // slight lift reduces accidental z-fight on steep slopes
    this.edgesMesh.position.y += 0.002;
    this.edgesMesh.renderOrder = 10;

    this.scene.add(this.edgesMesh);
  }

  raycastPointer(evt, camera, canvas) {
    if (!this.mesh) return null;
    const rect = canvas.getBoundingClientRect();
    this._ndc.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._ndc, camera);
    const hit = this._raycaster.intersectObject(this.mesh, false);
    if (!hit.length) return null;
    return hit[0].point;
  }

  getHeightAt(worldX, worldZ) {
    if (!this.mesh) return 0;
    const pos = this.mesh.geometry.attributes.position;
    const w = this.width, h = this.height;

    let lx = worldX + w / 2;
    let lz = worldZ + h / 2;
    lx = Math.min(Math.max(lx, 0), w - 1e-6);
    lz = Math.min(Math.max(lz, 0), h - 1e-6);

    const tx = Math.floor(lx);
    const tz = Math.floor(lz);
    const fx = lx - tx;
    const fz = lz - tz;

    const idx = (vx, vz) => vz * (w + 1) + vx;
    const v00 = pos.getZ(idx(tx,     tz    ));
    const v10 = pos.getZ(idx(tx + 1, tz    ));
    const v01 = pos.getZ(idx(tx,     tz + 1));
    const v11 = pos.getZ(idx(tx + 1, tz + 1));

    const a = v00 * (1 - fx) + v10 * fx;
    const b = v01 * (1 - fx) + v11 * fx;
    return a * (1 - fz) + b * fz;
  }

  /** Paint a single tile (tx,tz) by writing vertex colors of its 4 shared corners. */
  paintTileColor(tx, tz, colorAtCorner /* (fx,fz)=>THREE.Color */) {
    if (!this.mesh) return;
    if (tx < 0 || tz < 0 || tx >= this.width || tz >= this.height) return;

    const w = this.width;
    const colors = this.mesh.geometry.attributes.color;

    // vertex indices for this tile’s 4 corners in indexed geometry
    const v_tl = tz       * (w + 1) + tx;
    const v_tr = tz       * (w + 1) + (tx + 1);
    const v_bl = (tz + 1) * (w + 1) + tx;
    const v_br = (tz + 1) * (w + 1) + (tx + 1);

    const c_tl = colorAtCorner(0, 0);
    const c_tr = colorAtCorner(1, 0);
    const c_bl = colorAtCorner(0, 1);
    const c_br = colorAtCorner(1, 1);

    colors.setXYZ(v_tl, c_tl.r, c_tl.g, c_tl.b);
    colors.setXYZ(v_tr, c_tr.r, c_tr.g, c_tr.b);
    colors.setXYZ(v_bl, c_bl.r, c_bl.g, c_bl.b);
    colors.setXYZ(v_br, c_br.r, c_br.g, c_br.b);

    colors.needsUpdate = true;
  }
}