// A marble taps a lead-in line of dominoes — the first one wobbles and
// refuses, the marble tries again — and the chain clatters through the
// letters, which stand edge-on in a tight row. Once the last one falls,
// the letters spring upright, turn to face you and spread into place.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three';
import { Scene } from './base.js';
import { ease, span, wobble, lerp, clamp } from '../motion.js';

const GAP = 0.44;
const UP = new THREE.Vector3(0, 1, 0);
const LEAD = 5;
const DOMINO = { w: 0.4, h: 0.74, t: 0.13 };

const qYaw = new THREE.Quaternion();
const qFall = new THREE.Quaternion();
const vE = new THREE.Vector3();
const vA = new THREE.Vector3();
const axis = new THREE.Vector3();

export class Dominoes extends Scene {
  static id = 'dominoes';
  static tracking = 0.08;
  title = 'Domino run';
  look = {
    background: 0x233041, floor: 0x283850, floorRoughness: 1, sky: 0xb9c8e6, ground: 0x1a2330, hemi: 0.75,
    key: 0xffe7c4, keyIntensity: 3.4, keyDir: [-0.35, 1, 0.45], fill: 0x8fb0ff, fillIntensity: 0.35, rim: 0xffd9a8, rimIntensity: 1.6,
    env: 0.5, shadow: 0x05080d, ghost: 0xf4ead8, exposure: 1.05,
  };
  letterStyle = { depth: 0.2, bevel: 0.03, bevelSpread: 0.9 };

