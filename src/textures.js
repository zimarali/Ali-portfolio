// Procedural canvas textures (wood grain, paper fibre, sand speckle) so
// the site ships no image assets. Callers own and dispose the textures.
import * as THREE from 'three';
import { rng } from './motion.js';

function canvasTexture(size, draw, { repeat = 1, color = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Long, softly wavering grain lines over a warm base. */
export function woodTexture(base = '#c98f55', dark = '#9b6634', seed = 3) {
  const r = rng(seed);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const y0 = r() * s;
      g.strokeStyle = dark;
      g.globalAlpha = 0.08 + r() * 0.2;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      for (let x = 0; x <= s; x += 8) {
        const y = y0 + Math.sin(x * 0.02 + i) * 3 + Math.sin(x * 0.07 + i * 3) * 1.2;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

/** Fine fibre noise, used as a bump/roughness hint for paper. */
export function paperTexture(seed = 5) {
  const r = rng(seed);
  return canvasTexture(128, (g, s) => {
    const img = g.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const v = 200 + r() * 55;
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
  }, { repeat: 2, color: false });
}

/** Speckled sand for the shore scene's floor. */
export function sandTexture(base = '#e9d3ae', seed = 9) {
  const r = rng(seed);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(120,90,50,0.18)' : 'rgba(255,255,255,0.35)';
      g.fillRect(r() * s, r() * s, 1 + r() * 1.4, 1 + r() * 1.4);
    }
  }, { repeat: 40 });
}
