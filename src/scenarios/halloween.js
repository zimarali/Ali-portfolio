// Halloween: under a big moon, pumpkin-orange letters claw their way up out
// of the ground among the tombstones. Then a little ghost swoops past and
// shouts BOO — every letter jumps out of its skin — and it hangs around,
// floating smugly beside the name.
import * as THREE from 'three';
import { Scene, squash, landing } from './base.js';
import { glowTexture, hash } from '../effects.js';
import { ease, span, lerp, rng, catmull, TAU } from '../motion.js';

const PUMPKIN = [0xf07a1a, 0xff9a2e, 0xe8661a];

function buildGhost(track) {
  const pts = [[0, 0.64], [0.16, 0.62], [0.28, 0.54], [0.35, 0.38], [0.37, 0.12], [0.4, -0.12], [0.47, -0.3], [0.52, -0.38]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const sheet = new THREE.Mesh(track(new THREE.LatheGeometry(pts, 28)), track(new THREE.MeshStandardMaterial({
    color: 0xf6f3ff, emissive: 0x9a9cff, emissiveIntensity: 0.18, roughness: 0.7, transparent: true, opacity: 0.93, side: THREE.DoubleSide,
  })));
  sheet.castShadow = true;
  const ink = track(new THREE.MeshBasicMaterial({ color: 0x1b1626 }));
  const eyeGeo = track(new THREE.SphereGeometry(0.05, 10, 8));
  const g = new THREE.Group();
  g.add(sheet);
  for (const x of [-0.11, 0.11]) {
    const e = new THREE.Mesh(eyeGeo, ink);
    e.scale.set(0.8, 1.3, 0.5);
    e.position.set(x, 0.36, 0.33);
    g.add(e);
  }
  const mouth = new THREE.Mesh(eyeGeo, ink);
  mouth.scale.set(0.9, 0.9, 0.4);
  mouth.position.set(0, 0.2, 0.355);
  g.add(mouth);
  g.userData.mouth = mouth;
  return g;
}

export class Halloween extends Scene {
  static id = 'halloween';
  static holiday = true;
  static tracking = 0.1;
  title = 'Happy Halloween';
  idleEvery = 7;
  look = {
    background: 0x1d1633, floor: 0x251d39, floorRoughness: 1, sky: 0x8f7fd6, ground: 0x0e0a18, hemi: 0.55,
    key: 0xc4ccff, keyIntensity: 1.7, keyDir: [-0.5, 1, 0.35], fill: 0xff8a3d, fillIntensity: 0.7, rim: 0x9fb0ff, rimIntensity: 1.6,
    env: 0.35, shadow: 0x000000, ghost: 0xf07a1a, exposure: 1.05,
  };
  letterStyle = { depth: 0.32, bevel: 0.07, bevelSpread: 0.8, bevelSegments: 4 };

  material(ch, i) {
    return new THREE.MeshStandardMaterial({ color: PUMPKIN[i % 3], roughness: 0.6, emissive: 0xff5a00, emissiveIntensity: 0.12 });
  }

  build() {
    const L = this.letters;
    const r = rng(1031);
    const box = this.layout.box;
    const mat = (color, o = {}) => this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o }));
    const geo = (g) => this.track(g);

    // Moon with a soft halo.
    const moon = new THREE.Mesh(geo(new THREE.SphereGeometry(1.3, 24, 16)), this.track(new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false })));
    moon.position.set(box.min.x + 0.2, 3.3, -15);
    const halo = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff1c4, transparent: true, opacity: 0.45, depthWrite: false, fog: false })));
    halo.scale.setScalar(7);
    halo.position.copy(moon.position);
    this.add(moon, halo);

    // Tombstones and bare trees behind.
    const stone = mat(0x6b6880);
    const tomb = geo(new THREE.CapsuleGeometry(0.28, 0.4, 4, 10));
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Mesh(tomb, stone);
      s.scale.set(1, 1, 0.35);
      s.position.set(lerp(box.min.x - 2.5, box.max.x + 2.5, k / 6) + (r() - 0.5) * 0.8, 0.25, box.min.z - 1.2 - r() * 2.5);
      s.rotation.z = (r() - 0.5) * 0.35;
      s.castShadow = true;
      this.add(s);
    }
    const bark = mat(0x16111f);
    const limb = geo(new THREE.CylinderGeometry(0.03, 0.07, 1, 6));
    for (const side of [-1, 1]) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(limb, bark);
      trunk.scale.set(2, 2.6, 2);
      trunk.position.y = 1.3;
      tree.add(trunk);
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(limb, bark);
        b.scale.set(1, 0.9 + r() * 0.6, 1);
        b.position.set((k % 2 ? 1 : -1) * 0.25, 1.6 + k * 0.28, 0);
        b.rotation.z = (k % 2 ? -1 : 1) * (0.7 + r() * 0.4);
        tree.add(b);
      }
      tree.position.set(side > 0 ? box.max.x + 2.2 : box.min.x - 2.2, 0, box.min.z - 1.8);
      this.add(tree);
    }

    // Dirt where each letter breaks through.
    const dirt = mat(0x140f1c);
    const moundGeo = geo(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2));
    this.mounds = L.map((l) => {
      const m = new THREE.Mesh(moundGeo, dirt);
      m.position.set(l.slot.x, 0, l.slot.z);
      this.add(m);
      return m;
    });

    // Pumpkin dots on the i's.
    const pumpGeo = geo(new THREE.SphereGeometry(0.13, 14, 10));
    const stemGeo = geo(new THREE.CylinderGeometry(0.018, 0.025, 0.07, 6));
    for (const l of L.filter((x) => x.dot)) {
      l.dot.visible = false;
      const p = new THREE.Group();
      const ball = new THREE.Mesh(pumpGeo, l.body.material);
      ball.scale.set(1.15, 0.85, 1.15);
      const stem = new THREE.Mesh(stemGeo, mat(0x3f6b2a));
      stem.position.y = 0.12;
      p.add(ball, stem);
      p.position.copy(l.dotHome);
      p.traverse((o) => { o.castShadow = true; });
      l.inner.add(p);
    }

    // The ghost.
    this.ghost = buildGhost((x) => this.track(x));
    this.add(this.ghost);
    this.addBlob(this.ghost.children[0], { strength: 0.6 });
    const frontZ = box.max.z;
    this.ghostPath = [
      new THREE.Vector3(box.max.x + 4.5, 2.4, frontZ - 1),
      new THREE.Vector3(box.max.x + 0.6, 1.3, frontZ + 0.6),
      new THREE.Vector3((box.min.x + box.max.x) / 2, 0.85, frontZ + 1.1),
      new THREE.Vector3(box.min.x + 0.3, 1.2, frontZ + 0.7),
      new THREE.Vector3(box.min.x - 0.75, 1.55, frontZ + 0.1),
    ];
    this.ghostRest = this.ghostPath.at(-1);

    const order = L.map((_, i) => i).sort(() => r() - 0.5);
    this.rise = L.map((_, i) => 0.25 + order.indexOf(i) * 0.2);
    this.swoop = Math.max(...this.rise) + 0.7;
    this.boo = this.swoop + 0.55;
    this.duration = this.swoop + 2.3;
    this.rise.forEach((t, i) => this.sfx(t + 0.1, 'thud', { pitch: 0.5 + i * 0.04, gain: 0.5 }));
    this.sfx(this.swoop, 'swish', { pitch: 0.7, gain: 0.6 });
    this.sfx(this.boo, 'boing', { pitch: 0.45, gain: 1.4 });
    this.sfx(this.boo + 0.08, 'pop', { pitch: 0.5 });

    this.pokeables = [{ object: this.ghost, onPoke: () => this.spook() }];
    this.ghost.userData.pokeable = this.pokeables[0];
  }

  frameBox() {
    const b = this.layout.box.clone();
    b.min.x -= 1.1;
    return b;
  }

  pose(t) {
    this.letters.forEach((l, i) => {
      const st = this.rise[i];
      const u = span(t, st, 0.95);
      const h = l.size.y + 0.05;
      // Clawing up: jerky, stepwise, a bit drunk.
      const jerky = (Math.floor(u * 7) + ease.outCubic((u * 7) % 1)) / 7;
      const shake = (hash(Math.floor(t * 14) + i * 13) - 0.5) * 0.3 * (1 - u) * (u > 0 ? 1 : 0);
      l.root.position.set(l.slot.x, lerp(-h, 0, u >= 1 ? 1 : jerky), l.slot.z);
      // The fright: everyone jumps, then shivers.
      const jumpAt = this.boo + 0.05 + i * 0.03;
      const jump = span(t, jumpAt, 0.42);
      l.root.position.y += Math.sin(Math.PI * jump) * 0.55;
      const shiver = t > jumpAt + 0.42 ? (hash(Math.floor(t * 30) + i) - 0.5) * 0.14 * (1 - span(t, jumpAt + 0.42, 0.7)) : 0;
      l.root.rotation.set(0, 0, shake + shiver);
      squash(l.body, jump > 0 && jump < 1 ? 1 + 0.25 * Math.sin(Math.PI * jump) : landing(t - jumpAt - 0.42, 0.25));
      const m = this.mounds[i];
      const s = ease.outCubic(span(t, st - 0.15, 0.3));
      m.scale.set(Math.max(0.001, Math.max(0.3, l.size.x * 0.6) * s), Math.max(0.001, 0.12 * s), Math.max(0.001, 0.3 * s));
    });

    // Ghost swoops in front, says BOO, and settles beside the name.
    const g = this.ghost;
    const u = span(t, this.swoop, 1.5);
    const p = catmull(this.ghostPath, ease.inOutSine(u));
    const q = catmull(this.ghostPath, Math.min(1, ease.inOutSine(u) + 0.02));
    g.visible = t > this.swoop;
    g.position.set(p.x, p.y, p.z);
    const facing = u < 1 ? Math.atan2(q.x - p.x, q.z - p.z) : 0;
    const boo = Math.sin(Math.PI * span(t, this.boo - 0.1, 0.45));
    g.rotation.set(0, lerp(facing, 0, Math.max(boo, ease.inOutCubic(span(t, this.swoop + 1.2, 0.4)))), Math.sin(t * 5) * 0.08 * (1 - u));
    g.scale.setScalar(1 + boo * 0.35);
    g.userData.mouth.scale.set(0.9 + boo * 0.7, 0.9 + boo * 1.4, 0.4);
  }

  settle() { this.pose(this.duration); }

  /** A poked letter gets the jitters. */
  react(letter) {
    const k = this.reduced ? 0.3 : 1;
    letter.feel.pos.y.kick(2.4 * k);
    letter.feel.squash.kick(-2 * k);
    this.play(letter, 0.7, (p, t) => { letter.body.rotation.z = (hash(Math.floor(t * 30) + letter.index) - 0.5) * 0.2 * (1 - p) * k; });
    this.ctx.sound.play('boing', { pitch: 0.6 + Math.random() * 0.2 });
  }

  spook() {
    const g = this.ghost;
    this.animate(0.9, (u) => {
      g.rotation.y = ease.inOutCubic(u) * TAU;
      g.position.y = this.ghostRest.y + Math.sin(Math.PI * u) * 0.3;
      g.userData.mouth.scale.set(0.9 + Math.sin(Math.PI * u) * 0.7, 0.9 + Math.sin(Math.PI * u) * 1.4, 0.4);
    });
    this.ctx.sound.play('boing', { pitch: 0.45, gain: 1.2 });
    this.letters.forEach((l, i) => setTimeout(() => { if (l.feel.mode === 'home') { l.feel.pos.y.kick(2); this.stage.wake(); } }, 150 + i * 30));
  }

  /** The ghost bobs now and then, just to remind you it's there. */
  idle() {
    const g = this.ghost;
    this.animate(1.6, (u) => { g.position.y = this.ghostRest.y + Math.sin(u * TAU) * 0.08; g.rotation.z = Math.sin(u * TAU) * 0.06; });
  }
}
