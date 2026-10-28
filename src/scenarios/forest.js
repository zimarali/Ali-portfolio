// A forest clearing in late-afternoon light. Little soil mounds swell and
// mossy letters sprout out of them, swaying like saplings. The "l" gets
// carried away, shoots up too tall and droops back down. Mushrooms pop up
// as the dots of the i's, and a single leaf drifts down to finish.
import * as THREE from 'three';
import { Scene, squash, landing } from './base.js';
import { paperTexture } from '../textures.js';
import { ease, span, wobble, lerp, rng, TAU } from '../motion.js';

const GREENS = [0x5f9a3c, 0x7aae49, 0x4a7f33, 0x8cba5a];

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.22);
  s.quadraticCurveTo(0.16, -0.05, 0, 0.22);
  s.quadraticCurveTo(-0.16, -0.05, 0, -0.22);
  return s;
}

export class Forest extends Scene {
  static id = 'forest';
  static tracking = 0.1;
  title = 'Forest clearing';
  idleEvery = 11;
  look = {
    background: 0xdbe7cb, floor: 0x7b5e40, floorRoughness: 1, sky: 0xfff4d6, ground: 0x3d5a2c, hemi: 1.0,
    key: 0xffdcae, keyIntensity: 2.7, keyDir: [-0.85, 0.9, 0.5], fill: 0xcfe8ff, fillIntensity: 0.45, rim: 0xfff0c0, rimIntensity: 1.2,
    env: 0.3, shadow: 0x24180c, ghost: 0x2c3d1d,
  };
  letterStyle = { depth: 0.3, bevel: 0.07, bevelSpread: 0.8, bevelSegments: 4 };

  material(ch, i) {
    this.moss ??= this.track(paperTexture(17));
    return new THREE.MeshStandardMaterial({ color: GREENS[i % 4], roughness: 0.95, bumpMap: this.moss, bumpScale: 2.5 });
  }

