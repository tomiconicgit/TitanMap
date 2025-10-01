// file: procedural-textures.js
// Generates procedural 2D thumbnails for terrain types.
// Also exports a helper to make a THREE.CanvasTexture later if you want to put these on meshes.

export function generateTerrainThumbnail(type, size = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');

  // Helpers
  const randRange = (a, b) => a + Math.random() * (b - a);
  const jitter = (v, amount) => Math.max(0, Math.min(255, v + Math.floor((Math.random()*2-1)*amount)));
  const rgba = (r, g, b, a=1) => `rgba(${r},${g},${b},${a})`;

  // Clear
  g.clearRect(0, 0, size, size);

  switch ((type || '').toLowerCase()) {
    case 'sand': {
      g.fillStyle = '#D8C6A3';
      g.fillRect(0, 0, size, size);
      // subtle dunes (soft bands)
      g.globalAlpha = 0.25;
      for (let i=0;i<4;i++){
        const y = randRange(0, size);
        const h = randRange(size*0.06, size*0.14);
        const grad = g.createLinearGradient(0, y, 0, y+h);
        grad.addColorStop(0.0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.06)');
        grad.addColorStop(1.0, 'rgba(255,255,255,0.06)');
        g.fillStyle = grad;
        g.fillRect(0, y, size, h);
      }
      // grains
      g.globalAlpha = 0.45;
      for (let i=0;i<220;i++){
        const x = Math.random()*size, y = Math.random()*size;
        const r = randRange(0.4, 1.2);
        const v = 190 + Math.floor(Math.random()*40);
        g.fillStyle = rgba(v, v-10, v-40, 0.45);
        g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill();
      }
      g.globalAlpha = 1;
      break;
    }

    case 'dirt': {
      g.fillStyle = '#7A5C3E';
      g.fillRect(0, 0, size, size);
      // dark patches
      g.globalAlpha = 0.25;
      for (let i=0;i<8;i++){
        const x = randRange(0, size), y = randRange(0, size);
        const rx = randRange(size*0.1, size*0.25), ry = randRange(size*0.08, size*0.2);
        g.fillStyle = 'rgba(40,25,15,0.5)';
        g.beginPath();
        g.ellipse(x, y, rx, ry, Math.random()*Math.PI, 0, Math.PI*2);
        g.fill();
      }
      // clumps
      g.globalAlpha = 0.5; g.fillStyle = 'rgba(60,40,25,0.5)';
      for (let i=0;i<160;i++){
        g.beginPath();
        g.arc(randRange(0,size), randRange(0,size), randRange(0.5,1.4), 0, Math.PI*2);
        g.fill();
      }
      g.globalAlpha = 1;
      break;
    }

    case 'grass': {
      g.fillStyle = '#49A14A';
      g.fillRect(0, 0, size, size);
      // blades (strokes)
      g.globalAlpha = 0.6;
      g.strokeStyle = '#5EC85F';
      for (let i=0;i<140;i++){
        const x = randRange(0, size), y = randRange(0, size);
        const len = randRange(3, 8);
        g.lineWidth = randRange(0.6, 1.4);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + randRange(-2,2), y - len);
        g.stroke();
      }
      // darker noise
      g.globalAlpha = 0.25; g.fillStyle = 'rgba(0,60,0,0.5)';
      for (let i=0;i<120;i++){
        g.beginPath();
        g.arc(randRange(0,size), randRange(0,size), randRange(0.6,1.6), 0, Math.PI*2);
        g.fill();
      }
      g.globalAlpha = 1;
      break;
    }

    case 'stone': {
      g.fillStyle = '#9DA3AA';
      g.fillRect(0, 0, size, size);
      // speckles
      g.globalAlpha = 0.5;
      for (let i=0;i<200;i++){
        const v = 120 + Math.floor(Math.random()*80);
        g.fillStyle = rgba(v, v, v, 0.65);
        g.beginPath();
        g.arc(randRange(0,size), randRange(0,size), randRange(0.5,1.8), 0, Math.PI*2);
        g.fill();
      }
      // hairline cracks
      g.globalAlpha = 0.3;
      g.strokeStyle = 'rgba(40,40,40,0.5)';
      for (let i=0;i<6;i++){
        let x = randRange(0,size), y = randRange(0,size);
        g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y);
        const segs = 6+Math.floor(Math.random()*6);
        for (let s=0;s<segs;s++){
          x += randRange(-10,10); y += randRange(-8,8);
          g.lineTo(x,y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }

    case 'gravel': {
      g.fillStyle = '#8D8E90';
      g.fillRect(0, 0, size, size);
      // pebbles
      for (let i=0;i<100;i++){
        const x = randRange(0,size), y = randRange(0,size);
        const rx = randRange(2, 5), ry = randRange(1.5, 4.5);
        const v = 120 + Math.floor(Math.random()*100);
        g.fillStyle = rgba(jitter(v,20), jitter(v,20), jitter(v,20), 1);
        g.beginPath();
        g.ellipse(x, y, rx, ry, Math.random()*Math.PI, 0, Math.PI*2);
        g.fill();
        // subtle highlight
        g.globalAlpha = 0.25; g.fillStyle = 'white';
        g.beginPath(); g.ellipse(x - rx*0.3, y - ry*0.3, rx*0.3, ry*0.25, Math.random()*Math.PI, 0, Math.PI*2); g.fill();
        g.globalAlpha = 1;
      }
      break;
    }

    case 'water': {
      // vertical gradient
      const grad = g.createLinearGradient(0,0,0,size);
      grad.addColorStop(0,  '#0e79d6');
      grad.addColorStop(1,  '#0b4e8a');
      g.fillStyle = grad;
      g.fillRect(0,0,size,size);
      // waves
      g.globalAlpha = 0.25;
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      for (let y=0;y<size;y+=8){
        g.beginPath();
        for (let x=0;x<=size;x++){
          const yy = y + Math.sin((x/size)*Math.PI*2 + y*0.15) * 1.6;
          if (x===0) g.moveTo(x,yy); else g.lineTo(x,yy);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }

    default: {
      // fallback checker
      for (let y=0;y<size;y+=16){
        for (let x=0;x<size;x+=16){
          g.fillStyle = ((x+y)/16)%2 ? '#333' : '#222';
          g.fillRect(x,y,16,16);
        }
      }
    }
  }

  return c;
}

// Optional: make a THREE material using the same canvas texture (for later painting)
export function materialForTerrain(type, THREE, opts = {}) {
  const size = opts.size || 256;
  const canvas = generateTerrainThumbnail(type, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1,1);
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: true
  });
}