  material() {
    return new THREE.MeshPhysicalMaterial({ color: 0xf4ead8, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  }
  dotMaterial() {
    return new THREE.MeshPhysicalMaterial({ color: 0xe7533f, roughness: 0.3, clearcoat: 1 });
  }

  build() {
    const pieces = [];
    const lay = this.layout;
    const rows = lay.rows;

    const dominoGeo = this.track(new RoundedBoxGeometry(DOMINO.w, DOMINO.h, DOMINO.t * 2, 3, 0.035));
    dominoGeo.translate(0, DOMINO.h / 2, 0);
    const pipGeo = this.track(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12));
    const lineGeo = this.track(new THREE.BoxGeometry(DOMINO.w * 0.7, 0.014, 0.012));
    const ebony = this.track(new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }));
    const ivory = this.track(new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.4 }));
    const makeDomino = (n) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(dominoGeo, ebony);
      body.castShadow = body.receiveShadow = true;
      const line = new THREE.Mesh(lineGeo, ivory);
      line.position.set(0, DOMINO.h / 2, DOMINO.t + 0.002);
      g.add(body, line);
      const spots = [[0, 0.18], [0, 0.56], [-0.1, 0.1], [0.1, 0.26], [-0.1, 0.48], [0.1, 0.64]].slice(0, 2 + (n % 4));
      for (const [x, y] of spots) {
        const pip = new THREE.Mesh(pipGeo, ivory);
        pip.rotation.x = Math.PI / 2;
        pip.position.set(x, y, DOMINO.t + 0.003);
        g.add(pip);
      }
      this.add(g);
      this.addBlob(body, { strength: 0.8 });
      return g;
    };

    // Letters stand edge-on in a tight row; each row runs one way.
    const rowChain = (row, dirX) => {
      const idx = dirX > 0 ? row.indices : [...row.indices].reverse();
      // Compressed toward the row's starting end, so the run leads straight in.
      const x0 = this.letters[idx[0]].slot.x;
      return idx.map((li, k) => ({
        kind: 'letter', letter: this.letters[li],
        base: new THREE.Vector3(x0 + dirX * k * GAP, 0, row.z),
        dir: new THREE.Vector3(dirX, 0, 0),
      }));
    };
    const r0 = rowChain(rows[0], 1);
    // Lead-in: a gentle curve sweeping in from the back left.
    const first = r0[0].base;
    for (let k = LEAD; k >= 1; k--) {
      const ang = k * 0.17;
      const d = 0.62 + GAP * (k - 1);
      const base = new THREE.Vector3(first.x - Math.cos(ang) * d, 0, first.z - Math.sin(ang) * d * 0.9);
      pieces.push({ kind: 'domino', base, obj: makeDomino(k) });
    }
    pieces.push(...r0);
    if (rows[1]) {
      // Two rows: a ring of dominoes carries the run round to the front row.
      const r1 = rowChain(rows[1], -1);
      const a = r0.at(-1).base, b = r1[0].base;
      const xr = Math.max(rows[0].xMax, rows[1].xMax) + 0.75;
      const zc = (a.z + b.z) / 2, rad = (b.z - a.z) / 2;
      const len = Math.PI * rad + Math.abs(a.x - b.x);
      const count = Math.max(3, Math.round(len / GAP) - 1);
      for (let k = 1; k <= count; k++) {
        const ang = -Math.PI / 2 + (Math.PI * k) / (count + 1);
        pieces.push({ kind: 'domino', base: new THREE.Vector3(xr + Math.cos(ang) * rad * 0.9, 0, zc + Math.sin(ang) * rad), obj: makeDomino(k + 3) });
      }
      pieces.push(...r1);
    }

    // Directions follow the path; heights and thickness per piece.
    pieces.forEach((p, i) => {
      if (!p.dir) {
        const next = pieces[i + 1].base, prev = pieces[Math.max(0, i - 1)].base;
        p.dir = next.clone().sub(i ? prev : p.base).setY(0).normalize();
      }
      p.h = p.kind === 'letter' ? p.letter.size.y : DOMINO.h;
      p.th = p.kind === 'letter' ? p.letter.size.z / 2 : DOMINO.t;
      p.yaw = Math.atan2(p.dir.x, p.dir.z);
    });

    // Timing: each piece starts when the previous one's top reaches it.
    let t = 1.18;
    pieces.forEach((p, i) => {
      const next = pieces[i + 1];
      p.start = t;
      p.T = (0.3 * Math.sqrt(p.h) + 0.06) * Math.pow(0.975, i);
      if (next) {
        const D = p.base.distanceTo(next.base) - p.th - next.th;
        p.contact = Math.asin(clamp(D / p.h, 0.05, 0.97));
        p.final = Math.acos(clamp((2 * next.th + 0.01) / p.h, 0, 1));
        p.final = Math.max(p.final, p.contact);
        t += p.T * Math.sqrt(p.contact / (Math.PI / 2));
        this.sfx(t, 'clack', { pitch: 0.8 + (i % 5) * 0.06, gain: 0.8 });
      } else {
        p.contact = p.final = Math.PI / 2;
        this.chainEnd = t + p.T;
        this.sfx(this.chainEnd, 'thud');
      }
    });
    this.pieces = pieces;

    // Spring-up: letters launch in a quick ripple once everything is down.
    const letterPieces = pieces.filter((p) => p.kind === 'letter');
    letterPieces.forEach((p, k) => {
      p.launch = this.chainEnd + 0.32 + k * 0.065;
      this.sfx(p.launch, 'boing', { pitch: 1 + k * 0.05, gain: 0.5 });
      this.sfx(p.launch + 0.62, 'tok', { pitch: 1.2 + k * 0.04, gain: 0.6 });
    });
    this.duration = letterPieces.at(-1).launch + 1.05;
    // The plain dominoes hop back upright too, last one first, leaving a
    // tidy curve that leads into the name.
    const dominoes = pieces.filter((p) => p.kind === 'domino').reverse();
    dominoes.forEach((p, k) => {
      p.restore = letterPieces[0].launch - 0.04 + k * 0.05;
      this.sfx(p.restore + 0.3, 'clack', { pitch: 1.2 + k * 0.05, gain: 0.35 });
    });

    // The marble.
    const marbleMat = this.track(new THREE.MeshPhysicalMaterial({ color: 0xe7533f, roughness: 0.08, clearcoat: 1, transmission: 0, metalness: 0.05 }));
    this.marble = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.11, 24, 16)), marbleMat);
    this.marble.castShadow = true;
    this.add(this.marble);
    this.addBlob(this.marble, { strength: 1.2 });
    const p0 = pieces[0];
    const touch = p0.base.clone().addScaledVector(p0.dir, -(p0.th + 0.11));
    const far = p0.base.clone().addScaledVector(p0.dir, -3.2).add(new THREE.Vector3(0, 0, -0.6));
    const back = touch.clone().addScaledVector(p0.dir, -0.32);
    this.marblePath = { far, touch, back };
    this.sfx(0.62, 'tok', { pitch: 1.6, gain: 0.5 });
    this.sfx(1.18, 'tok', { pitch: 1.7, gain: 0.7 });
  }

  frameBox() {
    const b = this.layout.box.clone();
    for (const p of this.pieces) b.expandByPoint(p.base);
    // On narrow screens let the lead-in run off the edges; the name comes first.
    if (this.layout.mode === 'double') {
      b.min.x = Math.max(b.min.x, this.layout.box.min.x - 0.5);
      b.max.x = Math.min(b.max.x, this.layout.box.max.x + 0.5);
    }
    return b;
  }

  /** Lean angle of every piece at time t, resolved from the end of the chain backwards. */
  angles(t) {
    const P = this.pieces;
    const out = new Array(P.length);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      let free = t < p.start ? 0 : (Math.PI / 2) * Math.min(1, ((t - p.start) / p.T) ** 2);
      let cap = p.contact;
      const n = P[i + 1];
      if (n) cap = lerp(p.contact, p.final, clamp(out[i + 1] / Math.max(1e-3, n.final)));
      if (i === 0 && t < p.start) free = Math.max(0, 0.16 * Math.sin(Math.PI * span(t, 0.62, 0.42))); // the hesitation
      out[i] = Math.min(free, n ? cap : Math.PI / 2);
      if (p.restore !== undefined && t > p.restore) out[i] = p.final * (1 - ease.outBack(span(t, p.restore, 0.45), 2.2));
    }
    return out;
  }

  placePiece(p, theta, pos, quat) {
    qYaw.setFromAxisAngle(UP, p.yaw);
    axis.set(p.dir.z, 0, -p.dir.x);
    qFall.setFromAxisAngle(axis, theta);
    vE.copy(p.base).addScaledVector(p.dir, p.th);
    vA.copy(p.base).sub(vE).applyQuaternion(qFall);
    pos.copy(vE).add(vA);
    quat.copy(qFall).multiply(qYaw);
  }

  pose(t) {
    const th = this.angles(t);
    this.pieces.forEach((p, i) => {
      if (p.kind === 'domino') { this.placePiece(p, th[i], p.obj.position, p.obj.quaternion); return; }
      const l = p.letter;
      if (t < p.launch) {
        this.placePiece(p, th[i], l.root.position, l.root.quaternion);
        l.body.scale.set(1, 1, 1);
        return;
      }
      // Spring upright, turn to face the camera and slide into place.
      this.placePiece(p, p.final, vA, qYaw);
      const u = span(t, p.launch, 0.62);
      const e = ease.inOutCubic(u);
      l.root.position.set(lerp(vA.x, l.slot.x, e), lerp(vA.y, 0, e) + Math.sin(Math.PI * u) * 0.75, lerp(vA.z, l.slot.z, e));
      l.root.quaternion.copy(qYaw).slerp(l.rest.quaternion, ease.outCubic(u));
      const land = t - p.launch - 0.62;
      l.root.rotateX(0.22 * wobble(land * 0.9, 1.6, 4));
      const sq = land > 0 ? 1 - 0.2 * Math.exp(-8 * land) * Math.cos(Math.PI * 2 * 2.4 * land) : 1 + 0.1 * Math.sin(Math.PI * u);
      l.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    });

    // Marble: rolls in, taps, rolls back a touch, tries again, then rests.
    const { far, touch, back } = this.marblePath;
    const m = this.marble;
    if (t < 0.62) m.position.lerpVectors(far, touch, ease.outQuad(span(t, 0, 0.62)));
    else if (t < 0.9) m.position.lerpVectors(touch, back, ease.outCubic(span(t, 0.62, 0.28)));
    else if (t < 1.18) m.position.lerpVectors(back, touch, ease.inQuad(span(t, 0.9, 0.28)));
    else m.position.lerpVectors(touch, back, ease.outCubic(span(t, 1.18, 0.6)) * 0.6);
    m.position.y = 0.11;
    m.rotation.z = -m.position.x / 0.11;
    m.rotation.x = m.position.z / 0.11;
  }

  settle() {
    this.pose(this.duration);
  }

  /** A poked letter tips back like a domino and rocks upright; neighbours shiver. */
  react(letter) {
    const k = this.reduced ? 0.35 : 1;
    const th = letter.size.z / 2;
    const dir = Math.random() > 0.5 ? 1 : -1;
    this.play(letter, 0.9, (p) => {
      const a = dir * -0.55 * k * Math.sin(Math.PI * Math.min(1, p * 2)) * (p < 0.5 ? 1 : 0) + dir * -0.12 * k * wobble(p - 0.5, 2, 5);
      const ez = dir > 0 ? -th : th;
      letter.body.rotation.x = a;
      // Rotate about the bottom edge it tips over: E + Rx(a)·(−E).
      letter.body.position.set(0, ez * Math.sin(a), ez - ez * Math.cos(a));
    });
    this.ctx.sound.play('clack', { pitch: 0.9 });
    this.ctx.sound.play('clack', { pitch: 0.8, delay: 0.45 });
    for (const n of this.letters) {
      if (n === letter || n.slot.row !== letter.slot.row || Math.abs(n.index - letter.index) !== 1) continue;
      setTimeout(() => { n.feel.rot.x.kick(-0.9 * k * dir); this.stage.wake(); }, 120);
    }
  }
}
