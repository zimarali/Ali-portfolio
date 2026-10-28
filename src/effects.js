// Small shared effects: a soft glow texture and a pooled point cloud for
// sparks, fireworks, confetti and snow. Scenes position particles as a pure
// function of time, like everything else.
import * as THREE from 'three';

let glow;
/** Soft white radial falloff, for halos and glowing particles. */
export function glowTexture() {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
}

/**
 * A fixed pool of points. Call set(i, ...) for the ones you want, then
 * commit(used) — the rest are parked out of sight.
 */
export class Particles {
  constructor(count, { size = 0.08, additive = false, glow: useGlow = additive, opacity = 1 } = {}) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.material = new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, opacity, depthWrite: false,
      map: useGlow ? glowTexture() : null,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: !additive, // glowing sparks shouldn't sink into the haze
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  set(i, x, y, z, color, fade = 1) {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = color.r * fade; this.col[i * 3 + 1] = color.g * fade; this.col[i * 3 + 2] = color.b * fade;
  }

  commit(used) {
    for (let i = used; i < this.count; i++) this.pos[i * 3 + 1] = -999;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** Deterministic hash in [0, 1) — for flicker patterns and per-particle randomness. */
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Unit vector spread over a sphere, stable for index i. */
export function sphereDir(i, out = new THREE.Vector3()) {
  const u = hash(i * 1.7 + 0.3) * 2 - 1;
  const a = hash(i * 3.1 + 7.7) * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return out.set(r * Math.cos(a), u, r * Math.sin(a));
}
