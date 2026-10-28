// A tiny waiter robot rolls in balancing a wobbly tower of letters on its
// tray, flips each one into place, then notices a crooked letter, reverses,
// gives it a polite nudge and parks with a happy antenna bounce.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three';
import { Scene } from './base.js';
import { ease, span, wobble, lerp, clamp, TAU } from '../motion.js';

const PALETTE = [0xe8573f, 0xf2b33d, 0x2f8f83, 0x3c5a99, 0xe8573f, 0x2f8f83, 0xf2b33d, 0x3c5a99];
const ROBOT_SCALE = 1.5;
const LANE = 1.15; // how far in front of the letters the robot drives
const TOSS = 0.4;

const m3 = new THREE.Matrix4();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qx = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vs = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);

function buildRobot(track) {
  const mat = (color, o = {}) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o }));
  const shell = mat(0xf6efe4, { roughness: 0.35 });
  const teal = mat(0x2f8f83, { roughness: 0.4 });
  const coral = mat(0xe8573f, { roughness: 0.35 });
  const dark = mat(0x2b2a33, { roughness: 0.7 });
  const brass = mat(0xd4a24c, { roughness: 0.3, metalness: 0.6 });
  const screen = mat(0x1d2433, { roughness: 0.15 });
  const glow = mat(0x9ff3d6, { emissive: 0x6fe3c0, emissiveIntensity: 1.1, roughness: 0.3 });

  const g = new THREE.Group();
  const yawGroup = new THREE.Group();
  g.add(yawGroup);
  const mesh = (geo, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(track(geo), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    return o;
  };

  const chassis = new THREE.Group(); // bobs a little as it drives
  yawGroup.add(chassis);
  const body = mesh(new RoundedBoxGeometry(0.56, 0.32, 0.44, 4, 0.11), shell, 0, 0.3, 0);
  const stripe = mesh(new RoundedBoxGeometry(0.575, 0.06, 0.455, 2, 0.03), coral, 0, 0.27, 0);
  chassis.add(body, stripe);

  const wheels = [];
  for (const x of [-0.17, 0.17]) for (const z of [-0.25, 0.25]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.12, z);
    const tyre = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), dark);
    tyre.rotation.x = Math.PI / 2;
    const hub = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 12), brass);
    hub.rotation.x = Math.PI / 2;
    pivot.add(tyre, hub);
    yawGroup.add(pivot);
    wheels.push(pivot);
  }

  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 12), dark, 0.08, 0.5, 0);
  const head = new THREE.Group();
  head.position.set(0.08, 0.56, 0);
  const skull = mesh(new RoundedBoxGeometry(0.3, 0.24, 0.32, 4, 0.09), teal, 0, 0.12, 0);
  const face = mesh(new RoundedBoxGeometry(0.04, 0.17, 0.25, 2, 0.02), screen, 0.14, 0.12, 0);
  const eyes = [-0.06, 0.06].map((z) => {
    const e = mesh(new THREE.CapsuleGeometry(0.022, 0.035, 4, 8), glow, 0.163, 0.13, z);
    return e;
  });
  const antenna = new THREE.Group();
  antenna.position.set(-0.04, 0.24, 0.06);
  const stalk = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), dark, 0, 0.08, 0);
  const bulb = mesh(new THREE.SphereGeometry(0.035, 14, 10), coral, 0, 0.17, 0);
  antenna.add(stalk, bulb);
  head.add(skull, face, ...eyes, antenna);
  chassis.add(neck, head);

  // Waiter arms holding a tray up high.
  const arms = new THREE.Group();
  arms.position.set(-0.06, 0.38, 0);
  const armL = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8), dark, 0, 0.31, 0.23);
  const armR = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8), dark, 0, 0.31, -0.23);
  const tray = mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.035, 32), brass, 0, 0.64, 0);
  arms.add(armL, armR, tray);
  chassis.add(arms);
  const stack = new THREE.Group(); // leans as the robot brakes and accelerates
  stack.position.set(0, 0.66, 0);
  arms.add(stack);

  g.scale.setScalar(ROBOT_SCALE);
  return { group: g, yawGroup, chassis, body, head, eyes, antenna, arms, stack, wheels };
}

