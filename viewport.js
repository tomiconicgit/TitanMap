import * as THREE from 'three';

export default class Viewport {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(this.renderer.domElement);
    
    this.clock = new THREE.Clock();
    this.onBeforeRender = () => {};
    this.scene = null;
    this.camera = null;
    
    window.addEventListener('resize', () => {
      if (this.camera) {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
      }
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    this.renderer.setAnimationLoop(() => {
      if (this.scene && this.camera) {
        const deltaTime = this.clock.getDelta();
        this.onBeforeRender(deltaTime);
        this.renderer.render(this.scene, this.camera);
      }
    });
  }
}