  build() {
    const L = this.letters;
    const r = rng(31);
    const box = this.layout.box;
    const mat = (color, o = {}) => this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o }));
    const geo = (g) => this.track(g);
    const soil = mat(0x6a4a2e, { roughness: 1 });

    // Soil mounds the letters push up through.
    const moundGeo = geo(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2));
    this.mounds = L.map((l) => {
      const m = new THREE.Mesh(moundGeo, soil);
      m.position.set(l.slot.x, 0, l.slot.z);
      m.receiveShadow = true;
      this.add(m);
      return m;
    });

    // Trees around the clearing, never in front of the name.
    const pineMat = mat(0x2f5a2b);
    const pineMat2 = mat(0x3b6e31);
    const bark = mat(0x5a3d26);
    const birch = mat(0xece6d8);
    const cone = geo(new THREE.ConeGeometry(1, 1, 7));
    const trunk = geo(new THREE.CylinderGeometry(0.08, 0.11, 1, 7));
    const spots = [];
    for (let k = 0; k < 16; k++) {
      const side = k % 2 ? 1 : -1;
      const x = side * (box.max.x + 0.9 + r() * 4.5) + (r() - 0.5) * 0.4;
      const z = box.min.z - 0.5 - r() * 6;
      spots.push([x, z]);
    }
    for (let k = 0; k < 7; k++) spots.push([lerp(box.min.x, box.max.x, r()), box.min.z - 2.4 - r() * 4]);
    spots.forEach(([x, z], k) => {
      const tree = new THREE.Group();
      const s = 0.8 + r() * 0.9;
      if (k % 5 === 4) {
        const t = new THREE.Mesh(trunk, birch);
        t.scale.set(1.2, 3.2 * s, 1.2);
        t.position.y = 1.6 * s;
        tree.add(t);
      } else {
        const t = new THREE.Mesh(trunk, bark);
        t.scale.set(1.3, 0.8 * s, 1.3);
        t.position.y = 0.4 * s;
        tree.add(t);
        for (let j = 0; j < 3; j++) {
          const c = new THREE.Mesh(cone, j % 2 ? pineMat2 : pineMat);
          const w = (0.9 - j * 0.22) * s;
          c.scale.set(w, 1.1 * s, w);
          c.position.y = (0.95 + j * 0.62) * s;
          tree.add(c);
        }
      }
      tree.traverse((o) => { o.castShadow = true; });
      tree.position.set(x, 0, z);
      tree.rotation.y = r() * TAU;
      this.add(tree);
    });

    // Grass tufts scattered about.
    const tuft = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(0.035, 0.22, 4)), mat(0x6f9a3e), 140);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < 140; k++) {
      let x, z;
      do { x = lerp(box.min.x - 5, box.max.x + 5, r()); z = lerp(box.min.z - 3, box.max.z + 3, r()); }
      while (x > box.min.x - 0.3 && x < box.max.x + 0.3 && z > box.min.z - 0.1 && z < box.max.z - 0.2);
      m4.makeRotationFromEuler(new THREE.Euler((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5)).setPosition(x, 0.1, z);
      tuft.setMatrixAt(k, m4);
    }
    this.add(tuft);

    // Mushroom caps become the dots of the i's.
    const capGeo = geo(new THREE.SphereGeometry(0.17, 18, 9, 0, TAU, 0, Math.PI / 2));
    const stemGeo = geo(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 10));
    const spotGeo = geo(new THREE.SphereGeometry(0.028, 8, 6));
    const cap = mat(0xd8402c, { roughness: 0.55 });
    const cream = mat(0xf4ead2);
    this.mushrooms = L.filter((l) => l.dot).map((l) => {
      l.dot.visible = false;
      const g = new THREE.Group();
      const stem = new THREE.Mesh(stemGeo, cream);
      stem.position.y = -0.02;
      const c = new THREE.Mesh(capGeo, cap);
      c.scale.y = 0.75;
      c.position.y = 0.04;
      g.add(stem, c);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + 0.3, e = 0.5 + (k % 2) * 0.35;
        const sp = new THREE.Mesh(spotGeo, cream);
        sp.position.set(Math.cos(a) * Math.cos(e) * 0.165, 0.04 + Math.sin(e) * 0.125, Math.sin(a) * Math.cos(e) * 0.165);
        sp.scale.set(1, 0.5, 1);
        g.add(sp);
      }
      g.traverse((o) => { o.castShadow = true; });
      g.position.copy(l.dotHome).add(new THREE.Vector3(0, -0.04, 0));
      l.inner.add(g);
      return { l, g };
    });

    // The leaf.
    this.leaf = new THREE.Mesh(geo(new THREE.ExtrudeGeometry(leafShape(), { depth: 0.01, bevelEnabled: false })), mat(0xe39a2d, { side: THREE.DoubleSide }));
    this.leaf.castShadow = true;
    this.leaf.scale.setScalar(1.7);
    this.add(this.leaf);
    this.addBlob(this.leaf, { strength: 0.5 });
    this.leafLand = new THREE.Vector3(box.max.x - 0.5, 0.012, box.max.z + 0.35);

    // Timing: sprouts in a gentle random order; the l overgrows.
    const order = L.map((_, i) => i).sort(() => r() - 0.5);
    this.sprout = L.map((_, i) => 0.3 + order.indexOf(i) * 0.17);
    this.tall = L.findIndex((l) => l.char === 'l');
    this.overgrow = this.sprout[this.tall] + 0.55;
    this.mushAt = Math.max(...this.sprout) + 0.75;
    this.leafFrom = this.mushAt + 0.1;
    this.leafFor = 1.5;
    this.duration = this.leafFrom + this.leafFor + 0.4;

    this.sprout.forEach((t, i) => this.sfx(t + 0.2, 'paper', { pitch: 0.6 + i * 0.05, gain: 0.8 }));
    this.sfx(this.overgrow, 'boing', { pitch: 0.7 });
    this.mushrooms.forEach((m, k) => this.sfx(this.mushAt + k * 0.18, 'pop', { pitch: 1.4 + k * 0.2 }));
  }

  pose(t) {
    this.letters.forEach((l, i) => {
      const st = this.sprout[i];
      const grow = ease.outBack(span(t, st, 0.55), 1.3);
      const h = l.size.y + 0.05;
      l.root.position.set(l.slot.x, lerp(-h, 0, grow), l.slot.z);
      l.root.rotation.set(0, 0, 0.22 * wobble((t - st - 0.35) * 0.9, 1.1, 3) * (i % 2 ? 1 : -1));
      let sy = 1;
      if (i === this.tall) {
        // Shoots up too tall… then droops back with a wobble.
        const up = Math.sin((Math.PI / 2) * span(t, this.overgrow, 0.3));
        const down = ease.outElastic(span(t, this.overgrow + 0.45, 1.0), 1.8, 4.5);
        sy = 1 + 0.5 * up * (1 - down);
        l.root.rotation.z += 0.3 * up * (1 - down) * Math.sin(Math.PI * span(t, this.overgrow + 0.3, 0.6));
      }
      squash(l.body, sy);
      // Mound swells first, then settles into a little collar of earth.
      const m = this.mounds[i];
      const swell = ease.outCubic(span(t, st - 0.25, 0.3));
      const settle = ease.inOutCubic(span(t, st + 0.15, 0.5));
      const w = Math.max(0.3, l.size.x * 0.62);
      m.scale.set(w * lerp(0.4, 1, swell), Math.max(0.001, lerp(0.32, 0.09, settle) * swell), Math.max(0.22, l.size.z * 1.4) * lerp(0.4, 1, swell));
    });

    this.mushrooms.forEach(({ g }, k) => {
      const at = this.mushAt + k * 0.18;
      const s = ease.outBack(span(t, at, 0.3), 2.6);
      g.scale.set(Math.max(0.001, s), Math.max(0.001, s * landing(t - at - 0.3, 0.3)), Math.max(0.001, s));
    });

    // One leaf, rocking down through the light.
    const u = span(t, this.leafFrom, this.leafFor);
    const land = this.leafLand;
    this.leaf.visible = t > this.leafFrom;
    const sway = Math.sin(u * TAU * 1.6) * (1 - u);
    this.leaf.position.set(land.x + sway * 0.7 + (1 - u) * 0.6, lerp(4.2, land.y, ease.inOutSine(u)), land.z - (1 - u) * 0.6);
    this.leaf.rotation.set(-Math.PI / 2 + (1 - u) * 0.9 * Math.sin(u * TAU * 1.6 + 1), 0.6 + u * 1.2, sway * 0.6);
  }

  settle() { this.pose(this.duration); }

  /** Sways like a sapling in a gust, leaves rustling. */
  react(letter) {
    const k = this.reduced ? 0.35 : 1;
    letter.feel.rot.z.kick((Math.random() > 0.5 ? 1 : -1) * 3.2 * k);
    letter.feel.squash.kick(-1.2 * k);
    const m = this.mushrooms.find((x) => x.l === letter);
    if (m) this.play(letter, 0.6, (p) => { m.g.scale.set(1, landing(p * 0.6, 0.35, 3), 1); m.g.position.y = letter.dotHome.y - 0.04 + Math.sin(Math.PI * Math.min(1, p * 2)) * 0.18 * k; });
    this.ctx.sound.play('paper', { pitch: 0.7 + Math.random() * 0.3, gain: 1.2 });
  }

  idle() {
    const l = this.letters[Math.floor(Math.random() * this.letters.length)];
    if (l.feel.mode === 'home') l.feel.rot.z.kick((Math.random() - 0.5) * 1.2);
  }
}