export class Delivery extends Scene {
  static id = 'delivery';
  title = 'Robot delivery';
  idleEvery = 11;
  look = {
    background: 0xf1e6d6, floor: 0xeedfca, sky: 0xfff6ea, ground: 0xc9a98a, hemi: 1.05,
    key: 0xfff0dc, keyIntensity: 2.6, fill: 0xd8e6ff, fillIntensity: 0.55, rimIntensity: 0.8,
    env: 0.45, shadow: 0x5a3b28,
  };
  letterStyle = { depth: 0.24, bevel: 0.035, bevelSpread: 0.9 };

  material(ch, i) {
    return new THREE.MeshStandardMaterial({ color: PALETTE[i], roughness: 0.42 });
  }

  build() {
    const L = this.letters;
    const slots = this.layout.slots;
    this.robot = buildRobot((x) => this.track(x));
    this.add(this.robot.group);
    this.addBlob(this.robot.body, { strength: 1.1, scale: 1.1 });

    // Stack carriers on the tray: R on top so it comes off first.
    const thick = L[0].size.z;
    this.carriers = L.map((l, i) => {
      const c = new THREE.Object3D();
      const k = L.length - 1 - i;
      c.position.set(0, (thick * (k + 0.5) + 0.02) / ROBOT_SCALE, (0.42 * l.size.y) / ROBOT_SCALE);
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = (k % 2 ? 1 : -1) * 0.06; // a slightly messy stack
      c.scale.setScalar(1 / ROBOT_SCALE);
      this.robot.stack.add(c);
      return c;
    });

    this.crooked = this.layout.mode === 'single' ? 4 : 5;
    const lane = (i) => slots[i].z + LANE;
    const lastRow = this.layout.rows.at(-1);
    this.park = { x: lastRow.xMax + 1.05, z: lane(L.length - 1) - 0.1, yaw: -0.75 };

    // Keyframed route: [time, x, z, yaw]; segments ease in and out.
    const K = [];
    const push = (t, x, z, yaw) => K.push({ t, x, z, yaw });
    push(0, slots[0].x - 4.6, lane(0), 0);
    this.stops = [];
    let t = 0.75;
    for (let i = 0; i < L.length; i++) {
      if (i) {
        const d = Math.hypot(slots[i].x - slots[i - 1].x, slots[i].z - slots[i - 1].z);
        t += 0.12 + 0.08 * d;
      }
      push(t, slots[i].x, lane(i), 0);
      this.stops.push(t);
      t += 0.12;
      push(t, slots[i].x, lane(i), 0);
    }
    const c = this.crooked;
    this.notice = t + 0.18;
    t = this.notice + 0.28;
    push(t, slots[L.length - 1].x, lane(L.length - 1), 0); // pause, then reverse
    t += 0.2 + 0.09 * Math.abs(slots[L.length - 1].x - slots[c].x);
    push(t, slots[c].x, lane(c), 0);
    t += 0.26;
    push(t, slots[c].x, lane(c), Math.PI / 2); // turn to face the letter
    t += 0.15;
    push(t, slots[c].x, lane(c) - 0.36, Math.PI / 2); // nudge!
    this.nudge = t;
    t += 0.22;
    push(t, slots[c].x, lane(c) - 0.05, Math.PI / 2);
    t += 0.7;
    push(t, this.park.x, this.park.z, this.park.yaw);
    this.parked = t;
    this.duration = t + 0.55;
    this.keys = K;

    // Precompute odometer at each key for wheel spin.
    let dist = 0;
    K[0].dist = 0;
    for (let i = 1; i < K.length; i++) {
      const a = K[i - 1], b = K[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const forward = Math.cos(a.yaw) * dx - Math.sin(a.yaw) * dz;
      dist += Math.sign(forward || 1) * Math.hypot(dx, dz);
      b.dist = dist;
    }

    // Where each letter starts its flight: the carrier's pose at toss time.
    this.tossFrom = L.map((l, i) => {
      this.poseRobot(this.stops[i] - 0.03);
      this.robot.group.updateMatrixWorld(true);
      this.carriers[i].matrixWorld.decompose(va, qa, vs);
      return { p: va.clone(), q: qa.clone() };
    });
    this.crookedQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.62, -0.24));

