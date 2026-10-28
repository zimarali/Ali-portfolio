// Neon street at night. The letters streak in like data packets and glitch
// into place, the power browns out, then each sign stutters alight — except
// the "z", which sparks and fizzles until it gets a jolt. A scanline sweeps
// the name and everything hums. The wet street mirrors it all.
import * as THREE from 'three';
import { Scene, squash, landing } from './base.js';
import { glowTexture, Particles, hash, sphereDir } from '../effects.js';
import { ease, span, lerp, rng, clamp } from '../motion.js';

const NEON = [0xff2bd6, 0x22e6ff, 0xff2bd6, 0xffd23f, 0x22e6ff, 0xff2bd6, 0x22e6ff, 0xffd23f];
const FLIP = new THREE.Matrix4().makeScale(1, -1, 1);
const SPARKS = 36;
const LIT = 1.25; // lit brightness: saturated, not blown out
const WINDOWS = 0.85; // skyline window brightness
const CELL = 16; // canvas pixels per window

/** Neon flicker: mostly on with irregular dropouts, deterministic in t. */
function flicker(t, seed, rate = 22) {
  const k = Math.floor(t * rate);
  return hash(k * 1.31 + seed * 17.7) > 0.32 ? 1 : 0.08;
}

export class Cyberpunk extends Scene {
  static id = 'cyberpunk';
  static tracking = 0.1;
  title = 'Neon street';
  idleEvery = 9;
  look = {
    background: 0x0c0a1d, floor: 0x120f26, floorRoughness: 0.35, floorOpacity: 0.84, floorMetalness: 0.2,
    sky: 0x6a5cff, ground: 0x0a0814, hemi: 0.35, key: 0xa8b8ff, keyIntensity: 0.9, keyDir: [-0.3, 1, 0.6],
    fill: 0xff2bd6, fillIntensity: 0.5, rim: 0x22e6ff, rimIntensity: 1.6, env: 0.35, shadow: 0x000000, ghost: 0x9a8cff, exposure: 1.1,
  };
  letterStyle = { depth: 0.14, bevel: 0.03, bevelSpread: 0.8, bevelSegments: 3 };
  framing = { elevation: 8, tallElevation: 26 }; // a lower eye line leaves room for the skyline

