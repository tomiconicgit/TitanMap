import * as THREE from 'three';

export default class Viewport {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    
    document.body.appendChild(this.renderer.domElement);
    
    // An empty function hook to be assigned later
    this.onBeforeRender = () => {}; 
    
    // Scene and camera will be assigned later
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
        this.onBeforeRender(); // Call the update hook
        this.renderer.render(this.scene, this.camera);
      }
    });
  }
}
