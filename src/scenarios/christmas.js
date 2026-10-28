// Christmas: snow drifts down and wrapped presents drop onto the snow. One
// by one their lids pop off and the sides fall open to reveal the letters —
// except one stubborn gift that hops about impatiently before bursting open.
// A gold star lands on the "A".
import * as THREE from 'three';
import { Scene, squash, landing } from './base.js';
import { Particles, hash } from '../effects.js';
import { ease, span, lerp, rng, bounceDrop, wobble, TAU } from '../motion.js';

const WRAP = [[0xc8332f, 0xf3d37a], [0x2e8a57, 0xf4f0e6], [0xe0b04a, 0xc8332f], [0x3f6fb5, 0xf4f0e6]];
const SNOW = 170;
const WALL = 0.035;

function stripes() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6ef';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d42a2a';
  for (let k = -64; k < 128; k += 21) {
    g.beginPath();
    g.moveTo(k, 0); g.lineTo(k + 10, 0); g.lineTo(k + 10 + 64, 64); g.lineTo(k + 64, 64);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.4, 2.4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starShape(outer = 0.22, inner = 0.1) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer, a = (i / 10) * TAU + Math.PI / 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export class Christmas extends Scene {
  static id = 'christmas';
  static holiday = true;
  static tracking = 0.2;
  title = 'Merry Christmas';
  look = {
    background: 0xdfeaf3, floor: 0xf7fafd, floorRoughness: 1, sky: 0xffffff, ground: 0xb8c8d8, hemi: 1.05,
    key: 0xffe8cc, keyIntensity: 2.3, keyDir: [-0.5, 1, 0.7], fill: 0xd0e4ff, fillIntensity: 0.6, rimIntensity: 0.9,
    env: 0.5, shadow: 0x5a6a80,
  };
  letterStyle = { depth: 0.26, bevel: 0.05, bevelSpread: 0.85, bevelSegments: 4 };

  material(ch, i) {
    if (i % 2 === 0) {
      this.candy ??= this.track(stripes());
      return new THREE.MeshPhysicalMaterial({ map: this.candy, roughness: 0.35, clearcoat: 0.8 });
    }
    return new THREE.MeshPhysicalMaterial({ color: 0x1f7a4a, roughness: 0.35, clearcoat: 0.8 });
  }

  build() {
    const L = this.letters;
    const r = rng(1225);
    const mat = (color, o = {}) => this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }));
    const geo = (g) => this.track(g);

    // Gold baubles for the dots.
    const gold = mat(0xe0b04a, { metalness: 0.9, roughness: 0.2 });
    const bauble = geo(new THREE.SphereGeometry(0.13, 18, 12));
    for (const l of L.filter((x) => x.dot)) {
      l.dot.visible = false;
      const b = new THREE.Mesh(bauble, gold);
      b.position.copy(l.dotHome);
      b.castShadow = true;
      l.inner.add(b);
    }

    // A present around each letter: four hinged walls and a lid with a bow.
    const bowGeo = geo(new THREE.TorusGeometry(0.09, 0.03, 8, 16));
    this.gifts = L.map((l, i) => {
      const [paperC, ribbonC] = WRAP[i % WRAP.length];
      const paper = mat(paperC, { roughness: 0.55 });
      const ribbon = mat(ribbonC, { roughness: 0.4 });
      const w = l.size.x + 0.22, h = l.size.y + 0.1, d = l.size.z + 0.26;
      const gift = new THREE.Group();
      const walls = [];
      // [hinge offset, rotation axis sign, wall size]
      for (const [ox, oz, sx, sz, ax] of [[0, d / 2, w, WALL, 'x'], [0, -d / 2, w, WALL, 'x'], [w / 2, 0, WALL, d, 'z'], [-w / 2, 0, WALL, d, 'z']]) {
        const hinge = new THREE.Group();
        hinge.position.set(ox, 0, oz);
        const wall = new THREE.Mesh(geo(new THREE.BoxGeometry(sx, h, sz)), paper);
        wall.position.y = h / 2;
        wall.castShadow = wall.receiveShadow = true;
        const band = new THREE.Mesh(geo(new THREE.BoxGeometry(ax === 'x' ? 0.08 : sx + 0.01, h, ax === 'x' ? sz + 0.01 : 0.08)), ribbon);
        band.position.y = h / 2;
        hinge.add(wall, band);
        hinge.userData = { ax, sign: ax === 'x' ? Math.sign(oz) : -Math.sign(ox) };
        gift.add(hinge);
        walls.push(hinge);
      }
      const lid = new THREE.Group();
      const top = new THREE.Mesh(geo(new THREE.BoxGeometry(w + 0.06, 0.07, d + 0.06)), paper);
      const b1 = new THREE.Mesh(geo(new THREE.BoxGeometry(w + 0.07, 0.075, 0.08)), ribbon);
      const b2 = new THREE.Mesh(geo(new THREE.BoxGeometry(0.08, 0.075, d + 0.07)), ribbon);
      lid.add(top, b1, b2);
      for (const s of [-1, 1]) {
        const loop = new THREE.Mesh(bowGeo, ribbon);
        loop.position.set(s * 0.08, 0.1, 0);
        loop.rotation.set(0, s * 0.4, s * 0.5);
        lid.add(loop);
      }
      lid.traverse((o) => { o.castShadow = true; });
      lid.position.y = h + 0.035;
      gift.add(lid);
      gift.position.set(l.slot.x, 0, l.slot.z);
      this.add(gift);
      this.addBlob(walls[0].children[0], { strength: 0.8, scale: 1.2 });
      return { gift, walls, lid, h, spin: (r() - 0.5) * 2, side: r() > 0.5 ? 1 : -1 };
    });

    // Star for the A.
    const A = L.find((l) => l.char === 'A');
    this.star = new THREE.Mesh(geo(new THREE.ExtrudeGeometry(starShape(), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 })), mat(0xf2c14e, { metalness: 0.7, roughness: 0.25, emissive: 0xffc94a, emissiveIntensity: 0.25 }));
    this.star.geometry.center();
    this.star.castShadow = true;
    A.inner.add(this.star);
    this.star.position.set(0.02, A.size.y + 0.2, 0);

    // Snow: falls during the entrance and stays where it lands.
    const box = this.layout.box;
    this.snow = new Particles(SNOW, { size: 0.22, glow: true, opacity: 0.95 });
    this.add(this.snow.points);
    this.flakes = Array.from({ length: SNOW }, (_, k) => ({
      x: lerp(box.min.x - 4, box.max.x + 4, r()), z: lerp(box.min.z - 3, box.max.z + 2.5, r()),
      y0: 3.5 + r() * 3, speed: 0.9 + r() * 0.7, phase: r() * TAU, delay: r() * 1.5,
    }));
    this.white = new THREE.Color(0xffffff);

    // Timing.
    const order = L.map((_, i) => i).sort(() => r() - 0.5);
    this.dropAt = L.map((_, i) => 0.1 + order.indexOf(i) * 0.11);
    this.openAt = L.map((_, i) => 1.6 + order.indexOf(i) * 0.15);
    this.stubborn = L.findIndex((l) => l.char === 'm');
    this.openAt[this.stubborn] = Math.max(...this.openAt) + 0.7;
    this.starAt = this.openAt[this.stubborn] + 0.75;
    this.duration = this.starAt + 0.9;
    this.dropAt.forEach((t, i) => this.sfx(t + Math.sqrt((2 * 4.5) / 26), 'thud', { pitch: 0.9 + i * 0.05, gain: 0.6 }));
    this.openAt.forEach((t, i) => { this.sfx(t, 'pop', { pitch: 1 + i * 0.06 }); this.sfx(t + 0.25, 'paper', { pitch: 0.7 }); });
    this.sfx(this.openAt[this.stubborn] - 0.55, 'tok', { pitch: 0.8 });
    this.sfx(this.openAt[this.stubborn] - 0.3, 'tok', { pitch: 0.9 });
    this.sfx(this.starAt, 'bell', { pitch: 1 });
  }

  frameBox() {
    const b = this.layout.box.clone();
    b.max.y = 1.45;
    return b;
  }

  pose(t) {
    this.letters.forEach((l, i) => {
      const g = this.gifts[i];
      // The present drops in (the letter rides inside it).
      const drop = bounceDrop(t - this.dropAt[i], 4.5, 26, 0.3, 2);
      let y = t < this.dropAt[i] ? 9 : drop.y;
      let jitter = 0;
      const open = this.openAt[i];
      if (i === this.stubborn && t < open) {
        // Impatient hops before it gives in.
        const hop = Math.max(Math.sin(Math.PI * span(t, open - 0.6, 0.22)), Math.sin(Math.PI * span(t, open - 0.35, 0.22)));
        y += hop * 0.22;
        jitter = 0.08 * wobble(t - this.openAt.filter((_, k) => k !== i).reduce((a, b) => Math.max(a, b)) - 0.2, 4, 3);
      }
      g.gift.position.set(l.slot.x, y, l.slot.z);
      g.gift.rotation.set(0, g.spin * (1 - span(t, this.dropAt[i], 0.6)) * 0.4, jitter);
      squash(g.gift, drop.impact >= 0 && t < open ? landing(drop.since, 0.15) : 1);
      l.root.position.set(l.slot.x, y, l.slot.z);
      l.root.rotation.copy(g.gift.rotation);

      // Lid pops up and spins away; walls fall open, then tuck away.
      const force = i === this.stubborn ? 1.6 : 1;
      const lu = span(t, open, 0.9);
      g.lid.position.set(g.side * lu * 1.4 * force, g.h + 0.035 + (Math.sin(Math.PI * Math.min(1, lu * 1.2)) * 1.1 + lu * 1.8) * force, -lu * 0.6);
      g.lid.rotation.set(lu * 2.2, 0, g.side * lu * 3);
      g.lid.visible = lu < 1;
      const fall = ease.outBack(span(t, open + 0.08, 0.38), 1.2);
      const tuck = ease.inBack(span(t, open + 0.75, 0.3));
      for (const w of g.walls) {
        const a = (Math.PI / 2) * fall * w.userData.sign;
        w.rotation.set(w.userData.ax === 'x' ? a : 0, 0, w.userData.ax === 'z' ? a : 0);
        w.scale.setScalar(Math.max(0.001, 1 - tuck));
        w.visible = tuck < 1;
      }
    });

    // Star drops onto the A with a spin.
    const su = span(t, this.starAt, 0.5);
    this.star.visible = t > this.starAt;
    this.star.scale.setScalar(Math.max(0.001, ease.outBack(su, 2.4)));
    this.star.rotation.y = (1 - ease.outCubic(su)) * TAU;

    // Snow.
    let n = 0;
    for (const f of this.flakes) {
      const a = t - f.delay;
      if (a < 0) continue;
      const y = Math.max(0.015, f.y0 - a * f.speed);
      const drift = y > 0.015 ? Math.sin(a * 1.6 + f.phase) * 0.15 : Math.sin((f.y0 / f.speed) * 1.6 + f.phase) * 0.15;
      this.snow.set(n++, f.x + drift, y, f.z, this.white, 1);
    }
    this.snow.commit(n);
  }

  settle() {
    this.pose(this.duration);
    // Let every flake finish landing so the resting scene is still.
    let n = 0;
    for (const f of this.flakes) this.snow.set(n++, f.x + Math.sin((f.y0 / f.speed) * 1.6 + f.phase) * 0.15, 0.015, f.z, this.white, 1);
    this.snow.commit(n);
  }

  /** A jingle and a merry hop. */
  react(letter) {
    const k = this.reduced ? 0.4 : 1;
    letter.feel.pos.y.kick(2 * k);
    letter.feel.squash.kick(-2 * k);
    letter.feel.rot.z.kick((Math.random() - 0.5) * 2 * k);
    this.ctx.sound.play('bell', { pitch: 0.9 + hash(letter.index) * 0.5 });
  }
}
