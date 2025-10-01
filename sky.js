// file: sky.js
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export class SkySystem {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.DirectionalLight} dirLight
   */
  constructor(scene, renderer, dirLight) {
    this.scene = scene;
    this.renderer = renderer;
    this.dirLight = dirLight;

    this.sky = new Sky();
    this.sky.name = 'Sky';
    this.scene.add(this.sky);

    this.uniforms = this.sky.material.uniforms;
    this.params = {
      turbidity: 20,
      rayleigh: 0.508,
      mieCoefficient: 0.002,
      mieDirectionalG: 0.654,
      elevation: 70,
      azimuth: 180,
      exposure: 0.3209
    };

    this.pmremGen = new THREE.PMREMGenerator(this.renderer);
    this.pmremGen.compileEquirectangularShader();
    this.envRT = null;

    this.sun = new THREE.Vector3();
    this.lightTarget = new THREE.Object3D();
    this.scene.add(this.lightTarget);
    this.dirLight.target = this.lightTarget;
  }

  /**
   * Fits the sky dome to `worldSpan` and positions light towards `focus`.
   * Also updates env map and renderer exposure.
   */
  update(worldSpan = 100, focus = new THREE.Vector3()) {
    const u = this.uniforms;
    const p = this.params;

    u['turbidity'].value = p.turbidity;
    u['rayleigh'].value = p.rayleigh;
    u['mieCoefficient'].value = p.mieCoefficient;
    u['mieDirectionalG'].value = p.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - p.elevation);
    const theta = THREE.MathUtils.degToRad(p.azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    u['sunPosition'].value.copy(this.sun);

    const size = Math.max(100, worldSpan);
    this.sky.scale.setScalar(size);

    this.renderer.toneMappingExposure = p.exposure;

    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmremGen.fromScene(this.sky);
    this.scene.environment = this.envRT.texture;

    const lightDist = Math.max(150, size * 1.5);
    this.dirLight.position.copy(this.sun).multiplyScalar(lightDist);
    this.lightTarget.position.copy(focus);

    const ortho = this.dirLight.shadow.camera;
    const half = Math.max(50, size * 0.75);
    ortho.left = -half; ortho.right = half; ortho.top = half; ortho.bottom = -half;
    ortho.updateProjectionMatrix();
  }
}