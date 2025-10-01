import * as THREE from 'three';

export default class Viewport {
  constructor(scene, camera) {
    // 1. Create the renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Basic quality settings
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    
    // 2. Add the canvas to the page
    document.body.appendChild(this.renderer.domElement);
    
    // 3. Store scene and camera
    this.scene = scene;
    this.camera = camera;
    
    // 4. Handle window resizing
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // 5. Start the render loop
    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });
  }
}