  material(ch, i) {
    const c = new THREE.Color(NEON[i]);
    return new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.2), emissive: c, emissiveIntensity: 0, roughness: 0.3, metalness: 0.2 });
  }

  build() {
    const L = this.letters;
    const r = rng(12);
    // Soft halo behind every sign: additive glow, no post-processing.
    this.halos = L.map((l, i) => {
      const s = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: glowTexture(), color: NEON[i], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
      s.scale.set(Math.max(1.3, l.size.x * 2.2), l.size.y * 2.1, 1);
      s.position.set(0, l.size.y * 0.5, -0.25);
      l.inner.add(s);
      return s;
    });

    // Reflections: mirrored copies under the semi-transparent wet floor.
    // With two rows, only the front row reflects — the back row's reflection
    // would run straight into the letters in front of it.
    const lastRow = this.layout.rows.length - 1;
    this.mirrors = L.filter((l) => l.slot.row === lastRow).flatMap((l) => [l.body, l.dot].filter(Boolean).map((src) => {
      const m = new THREE.Mesh(src.geometry, src.material);
      m.matrixAutoUpdate = false;
      this.add(m);
      return { m, src };
    }));

    const box = this.layout.box;
    this.skyline(box, r);

    // Arrival: each letter streaks in from the left, staggered.
    this.arrive = L.map((l, i) => 0.1 + i * 0.07 + r() * 0.05);
    this.lightAt = L.map((l, i) => 1.45 + i * 0.17 + r() * 0.1);
    this.dud = Math.min(4, L.length - 1);
    this.jolt = this.lightAt.at(-1) + 0.55;
    this.lightAt[this.dud] = this.jolt;
    this.sweep = this.jolt + 0.35;
    this.duration = this.sweep + 0.9;

    this.sparks = new Particles(SPARKS * 2, { size: 0.3, additive: true });
    this.add(this.sparks.points);
    this.scan = new THREE.Mesh(this.track(new THREE.PlaneGeometry(box.max.x - box.min.x + 2, 0.05)), this.track(new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.scan.position.set((box.min.x + box.max.x) / 2, 0, box.max.z + 0.2);
    this.add(this.scan);

    this.arrive.forEach((a, i) => this.sfx(a + 0.28, 'click', { pitch: 0.6 + i * 0.08 }));
    this.sfx(1.05, 'thud', { pitch: 0.6 });
    this.lightAt.forEach((a, i) => { if (i !== this.dud) this.sfx(a, 'buzz', { pitch: 0.9 + i * 0.05 }); });
    this.sfx(this.lightAt.at(-1) + 0.1, 'buzz', { pitch: 0.5 });
    this.sfx(this.lightAt.at(-1) + 0.32, 'buzz', { pitch: 0.5 });
    this.sfx(this.jolt, 'clack', { pitch: 0.5, gain: 1.3 });
    this.sfx(this.jolt + 0.03, 'buzz', { pitch: 1.2, gain: 1.4 });
    this.sfx(this.sweep, 'swish', { pitch: 2.4, gain: 0.3 });
  }

  /**
   * The city behind the street, in three depths: a painted horizon of far
   * silhouettes against a hazy glow, a row of real towers with lit windows,
   * rooftop beacons and a few signs, and two dark towers framing the edges.
   */
  skyline(box, r) {
    const geo = (g) => this.track(g);
    const cx = (box.min.x + box.max.x) / 2;

    // Far: one painted backdrop — sky fading into a magenta haze, with
    // distant towers in silhouette and pinprick windows.
    const backdrop = new THREE.Mesh(geo(new THREE.PlaneGeometry(64, 8)), this.track(new THREE.MeshBasicMaterial({ map: this.track(this.horizon(r)), fog: false })));
    backdrop.position.set(cx, 4, -30);
    this.add(backdrop);

    // Mid: towers with setbacks, varied window light, antennas and beacons.
    const shell = this.track(new THREE.MeshStandardMaterial({ color: 0x17122e, roughness: 0.75 }));
    this.facades = [];
    this.windowMats = [];
    this.trims = [];
    this.cityX = [box.min.x - 9, box.max.x + 9];
    const beacon = this.track(new THREE.MeshBasicMaterial({ color: 0xff3b4f }));
    this.beacons = [];
    const beaconGeo = geo(new THREE.SphereGeometry(0.06, 8, 6));
    const mast = geo(new THREE.CylinderGeometry(0.02, 0.03, 1, 5));
    const facadeMat = (w, h, x) => {
      // Every building face gets its own windows, so each light is a real room.
      const t = this.track(this.facade(r, w, h));
      const mat = this.track(new THREE.MeshStandardMaterial({ color: 0x17122e, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: WINDOWS, roughness: 0.75 }));
      this.windowMats.push({ mat, x });
      return mat;
    };
    const tower = (x, z, w, h, d) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), [shell, shell, shell, shell, facadeMat(w, h, x), shell]);
      body.position.y = h / 2;
      g.add(body);
      let top = h;
      if (h > 3 && r() > 0.35) {
        // Stepped crown.
        const w2 = w * (0.55 + r() * 0.2), h2 = 0.5 + r() * 0.9;
        const crown = new THREE.Mesh(geo(new THREE.BoxGeometry(w2, h2, d * 0.7)), [shell, shell, shell, shell, facadeMat(w2, h2, x), shell]);
        crown.position.y = h + h2 / 2;
        g.add(crown);
        top += h2;
      }
      if (r() > 0.4) {
        const m = new THREE.Mesh(mast, shell);
        const mh = 0.4 + r() * 0.8;
        m.scale.y = mh;
        m.position.y = top + mh / 2;
        const b = new THREE.Mesh(beaconGeo, beacon);
        b.position.y = top + mh;
        this.beacons.push({ mesh: b, rate: 2 + r() * 2.5, phase: r() * 6 });
        g.add(m, b);
      }
      g.position.set(x, 0, z);
      this.add(g);
      return { g, w, h: top, body: h, d };
    };

    // Clean neon trim: a crisp tube along an edge with a soft glow behind it.
    const glowGeo = geo(new THREE.PlaneGeometry(1, 1));
    const neon = (t, color, from, to) => {
      const len = from.distanceTo(to);
      const vertical = Math.abs(to.y - from.y) > Math.abs(to.x - from.x);
      const mat = this.track(new THREE.MeshBasicMaterial({ color }));
      const tube = new THREE.Mesh(geo(vertical ? new THREE.BoxGeometry(0.045, len, 0.045) : new THREE.BoxGeometry(len, 0.045, 0.045)), mat);
      tube.position.lerpVectors(from, to, 0.5);
      const glowMat = this.track(new THREE.MeshBasicMaterial({ color, map: glowTexture(), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.scale.set(vertical ? 0.5 : len + 0.3, vertical ? len + 0.3 : 0.5, 1);
      glow.position.copy(tube.position).add(new THREE.Vector3(0, 0, -0.03));
      t.g.add(tube, glow);
      this.trims.push({ mat, glowMat, color: new THREE.Color(color), x: t.g.position.x });
    };
    const mids = [];
    const spread = box.max.x - box.min.x + 16;
    for (let k = 0; k < 11; k++) {
      const w = 0.9 + r() * 1.2, h = 1.5 + r() * 3, d = 1 + r() * 0.6;
      mids.push(tower(cx - spread / 2 + (k + 0.5) * (spread / 11) + (r() - 0.5) * 0.8, -12 - r() * 5, w, h, d));
    }

    // A couple of blank vertical neon signs and one billboard — just enough.
    const signColors = [0xff2bd6, 0x22e6ff];
    mids.filter((m) => m.h > 3).slice(0, 2).forEach((m, k) => {
      const panel = new THREE.Mesh(geo(new THREE.BoxGeometry(0.24, 1.2, 0.05)), this.track(new THREE.MeshBasicMaterial({ color: signColors[k] })));
      panel.position.set(m.w / 2 - 0.2, m.body * 0.62, m.d / 2 + 0.03);
      const ink = this.track(new THREE.MeshBasicMaterial({ color: 0x1a0f2e }));
      for (let j = 0; j < 4; j++) {
        const mark = new THREE.Mesh(geo(new THREE.BoxGeometry(0.12, 0.09 + r() * 0.09, 0.02)), ink);
        mark.position.set(0, 0.42 - j * 0.27, 0.03);
        panel.add(mark);
      }
      m.g.add(panel);
    });
    const host = mids.reduce((a, b) => (Math.abs(a.g.position.x - cx) < Math.abs(b.g.position.x - cx) && a.h > 2.6 ? a : b));
    const board = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.5, 0.68)), this.track(new THREE.MeshBasicMaterial({ map: this.track(this.billboard()) })));
    board.position.set(0, Math.max(0.6, Math.min(host.h - 0.55, 2.4)), host.d / 2 + 0.03);
    host.g.add(board);

    // A few mid towers get a single roofline of neon.
    mids.filter((m) => m !== host && m.body > 2.2).filter((_, k) => k % 3 === 1).forEach((m, k) => {
      const y = m.body - 0.05, z = m.d / 2 + 0.025;
      neon(m, k % 2 ? 0x22e6ff : 0xff2bd6, new THREE.Vector3(-m.w / 2, y, z), new THREE.Vector3(m.w / 2, y, z));
    });

    // Near: two big dark towers framing the edges. Neon runs up the inner
    // corner and turns along a ledge: one clean line each.
    for (const side of [-1, 1]) {
      const w = 2.4, h = 9, d = 2;
      const t = tower(side > 0 ? box.max.x + 3.6 : box.min.x - 3.6, -6.5, w, h, d);
      const color = side > 0 ? 0x22e6ff : 0xff2bd6;
      const cornerX = -side * (w / 2 - 0.025), z = d / 2 + 0.025, ledge = 3.2;
      neon(t, color, new THREE.Vector3(cornerX, 0.25, z), new THREE.Vector3(cornerX, h, z));
      neon(t, color, new THREE.Vector3(cornerX, ledge, z), new THREE.Vector3(side * (w / 2), ledge, z));
    }
  }

  /**
   * One building face: a grid of windows sized like real rooms (~0.3 units).
   * Mostly dark, warm and cool lights, the odd floor fully off, a TV or two.
   * Every window keeps a brightness level so lights can fade on and off.
   */
  facade(r, w, h) {
    const cols = Math.max(2, Math.round(w / 0.3));
    const rows = Math.max(3, Math.round(h / 0.32));
    const c = document.createElement('canvas');
    c.width = cols * CELL;
    c.height = rows * CELL;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    const palette = ['#ffcf8a', '#ffcf8a', '#ffe2b8', '#9fdcff', '#ff9ad9'];
    const cells = [];
    for (let y = 0; y < rows; y++) {
      const darkFloor = r() < 0.18;
      for (let x = 0; x < cols; x++) {
        const on = !darkFloor && r() < 0.3;
        cells.push({ x, y, color: palette[Math.floor(r() * palette.length)], alpha: 0.6 + r() * 0.4, level: on ? 1 : 0, target: on ? 1 : 0, delay: 0 });
      }
    }
    const lit = cells.filter((cell) => cell.level);
    const tvs = lit.sort(() => r() - 0.5).slice(0, cells.length > 40 ? 2 : 1);
    tvs.forEach((tv, k) => { tv.tv = true; tv.color = k % 2 ? '#7fb4ff' : '#a9c8ff'; tv.seed = r() * 50; });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const face = { g, tex: t, cols, rows, cells, tvs, base: lit.length / cells.length };
    t.userData = face;
    for (const cell of cells) this.paintWindow(face, cell);
    this.facades.push(face);
    return t;
  }

  paintWindow(face, cell) {
    const { g } = face;
    const x = cell.x * CELL, y = (face.rows - 1 - cell.y) * CELL;
    g.globalAlpha = 1;
    g.fillStyle = '#000';
    g.fillRect(x, y, CELL, CELL);
    if (cell.level < 0.01) return;
    g.globalAlpha = cell.alpha * cell.level;
    g.fillStyle = cell.color;
    g.fillRect(x + 3, y + 3, CELL - 6, CELL - 5);
    g.globalAlpha = 1;
  }

  /**
   * Someone somewhere: a room light switches on or off, or now and then a
   * person walks a corridor and the lights follow them along the floor.
   */
  lifeEvent() {
    const face = this.facades[Math.floor(Math.random() * this.facades.length)];
    const litNow = face.cells.filter((c) => c.target).length / face.cells.length;
    // Steer back toward the building's usual density.
    const turnOn = litNow < face.base ? Math.random() < 0.75 : Math.random() < 0.3;
    if (Math.random() < 0.3 && face.cols >= 3) {
      const y = Math.floor(Math.random() * face.rows);
      const len = Math.min(face.cols, 3 + Math.floor(Math.random() * 4));
      const dir = Math.random() < 0.5 ? 1 : -1;
      const x0 = dir > 0 ? Math.floor(Math.random() * (face.cols - len + 1)) : face.cols - 1 - Math.floor(Math.random() * (face.cols - len + 1));
      for (let k = 0; k < len; k++) {
        const cell = face.cells[y * face.cols + x0 + dir * k];
        if (!cell || cell.tv) continue;
        this.fade(face, cell, turnOn ? 1 : 0, k * 0.22);
      }
    } else {
      const pool = face.cells.filter((c) => !c.tv && !!c.target !== turnOn);
      const cell = pool[Math.floor(Math.random() * pool.length)];
      if (cell) this.fade(face, cell, turnOn ? 1 : 0, 0);
    }
  }

  fade(face, cell, target, delay) {
    cell.target = target;
    cell.delay = delay;
    this.fading.add({ face, cell });
  }

  /** The skyline browns out with the signs, then powers back on in a sweep. */
  poseCity(t) {
    const [x0, x1] = this.cityX;
    const back = this.lightAt[0] + 0.1;
    const level = (x) => {
      if (t < 1.0) return 1;
      const at = back + ((x - x0) / (x1 - x0)) * 1.3;
      if (t < at) return 0.1;
      return t < at + 0.25 ? (flicker(t, x * 7, 24) > 0.5 ? 1 : 0.3) : 1;
    };
    for (const w of this.windowMats) w.mat.emissiveIntensity = WINDOWS * level(w.x);
    for (const n of this.trims) {
      const k = level(n.x);
      n.mat.color.copy(n.color).multiplyScalar(0.15 + 0.85 * k);
      n.glowMat.opacity = 0.4 * k;
    }
  }

  /** Sky with a low magenta haze and a strip of far-off silhouettes. */
  horizon(r) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#0c0a1d');
    sky.addColorStop(0.55, '#1d1240');
    sky.addColorStop(0.86, '#5a1d5e');
    sky.addColorStop(1, '#2a1238');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1024, 256);
    // Distant towers.
    for (let x = 0; x < 1024;) {
      const w = 10 + r() * 34, h = 30 + r() * 110;
      g.fillStyle = '#1a1232';
      g.fillRect(x, 256 - h, w, h);
      g.fillStyle = 'rgba(255,207,138,0.5)';
      for (let k = 0; k < h * w * 0.004; k++) g.fillRect(x + 2 + r() * (w - 4), 256 - h + 3 + r() * (h - 6), 1.5, 1.5);
      x += w + r() * 6;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** An abstract billboard that cycles through a few designs. */
  billboard() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 116;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.board = { g: c.getContext('2d'), tex, slide: -1 };
    this.drawBoard(0);
    return tex;
  }

  drawBoard(time) {
    const { g, tex } = this.board;
    const slide = Math.floor(time / 3.5) % 3;
    const looks = [['#ff2bd6', '#6a3cff', '#22e6ff'], ['#ffb23f', '#ff2b7a', '#6a3cff'], ['#22e6ff', '#2b7aff', '#b82bff']];
    const [a, b, c] = looks[slide];
    const grd = g.createLinearGradient(0, 0, 256, 116);
    grd.addColorStop(0, a);
    grd.addColorStop(0.55, b);
    grd.addColorStop(1, c);
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 116);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 6;
    if (slide === 0) {
      g.beginPath(); g.arc(78, 58, 30, 0, Math.PI * 2); g.stroke();
      g.fillRect(132, 40, 92, 10); g.fillRect(132, 62, 64, 10);
    } else if (slide === 1) {
      g.strokeRect(36, 30, 56, 56);
      g.fillRect(118, 34, 100, 10); g.fillRect(118, 54, 80, 10); g.fillRect(118, 74, 56, 10);
    } else {
      g.beginPath(); g.moveTo(46, 86); g.lineTo(78, 30); g.lineTo(110, 86); g.closePath(); g.stroke();
      g.fillRect(140, 48, 84, 10); g.fillRect(140, 68, 52, 10);
    }
    // A slow light sheen sliding across.
    const x = ((time * 0.45) % 1.6 - 0.3) * 256;
    const sheen = g.createLinearGradient(x - 30, 0, x + 30, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, 256, 116);
    tex.needsUpdate = true;
  }

  /** How brightly letter i glows at time t. */
  glow(i, t) {
    const at = this.lightAt[i];
    const streak = t < 1.0 ? 0.9 * span(t, this.arrive[i], 0.3) : 0;
    const brown = t >= 1.0 && t < at ? 0.04 : 0;
    if (i === this.dud && t < at) {
      // The dud sputters twice before the jolt.
      const s1 = Math.sin(Math.PI * span(t, this.lightAt.at(-1) + 0.08, 0.12));
      const s2 = Math.sin(Math.PI * span(t, this.lightAt.at(-1) + 0.3, 0.1));
      return Math.max(streak, brown, LIT * Math.max(s1, s2) * flicker(t, 9, 40));
    }
    if (t < at) return Math.max(streak, brown);
    const settle = span(t, at, 0.5);
    return settle >= 1 ? LIT : LIT * (settle > 0.7 ? 1 : flicker(t, i));
  }

  pose(t) {
    this.poseCity(t);
    this.letters.forEach((l, i) => {
      const a = this.arrive[i];
      const u = span(t, a, 0.3);
      // Streak in from off-screen left, stretched; then a stepped glitch settle.
      const x = lerp(l.slot.x - 14, l.slot.x, ease.outQuart(u));
      const glitch = t > a + 0.3 && t < a + 0.65 ? (hash(Math.floor(t * 30) + i * 7) - 0.5) * 0.25 * (1 - span(t, a + 0.3, 0.35)) : 0;
      l.root.position.set(x + glitch, l.rest.position.y, l.slot.z);
      l.root.scale.set(1 + (1 - u) * 2.5, 1, 1);
      l.root.visible = t >= a;
      // The dud jumps when jolted.
      const jolt = span(t, this.jolt, 0.3);
      if (i === this.dud) l.root.position.y += Math.sin(Math.PI * jolt) * 0.25;
      squash(l.body, i === this.dud ? landing(t - this.jolt - 0.3, 0.2) : 1);
      const g = this.glow(i, t);
      l.body.material.emissiveIntensity = g;
      this.halos[i].material.opacity = clamp(g / LIT) * 0.6;
    });

    // Sparks off the dud while it sputters, and a shower on the jolt.
    const dud = this.letters[this.dud];
    const origin = new THREE.Vector3(dud.slot.x, dud.size.y * 0.9, dud.slot.z + 0.1);
    const col = new THREE.Color(0xffe39a);
    const dir = new THREE.Vector3();
    let n = 0;
    for (const [start, count] of [[this.lightAt.at(-1) + 0.1, SPARKS * 0.6], [this.jolt, SPARKS * 1.4]]) {
      const age = t - start;
      if (age < 0 || age > 0.9) continue;
      for (let k = 0; k < count; k++) {
        sphereDir(k + start * 100, dir);
        const sp = 1.5 + hash(k + 5) * 2.5;
        const x = origin.x + dir.x * sp * age, z = origin.z + Math.abs(dir.z) * sp * age;
        const y = Math.max(0.02, origin.y + (dir.y * sp + 1.2) * age - 6 * age * age);
        this.sparks.set(n++, x, y, z, col, clamp(1 - age / 0.9));
      }
    }
    this.sparks.commit(n);

    // Scanline sweep.
    const su = span(t, this.sweep, 0.7);
    this.scan.visible = su > 0 && su < 1;
    this.scan.position.y = lerp(-0.1, this.layout.box.max.y + 0.4, ease.inOutSine(su));
    this.scan.material.opacity = Math.sin(Math.PI * su) * 0.8;
  }

  /** Keep the reflections in step with the letters, wherever they are. */
  tick() {
    for (const { m, src } of this.mirrors) {
      src.updateWorldMatrix(true, false);
      m.matrix.multiplyMatrices(FLIP, src.matrixWorld);
      m.matrixWorldNeedsUpdate = true;
      let shown = true;
      for (let o = src; o; o = o.parent) shown &&= o.visible;
      m.visible = shown;
    }
    return false;
  }

  settle() {
    this.pose(this.duration);
    this.sparks.commit(0);
    this.stage.wake(); // start the city's background life
  }

  /**
   * The city keeps living behind the name: lights come and go, a few TVs
   * flicker blue, rooftop beacons blink, the billboard cycles, the neon hums.
   */
  ambient(time) {
    const dt = Math.min(0.2, time - (this.lastAmbient ?? time));
    this.lastAmbient = time;
    this.fading ??= new Set();
    // Life in the windows: something happens every third of a second or so.
    this.nextLife ??= time + 0.3;
    while (time > this.nextLife) {
      this.lifeEvent();
      this.nextLife += 0.1 + Math.random() * 0.22;
    }
    const dirty = new Set();
    for (const f of this.fading) {
      const { face, cell } = f;
      if (cell.delay > 0) { cell.delay -= dt; continue; }
      const step = dt / 0.45;
      cell.level = cell.target > cell.level ? Math.min(cell.target, cell.level + step) : Math.max(cell.target, cell.level - step * 0.8);
      this.paintWindow(face, cell);
      dirty.add(face);
      if (cell.level === cell.target) this.fading.delete(f);
    }
    // TVs: bluish light that flickers at its own pace.
    const tick = Math.floor(time * 7);
    if (tick !== this.tvTick) {
      this.tvTick = tick;
      for (const face of this.facades) for (const tv of face.tvs) {
        tv.alpha = 0.35 + 0.65 * hash(tick + tv.seed);
        this.paintWindow(face, tv);
        dirty.add(face);
      }
    }
    for (const face of dirty) face.tex.needsUpdate = true;
    for (const b of this.beacons) b.mesh.visible = Math.sin(time * b.rate + b.phase) > 0.2;
    for (const [k, n] of this.trims.entries()) {
      // A soft hum, and every so often one strip stutters.
      const stutter = hash(Math.floor(time / 3) * 13 + k) > 0.88 ? flicker(time, k, 18) : 1;
      n.mat.color.copy(n.color).multiplyScalar((0.9 + 0.1 * Math.sin(time * 2.3 + k)) * (0.3 + 0.7 * stutter));
      n.glowMat.opacity = 0.4 * stutter;
    }
    this.drawBoard(time);
    return true;
  }

  /** A poke shorts the sign out for a moment: flicker and a glitch jump. */
  react(letter) {
    const i = letter.index;
    const k = this.reduced ? 0.3 : 1;
    this.play(letter, 0.6, (p, t) => {
      const on = p > 0.85 ? 1 : flicker(t + i, i * 3, 26);
      letter.body.material.emissiveIntensity = LIT * on;
      this.halos[i].material.opacity = 0.55 * on;
      letter.body.position.x = p < 0.5 ? (hash(Math.floor(t * 30) + i) - 0.5) * 0.18 * k : 0;
    });
    this.ctx.sound.play('buzz', { pitch: 0.8 + Math.random() * 0.4 });
  }

  /** Once in a while a single sign blinks, then holds steady again. */
  idle() {
    const l = this.letters[Math.floor(Math.random() * this.letters.length)];
    if (l.feel.mode === 'home') this.react(l);
  }
}
