// A wooden toy: letters lie folded flat on a hinged plank. The plank slides
// in, a gear cranks, and the letters flip up one after another — until one
// jams halfway. The gear stalls and judders, a little peg pops up behind
// the stuck letter and knocks it upright. Click a letter to flip it again.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three';
import { Scene } from './base.js';
import { woodTexture } from '../textures.js';
import { ease, span, wobble, lerp, TAU } from '../motion.js';

const PLANK_H = 0.2;
const PLANK_D = 0.95;
const WOODS = [
  ['#d9a066', '#b07a42'],
  ['#a8683a', '#7a4a26'],
  ['#e3bb84', '#c49058'],
];
const FLIP = 0.36;

function gearShape(teeth, rOuter, rRoot, rHole) {
  const s = new THREE.Shape();
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [[rRoot, a], [rOuter, a + step * 0.18], [rOuter, a + step * 0.45], [rRoot, a + step * 0.63]];
    pts.forEach(([r, ang], k) => {
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, rHole, 0, TAU, true);
  s.holes.push(hole);
  return s;
}

const vE = new THREE.Vector3();
const vA = new THREE.Vector3();

export class Workshop extends Scene {
  static id = 'workshop';
  static tracking = 0.09;
  title = 'Wooden workshop';
  idleEvery = 13;
  look = {
    background: 0xe9dcc6, floor: 0xe4d3b6, sky: 0xfff3df, ground: 0xb08a5c, hemi: 1.0,
    key: 0xffe6c4, keyIntensity: 2.7, keyDir: [-0.7, 1, 0.55], fill: 0xd6e2ff, fillIntensity: 0.45, rimIntensity: 0.9,
    env: 0.35, shadow: 0x4a3018,
  };
  letterStyle = { depth: 0.22, bevel: 0.025, bevelSpread: 0.9 };
  framing = { lift: 0.1 };

  material(ch, i) {
    this.woods ??= WOODS.map(([a, b], k) => this.track(woodTexture(a, b, 11 + k)));
    const map = this.woods[i % 3];
    map.repeat.set(1.4, 1.4);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.62 });
  }

  build() {
    const L = this.letters;
    for (const l of L) l.rest.position.y = PLANK_H;
    const plankTex = this.track(woodTexture('#8a5a32', '#5e3b1e', 21));
    plankTex.repeat.set(3, 1);
    const plankMat = this.track(new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.55 }));
    const brass = this.track(new THREE.MeshStandardMaterial({ color: 0xd4a24c, roughness: 0.28, metalness: 0.7 }));
    const gearMat = this.track(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 }));
    const gearMat2 = this.track(new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.5 }));
    const pegMat = this.track(new THREE.MeshStandardMaterial({ color: 0xe8c48e, roughness: 0.6 }));

    this.stuck = this.layout.mode === 'single' ? 4 : 1;
    this.rigs = this.layout.rows.map((row, r) => {
      const rig = new THREE.Group();
      this.add(rig);
      const w = row.xMax - row.xMin + 1.05;
      const plank = new THREE.Mesh(this.track(new RoundedBoxGeometry(w, PLANK_H, PLANK_D, 3, 0.05)), plankMat);
      plank.position.set((row.xMin + row.xMax) / 2 + 0.02, PLANK_H / 2, row.z - 0.08);
      plank.castShadow = plank.receiveShadow = true;
      rig.add(plank);
      this.addBlob(plank, { strength: 0.9 });

      // Brass hinges at the back edge of each letter.
      for (const li of row.indices) {
        const l = L[li];
        const hinge = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.035, 0.035, Math.min(0.5, l.size.x * 0.7), 10)), brass);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(l.slot.x, PLANK_H + 0.02, l.slot.z - l.size.z / 2 - 0.02);
        rig.add(hinge);
      }

      // Gears on the plank's front face, at its left end.
      const gx = row.xMin - 0.25;
      const big = new THREE.Mesh(this.track(new THREE.ExtrudeGeometry(gearShape(12, 0.34, 0.27, 0.06), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 })), gearMat);
      big.position.set(gx, PLANK_H + 0.12, row.z - 0.08 + PLANK_D / 2 + 0.01);
      const small = new THREE.Mesh(this.track(new THREE.ExtrudeGeometry(gearShape(8, 0.22, 0.165, 0.045), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 })), gearMat2);
      small.position.set(gx + 0.5, PLANK_H + 0.02, big.position.z);
      const knob = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 10)), pegMat);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.19, 0, 0.12);
      big.add(knob);
      for (const g of [big, small]) { g.castShadow = true; rig.add(g); }
      for (const p of [0, 1]) {
        const pin = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12)), brass);
        pin.rotation.x = Math.PI / 2;
        pin.position.copy((p ? small : big).position).add(new THREE.Vector3(0, 0, 0.05));
        rig.add(pin);
      }
      const rect = { x0: plank.position.x - w / 2, x1: plank.position.x + w / 2, z0: plank.position.z - PLANK_D / 2, z1: plank.position.z + PLANK_D / 2 };
      return { rig, row, big, small, rect, delay: r * 0.16 };
    });

    // The peg that rescues the jammed letter.
    const sl = L[this.stuck];
    this.peg = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 14)), pegMat);
    this.peg.castShadow = true;
    this.pegHome = new THREE.Vector3(sl.slot.x, PLANK_H - 0.26, sl.slot.z - 0.42);
    this.add(this.peg);

    // Flip schedule (left to right across all rows).
    this.flipAt = L.map((l, i) => 0.92 + i * 0.16 + (l.slot.row ? 0.12 : 0));
    this.jam = this.flipAt[this.stuck] + 0.22;
    this.rescue = Math.max(this.flipAt.at(-1) + FLIP + 0.35, this.jam + 0.7);
    this.duration = this.rescue + 1.0;
    this.flipAt.forEach((t, i) => this.sfx(t + FLIP * 0.8, 'tok', { pitch: 0.85 + i * 0.05 }));
    this.sfx(0.86, 'ratchet');
    this.sfx(this.jam, 'clack', { pitch: 0.6 });
    this.sfx(this.jam + 0.25, 'ratchet', { pitch: 0.7 });
    this.sfx(this.rescue, 'tok', { pitch: 1.4 });
    this.sfx(this.rescue + 0.14, 'tok', { pitch: 0.75, gain: 1.2 });
    this.sfx(this.rescue + 0.45, 'ratchet', { pitch: 1.1 });

    this.pokeables = this.rigs.map((r) => ({ object: r.big, onPoke: () => this.crank() }));
    this.rigs.forEach((r, k) => { r.big.userData.pokeable = this.pokeables[k]; });
  }

  /** Thrown letters can land on the planks as well as the table. */
  groundAt(x, z) {
    for (const { rect: r, slide } of this.rigs) {
      if (x > r.x0 + (slide ?? 0) && x < r.x1 + (slide ?? 0) && z > r.z0 && z < r.z1) return PLANK_H;
    }
    return 0;
  }

  /** Fold angle (0 = upright, π/2 = flat on its back) at time t. */
  fold(i, t) {
    const start = this.flipAt[i];
    if (i === this.stuck) {
      if (t < this.rescue + 0.1) {
        const up = ease.outCubic(span(t, start, FLIP * 0.7));
        const judder = t > this.jam ? 0.035 * Math.sin((t - this.jam) * 70) * (1 - span(t, this.jam, 0.6)) : 0;
        return lerp(Math.PI / 2, 0.92, up) + judder;
      }
      const k = span(t, this.rescue + 0.1, 0.7);
      return 0.92 * (1 - ease.outElastic(k, 2.4, 6.5));
    }
    const u = span(t, start, FLIP);
    return (Math.PI / 2) * (1 - ease.outBack(u, 2.4));
  }

  gearAngle(t) {
    let a = ease.inOutCubic(span(t, 0.8, this.jam - 0.8)) * TAU * 0.9;
    a += t > this.jam ? 0.08 * Math.sin((t - this.jam) * 40) * (1 - span(t, this.jam, 0.5)) : 0;
    a += ease.outBack(span(t, this.rescue - 0.1, 0.8)) * TAU * 0.5;
    return a;
  }

  pose(t) {
    const L = this.letters;
    const ga = this.gearAngle(t);
    for (const r of this.rigs) {
      const slide = (1 - ease.outBack(span(t, r.delay, 0.8), 1.3)) * 7;
      r.rig.position.x = slide;
      r.big.rotation.z = -ga;
      r.small.rotation.z = ga * (12 / 8) + 0.2;
      r.slide = slide;
    }
    L.forEach((l, i) => {
      const slide = this.rigs[this.layout.rows.findIndex((row) => row.indices.includes(i))].slide;
      const a = this.fold(i, t);
      // Hinge about the letter's back-bottom edge.
      const th = l.size.z / 2;
      vE.set(l.slot.x + slide, PLANK_H, l.slot.z - th);
      vA.set(0, 0, th).applyAxisAngle(new THREE.Vector3(1, 0, 0), -a);
      l.root.position.copy(vE).add(vA);
      l.root.rotation.set(-a, 0, 0);
    });
    // Peg pops up, gives a shove, and sinks back down.
    const up = Math.sin(Math.PI * span(t, this.rescue - 0.05, 0.42));
    this.peg.position.copy(this.pegHome).add(new THREE.Vector3(0, up * 0.42, up * 0.08));
    this.peg.visible = up > 0.001;
  }

  settle() {
    this.pose(this.duration);
  }

  /** Poke: the letter folds back on its hinge and snaps up again. */
  react(letter) {
    const k = this.reduced ? 0.3 : 1;
    const th = letter.size.z / 2;
    const axis = new THREE.Vector3(1, 0, 0);
    this.play(letter, 0.95, (p) => {
      const down = Math.sin(Math.PI * Math.min(1, p / 0.45));
      const a = (p < 0.45 ? down * 1.0 : 0) * k + 0.18 * k * wobble(p - 0.45, 2.2, 5);
      letter.body.rotation.x = -a;
      letter.body.position.set(0, 0, -th).add(new THREE.Vector3(0, 0, th).applyAxisAngle(axis, -a));
    });
    this.ctx.sound.play('tok', { pitch: 1.1 });
    this.ctx.sound.play('tok', { pitch: 0.8, delay: 0.42 });
    this.crank(0.25);
  }

  crank(turns = 1) {
    const r0 = this.rigs.map((r) => r.big.rotation.z);
    this.animate(0.9, (u) => {
      const a = ease.outBack(u) * TAU * 0.25 * turns;
      this.rigs.forEach((r, k) => { r.big.rotation.z = r0[k] - a; r.small.rotation.z = -r.big.rotation.z * (12 / 8) + 0.2; });
    });
    this.ctx.sound.play('ratchet', { pitch: 1 + Math.random() * 0.2 });
  }

  idle() { this.crank(0.25); }
}
