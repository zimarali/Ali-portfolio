// Retro desktop: a grey window pops open on a teal desktop and a blinking
// caret types the name out key by key — then fumbles the last letter as an
// "o", beeps, backspaces and fixes it. A chunky mouse pointer glides in and
// double-clicks the name, which hops in a little wave.
import * as THREE from 'three';
import { Scene, squash, landing } from './base.js';
import { Letter } from '../typography.js';
import { hash } from '../effects.js';
import { ease, span, lerp, wobble } from '../motion.js';

const GREY = 0xc6c6c6;
const NAVY = 0x1b2a8c;

function arrowShape() {
  const s = new THREE.Shape();
  const pts = [[0, 0], [0, -1], [0.27, -0.76], [0.45, -1.12], [0.6, -1.04], [0.43, -0.69], [0.76, -0.69]];
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

export class Desktop extends Scene {
  static id = 'desktop';
  static tracking = 0.1;
  title = 'Desktop';
  look = {
    background: 0x2a8a86, floor: 0x27827e, sky: 0xeafffd, ground: 0x1d5f5c, hemi: 1.0,
    key: 0xffffff, keyIntensity: 2.3, keyDir: [-0.5, 1, 0.8], fill: 0xe0f0ff, fillIntensity: 0.5, rimIntensity: 0.6,
    env: 0.4, shadow: 0x0d3533, ghost: 0x0b2b2a,
  };
  // A single flat bevel segment gives the chamfered edge of old UI buttons.
  letterStyle = { depth: 0.26, bevel: 0.06, bevelSpread: 1, bevelSegments: 1 };

  material() { return new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.5 }); }
  dotMaterial() { return new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.4 }); }

  build() {
    const L = this.letters;
    const box = this.layout.box;
    const backZ = Math.min(...this.layout.rows.map((r) => r.z));
    const mat = (color, o = {}) => this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o }));
    const geo = (g) => this.track(g);

    // The window behind the name.
    const W = box.max.x - box.min.x + 1.5, H = 2.05;
    this.win = new THREE.Group();
    this.win.position.set((box.min.x + box.max.x) / 2, 0, backZ - 0.75);
    const frame = new THREE.Mesh(geo(new THREE.BoxGeometry(W, H, 0.14)), mat(GREY));
    frame.position.y = H / 2;
    const bar = new THREE.Mesh(geo(new THREE.BoxGeometry(W - 0.16, 0.26, 0.03)), mat(NAVY, { roughness: 0.35 }));
    bar.position.set(0, H - 0.2, 0.08);
    const pane = new THREE.Mesh(geo(new THREE.BoxGeometry(W - 0.2, H - 0.5, 0.03)), mat(0x172234, { roughness: 0.6 }));
    pane.position.set(0, (H - 0.5) / 2 + 0.1, 0.075);
    this.win.add(frame, bar, pane);
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(geo(new THREE.BoxGeometry(0.2, 0.17, 0.05)), mat(GREY));
      b.position.set(W / 2 - 0.2 - k * 0.24, H - 0.2, 0.11);
      this.win.add(b);
    }
    const xMat = mat(0x222222);
    for (const a of [0.78, -0.78]) {
      const stroke = new THREE.Mesh(geo(new THREE.BoxGeometry(0.12, 0.025, 0.02)), xMat);
      stroke.position.set(W / 2 - 0.2, H - 0.2, 0.145);
      stroke.rotation.z = a;
      this.win.add(stroke);
    }
    for (const m of [frame, bar, pane]) { m.castShadow = m.receiveShadow = true; }
    this.add(this.win);

    // Caret.
    this.caret = new THREE.Mesh(geo(new THREE.BoxGeometry(0.07, 0.95, 0.07)), mat(0x7dffa8, { emissive: 0x3dff86, emissiveIntensity: 0.8 }));
    this.add(this.caret);

    // The typo: an "o" where the final "i" belongs.
    const opts = { curveSegments: this.ctx.tier.curve, bevelSegments: 1, ...this.letterStyle };
    this.typoMat = this.track(new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.5 }));
    this.typo = new Letter(this.ctx.font, 'o', 99, opts, this.typoMat);
    const last = L.at(-1);
    this.typo.root.position.set(last.slot.x + 0.08, 0, last.slot.z);
    this.add(this.typo.root);

    // Key timing with a slightly human rhythm.
    this.typeAt = [];
    let t = 0.62;
    for (let i = 0; i < L.length - 1; i++) {
      this.typeAt.push(t);
      t += 0.13 + hash(i + 3) * 0.07 + (L[i + 1] && L[i + 1].slot.row !== L[i].slot.row ? 0.12 : 0) + (i === 4 ? 0.12 : 0);
    }
    this.typoAt = t;
    this.backAt = t + 0.6;
    this.typeAt.push(this.backAt + 0.32);
    const done = this.typeAt.at(-1);

    // Caret path: after whatever was typed most recently.
    const after = (l, extra = 0.1) => ({ x: l.slot.x + l.size.x / 2 + extra, z: l.slot.z });
    this.caretKeys = [{ t: 0, x: L[0].slot.x - L[0].size.x / 2 - 0.12, z: L[0].slot.z }];
    L.slice(0, -1).forEach((l, i) => this.caretKeys.push({ t: this.typeAt[i], ...after(l) }));
    this.caretKeys.push({ t: this.typoAt, x: this.typo.root.position.x + this.typo.size.x / 2 + 0.1, z: last.slot.z });
    this.caretKeys.push({ t: this.backAt, ...after(L.at(-2)) });
    this.caretKeys.push({ t: done, ...after(last) });
    this.caretGone = done + 0.45;

    // Mouse pointer.
    const arrow = geo(new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }));
    this.pointer = new THREE.Group();
    const white = new THREE.Mesh(arrow, mat(0xffffff, { roughness: 0.35 }));
    const outline = new THREE.Mesh(arrow, mat(0x111111));
    outline.scale.setScalar(1.16);
    outline.position.set(-0.035, 0.05, -0.04);
    white.castShadow = true;
    this.pointer.add(white, outline);
    this.pointer.scale.setScalar(0.48);
    this.add(this.pointer);
    const A = L.find((l) => l.char === 'A');
    this.clickAt = done + 0.85;
    this.pFrom = new THREE.Vector3(box.max.x + 3, -0.6, box.max.z + 2);
    this.pAt = new THREE.Vector3(A.slot.x + 0.12, 0.62, A.slot.z + 0.35);
    this.pRest = new THREE.Vector3(box.max.x + 0.1, 0.45, box.max.z + 0.25);
    this.duration = this.clickAt + 1.5;

    this.typeAt.forEach((at, i) => this.sfx(at, 'click', { pitch: 0.9 + hash(i) * 0.3 }));
    this.sfx(0.12, 'click', { pitch: 0.7 });
    this.sfx(this.typoAt, 'click');
    this.sfx(this.typoAt + 0.2, 'beep', { pitch: 0.45, gain: 1.4 });
    this.sfx(this.backAt, 'click', { pitch: 1.2 });
    this.sfx(this.clickAt, 'click', { pitch: 1.4, gain: 1.2 });
    this.sfx(this.clickAt + 0.17, 'click', { pitch: 1.4, gain: 1.2 });
    this.pokeables = [{ object: this.pointer, onPoke: () => this.doubleClick() }];
    this.pointer.userData.pokeable = this.pokeables[0];
  }

  frameBox() {
    const b = this.layout.box.clone();
    b.max.y = 2.05;
    b.min.z -= 0.9;
    return b;
  }

  pose(t) {
    this.win.scale.set(ease.outBack(span(t, 0.05, 0.4), 1.4) || 0.001, ease.outBack(span(t, 0.12, 0.4), 1.4) || 0.001, 1);

    // Letters pop up as they are typed; a double-click wave at the end.
    this.letters.forEach((l, i) => {
      const at = this.typeAt[i];
      const s = ease.outBack(span(t, at, 0.2), 2.2);
      l.root.position.copy(l.rest.position);
      l.root.scale.setScalar(Math.max(0.001, s));
      l.root.visible = t >= at;
      const hopAt = this.clickAt + 0.3 + i * 0.05;
      const hop = span(t, hopAt, 0.38);
      l.root.position.y += Math.sin(Math.PI * hop) * 0.45;
      squash(l.body, hop >= 1 ? landing(t - hopAt - 0.38, 0.2) : 1 + 0.08 * Math.sin(Math.PI * hop));
    });

    // The typo appears, shudders red with an error beep, and is backspaced.
    const ty = this.typo;
    const inS = ease.outBack(span(t, this.typoAt, 0.2), 2.2);
    const outS = 1 - ease.inBack(span(t, this.backAt, 0.18));
    ty.root.visible = t >= this.typoAt && outS > 0.01;
    ty.root.scale.setScalar(Math.max(0.001, Math.min(inS, outS)));
    ty.root.rotation.z = 0.12 * wobble((t - this.typoAt - 0.2) * 0.9, 4, 3);
    this.typoMat.color.set(GREY).lerp(new THREE.Color(0xe0453a), Math.sin(Math.PI * span(t, this.typoAt + 0.15, 0.45)));

    // Caret: hops to after the latest character; blinks while idle.
    const K = this.caretKeys;
    let k = 0;
    while (k < K.length - 1 && K[k + 1].t <= t) k++;
    const from = K[Math.max(0, k - 1)], to = K[k];
    const u = ease.outCubic(span(t, to.t, 0.06));
    this.caret.position.set(lerp(from.x, to.x, u), 0.5, lerp(from.z, to.z, u));
    const idle = (t < this.typeAt[0] - 0.05) || (t > this.typoAt + 0.1 && t < this.backAt - 0.05) || t > this.typeAt.at(-1) + 0.1;
    const fade = 1 - span(t, this.caretGone - 0.15, 0.15);
    this.caret.visible = fade > 0.01 && t > 0.4 && (!idle || Math.floor(t * 3.4) % 2 === 0);
    this.caret.scale.y = Math.max(0.001, fade);

    // Pointer: glides in, double-clicks the "A", then steps aside.
    const p = this.pointer;
    const inU = ease.inOutCubic(span(t, this.clickAt - 0.75, 0.7));
    const outU = ease.inOutCubic(span(t, this.clickAt + 0.45, 0.7));
    p.position.lerpVectors(this.pFrom, this.pAt, inU).lerp(this.pRest, outU);
    const press = Math.max(Math.sin(Math.PI * span(t, this.clickAt - 0.03, 0.1)), Math.sin(Math.PI * span(t, this.clickAt + 0.14, 0.1)));
    p.position.z -= press * 0.1;
    p.rotation.set(-0.15, 0.25, 0.12 + press * 0.06);
    p.visible = t > this.clickAt - 0.75;
  }

  settle() {
    this.pose(this.duration);
    for (const l of this.letters) { l.root.visible = true; l.root.scale.setScalar(1); }
  }

  /** Letters press in like old UI buttons. */
  react(letter) {
    const k = this.reduced ? 0.4 : 1;
    this.play(letter, 0.32, (p) => {
      const d = Math.sin(Math.PI * Math.min(1, p * 1.6));
      letter.body.position.set(0, -0.03 * d * k, -0.12 * d * k);
      squash(letter.body, 1 - 0.06 * d * k);
    });
    this.ctx.sound.play('click', { pitch: 1 + Math.random() * 0.2 });
  }

  doubleClick() {
    const p = this.pointer;
    const z0 = this.pRest.z;
    this.animate(0.4, (u) => { p.position.z = z0 - 0.1 * Math.max(Math.sin(Math.PI * span(u, 0, 0.25)), Math.sin(Math.PI * span(u, 0.42, 0.25))); });
    this.ctx.sound.play('click', { pitch: 1.4 });
    this.ctx.sound.play('click', { pitch: 1.4, delay: 0.17 });
    this.letters.forEach((l, i) => setTimeout(() => {
      if (l.feel.mode !== 'home') return;
      l.feel.pos.y.kick(2.2);
      l.feel.squash.kick(-2);
      this.stage.wake();
    }, 300 + i * 50));
  }

  dispose() {
    this.typo.dispose();
    super.dispose();
  }
}