    this.stops.forEach((s, i) => {
      this.sfx(s - 0.03, 'whir', { pitch: 1 + i * 0.03, gain: 0.6 });
      this.sfx(s - 0.03 + TOSS, 'tok', { pitch: 0.9 + i * 0.04 });
    });
    this.sfx(this.notice, 'beep', { pitch: 0.7 });
    this.sfx(this.notice + 0.6, 'beep', { pitch: 0.6 });
    this.sfx(this.notice + 0.8, 'beep', { pitch: 0.6 });
    this.sfx(this.nudge, 'tok', { pitch: 0.7 });
    this.sfx(this.parked, 'chirp');

    this.pokeables = [{ object: this.robot.group, onPoke: () => this.pokeRobot() }];
    this.robot.group.userData.pokeable = this.pokeables[0];
  }

  frameBox() {
    const b = this.layout.box.clone();
    b.expandByPoint(new THREE.Vector3(this.park.x + 0.5, 0, this.park.z + 0.4));
    return b;
  }

  /** Robot route + body language at time t (pure). */
  poseRobot(t) {
    const K = this.keys;
    let i = K.findIndex((k) => k.t > t);
    if (i === -1) i = K.length;
    const a = K[Math.max(0, i - 1)];
    const b = K[Math.min(K.length - 1, i)];
    const u = b === a ? 1 : ease.inOutCubic(clamp((t - a.t) / (b.t - a.t)));
    const r = this.robot;
    r.group.position.set(lerp(a.x, b.x, u), 0, lerp(a.z, b.z, u));
    r.yawGroup.rotation.y = lerp(a.yaw, b.yaw, u);
    const odo = lerp(a.dist, b.dist, u);
    for (const w of r.wheels) w.rotation.z = -odo / (0.12 * ROBOT_SCALE);

    // The tower sways when the robot brakes at each stop.
    let lean = 0;
    for (const s of this.stops) lean += 0.11 * wobble((t - s) * 0.9, 1.4, 3.2) * (t > s ? 1 : 0);
    lean += -0.1 * wobble((t - 0.02) * 0.9, 1.2, 3) * (t > 0.02 ? 1 : 0);
    r.stack.rotation.z = -lean;
    r.chassis.position.y = Math.abs(Math.sin(odo * 9)) * 0.008;
    r.chassis.rotation.z = -lean * 0.15;

    // Head: watch each toss, then notice the crooked letter and look back.
    let look = 0;
    for (const s of this.stops) look = Math.max(look, Math.sin(Math.PI * span(t, s - 0.05, 0.42)) * 0.9);
    const back = span(t, this.notice, 0.25) * (1 - span(t, this.nudge - 0.45, 0.3));
    r.head.rotation.y = look + back * 2.0;
    r.head.rotation.z = back * 0.22 * Math.sin(Math.PI * span(t, this.notice, 0.6));
    const blink = Math.sin(Math.PI * span(t, this.notice + 0.05, 0.14));
    for (const e of r.eyes) e.scale.y = 1 - blink * 0.85;

    // Tray lowers after the last delivery; antenna boings when happy.
    const done = ease.outBack(span(t, this.parked - 0.1, 0.45));
    r.arms.position.y = 0.38 - done * 0.1;
    r.antenna.rotation.z = 0.5 * wobble(t - this.parked, 2.4, 3.5) + 0.35 * wobble(t - this.nudge, 2.2, 4);
  }

  pose(t) {
    this.poseRobot(t);
    this.robot.group.updateMatrixWorld(true);
    this.letters.forEach((l, i) => {
      const start = this.stops[i] - 0.03;
      if (t < start) {
        // Riding on the tray.
        this.carriers[i].matrixWorld.decompose(l.root.position, l.root.quaternion, vs);
        l.body.scale.set(1, 1, 1);
        return;
      }
      const target = i === this.crooked && t < this.nudge ? this.crookedQ : l.rest.quaternion;
      const from = this.tossFrom[i];
      const u = span(t, start, TOSS);
      const e = ease.inOutQuad(u);
      va.copy(from.p).lerp(vb.set(l.slot.x, 0, l.slot.z + (i === this.crooked && t < this.nudge ? -0.12 : 0)), e);
      va.y += Math.sin(Math.PI * u) * (0.9 + (i % 3) * 0.15);
      l.root.position.copy(va);
      qa.copy(from.q).slerp(target, ease.outCubic(u));
      // Every other letter does a little somersault on the way down.
      if (i % 2 === 0) qa.multiply(qx.setFromAxisAngle(X, -TAU * ease.inOutQuad(u)));
      l.root.quaternion.copy(qa);

      // Landing squash, and the crooked letter snapping straight after the nudge.
      const land = t - start - TOSS;
      const sq = land > 0 ? 1 - 0.22 * Math.exp(-9 * land) * Math.cos(TAU * 2.6 * land) : 1;
      l.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      if (i === this.crooked && t >= this.nudge) {
        const k = ease.outElastic(span(t, this.nudge, 0.75), 2.2, 6);
        qa.copy(this.crookedQ).slerp(l.rest.quaternion, k);
        l.root.quaternion.copy(qa);
        l.root.position.z = l.slot.z - 0.12 * (1 - k);
      }
    });
  }

  settle() {
    this.poseRobot(this.duration);
  }

  react(letter) {
    const k = this.reduced ? 0.3 : 1;
    letter.feel.pos.y.kick(2.6 * k);
    letter.feel.squash.kick(-2.5 * k);
    const spin = letter.index % 2 ? 1 : -1;
    this.play(letter, 0.7, (p) => { letter.body.rotation.y = spin * TAU * ease.inOutCubic(p) * (this.reduced ? 0 : 1); });
    this.ctx.sound.play('tok', { pitch: 0.9 + letter.index * 0.05 });
    this.lookAt(letter);
  }

  /** The robot turns its head toward whatever just got poked. */
  lookAt(letter) {
    const r = this.robot;
    const head = r.head;
    const from = head.rotation.y;
    const p = r.group.position;
    const yaw = r.yawGroup.rotation.y;
    const target = Math.atan2(-(letter.slot.z - p.z), letter.slot.x - p.x) - yaw;
    this.animate(1.4, (u) => {
      const there = ease.outBack(span(u, 0, 0.3));
      const home = ease.inOutCubic(span(u, 0.7, 0.3));
      head.rotation.y = lerp(lerp(from, target, there), 0, home);
      for (const e of r.eyes) e.scale.y = 1 - 0.85 * Math.sin(Math.PI * span(u, 0.35, 0.1));
    });
    this.ctx.sound.play('beep', { pitch: 1.2, delay: 0.1 });
  }

  pokeRobot() {
    const r = this.robot;
    this.animate(0.9, (u) => {
      r.chassis.position.y = Math.sin(Math.PI * span(u, 0, 0.35)) * 0.12;
      r.chassis.rotation.y = 0.35 * wobble(u, 2.5, 4);
      r.antenna.rotation.z = 0.6 * wobble(u, 3, 3);
      for (const e of r.eyes) e.scale.y = u < 0.6 ? 0.35 : 1; // happy squint
    });
    this.ctx.sound.play('chirp');
  }

  idle() {
    const r = this.robot;
    const dir = Math.random() > 0.5 ? 1 : -1;
    this.animate(1.8, (u) => {
      r.head.rotation.y = dir * 0.5 * Math.sin(Math.PI * u);
      for (const e of r.eyes) e.scale.y = 1 - 0.85 * Math.sin(Math.PI * span(u, 0.45, 0.1));
    });
  }
}
