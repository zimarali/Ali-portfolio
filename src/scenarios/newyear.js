// New Year: gold and silver letters launch like rockets, each bursting into
// a firework at the top of its climb, then drift down into place beneath the
// sparks. Two party poppers finish it off, and the confetti stays where it lands.
import * as THREE from 'three';
import { Scene, squash, landing } from './base.js';
import { Particles, hash, sphereDir } from '../effects.js';
import { ease, span, lerp, rng, clamp } from '../motion.js';

const METALS = [0xe2b85a, 0xd7dbe2, 0xf1d59a, 0xe2b85a, 0xd7dbe2, 0xe2b85a, 0xf1d59a, 0xd7dbe2];
const SPARK = [0xffd36e, 0xff5fa2, 0x6fdcff, 0xc6ff6e, 0xffffff];
const BURST = 54;
const TRAIL = 10;
const CONFETTI = 240;
const RISE = 0.62;
const FALL = 1.0;

export class NewYear extends Scene {
  static id = 'newyear';
  static holiday = true;
  static tracking = 0.1;
  title = 'Happy New Year';
  look = {
    background: 0x0f1733, floor: 0x111a33, floorRoughness: 0.9, sky: 0x6c7fd9, ground: 0x0a0f22, hemi: 0.5,
    key: 0xdfe6ff, keyIntensity: 1.2, keyDir: [-0.4, 1, 0.7], fill: 0xff9fd0, fillIntensity: 0.4, rim: 0xffd28a, rimIntensity: 1.5,
    env: 0.8, shadow: 0x000000, ghost: 0xd9b25c, exposure: 1.05,
  };
  letterStyle = { depth: 0.22, bevel: 0.04, bevelSpread: 0.8, bevelSegments: 4 };

  material(ch, i) { return new THREE.MeshStandardMaterial({ color: METALS[i], metalness: 0.85, roughness: 0.28 }); }

  build() {
    const L = this.letters;
    const r = rng(2026);
    const order = L.map((_, i) => i).sort(() => r() - 0.5);
    this.plan = L.map((l, i) => {
      const launch = 0.15 + order.indexOf(i) * 0.21;
      return {
        launch,
        from: new THREE.Vector3(l.slot.x + (r() - 0.5) * 1.6, -0.6, l.slot.z + 2.6),
        apex: new THREE.Vector3(l.slot.x + (r() - 0.5) * 0.8, 2.15 + r() * 0.55, l.slot.z - 0.6),
        color: new THREE.Color(SPARK[i % SPARK.length]),
        spin: (r() > 0.5 ? 1 : -1) * (2 + r() * 2),
      };
    });
    this.sparks = new Particles(L.length * (BURST + TRAIL), { size: 0.42, additive: true });
    this.add(this.sparks.points);

    // Confetti from two poppers at the front corners.
    const box = this.layout.box;
    this.popAt = Math.max(...this.plan.map((p) => p.launch)) + RISE + FALL + 0.15;
    this.confetti = new Particles(CONFETTI, { size: 0.24 });
    this.add(this.confetti.points);
    const colors = [0xff5fa2, 0x6fdcff, 0xffd36e, 0xc6ff6e, 0xb59cff, 0xffffff].map((c) => new THREE.Color(c));
    this.bits = Array.from({ length: CONFETTI }, (_, k) => {
      const side = k % 2 ? 1 : -1;
      const a = 0.75 + r() * 0.55;
      const sp = 4.2 + r() * 3.2;
      return {
        x0: side > 0 ? box.max.x + 0.6 : box.min.x - 0.6, z0: box.max.z + 0.8,
        vx: -side * Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: -(0.5 + r() * 1.8),
        delay: (k % 2) * 0.12 + r() * 0.08, color: colors[k % colors.length], phase: r() * 6,
      };
    });
    this.duration = this.popAt + 1.9;

    this.plan.forEach((p, i) => {
      this.sfx(p.launch, 'swish', { pitch: 2.6, gain: 0.25 });
      this.sfx(p.launch + RISE, 'boom', { pitch: 0.8 + i * 0.06, gain: 0.7 });
      this.sfx(p.launch + RISE + FALL, 'tok', { pitch: 1.2, gain: 0.5 });
    });
    this.sfx(this.popAt, 'pop', { pitch: 0.7, gain: 1.2 });
    this.sfx(this.popAt + 0.12, 'pop', { pitch: 0.8, gain: 1.2 });
    this.mini = new Particles(48, { size: 0.34, additive: true });
    this.add(this.mini.points);
  }

  frameBox() {
    const b = this.layout.box.clone();
    b.max.y = 2.9;
    return b;
  }

  pose(t) {
    const dir = new THREE.Vector3();
    let n = 0;
    this.letters.forEach((l, i) => {
      const p = this.plan[i];
      const up = span(t, p.launch, RISE);
      const down = span(t, p.launch + RISE, FALL);
      const pos = l.root.position;
      if (t < p.launch + RISE) {
        pos.lerpVectors(p.from, p.apex, ease.outQuad(up));
        l.root.rotation.set(0, p.spin * up * Math.PI, 0);
        l.root.scale.setScalar(Math.max(0.001, lerp(0.35, 0.55, up)));
      } else {
        // Drifting down under the burst, rocking like it hangs from a tiny chute.
        pos.lerpVectors(p.apex, l.rest.position, ease.inOutSine(down));
        l.root.rotation.set(0, p.spin * Math.PI * (1 - ease.outCubic(down)), 0.18 * Math.sin(down * 9) * (1 - down));
        l.root.scale.setScalar(lerp(0.55, 1, ease.outBack(down, 1.2)));
      }
      l.root.visible = t > p.launch;
      squash(l.body, landing(t - p.launch - RISE - FALL, 0.22));

      // Trail behind the rocket.
      if (up > 0 && up < 1) {
        for (let k = 0; k < TRAIL; k++) {
          const u = clamp(up - k * 0.035);
          const q = new THREE.Vector3().lerpVectors(p.from, p.apex, ease.outQuad(u));
          this.sparks.set(n++, q.x + (hash(k + i * 9 + Math.floor(t * 30)) - 0.5) * 0.06, q.y, q.z, p.color, (1 - k / TRAIL) * 0.8);
        }
      }
      // The burst.
      const age = t - p.launch - RISE;
      if (age > 0 && age < 1.6) {
        for (let k = 0; k < BURST; k++) {
          sphereDir(k + i * 101, dir);
          const sp = 1.7 + hash(k * 3 + i) * 0.9;
          const d = (sp * (1 - Math.exp(-2.4 * age))) / 2.4;
          const fade = (1 - age / 1.6) ** 2 * (hash(k + Math.floor(age * 18)) > 0.25 ? 1 : 0.3);
          this.sparks.set(n++, p.apex.x + dir.x * d, p.apex.y + dir.y * d - 1.1 * age * age, p.apex.z + dir.z * d, p.color, fade);
        }
      }
    });
    this.sparks.commit(n);

    // Confetti: arcs out, flutters down, and stays on the floor.
    let c = 0;
    for (const b of this.bits) {
      const a = t - this.popAt - b.delay;
      if (a < 0) continue;
      const k = 1.9, g = 6;
      const e = (1 - Math.exp(-k * a)) / k;
      const x = b.x0 + b.vx * e + Math.sin(a * 5 + b.phase) * 0.12 * clamp(a);
      const y = Math.max(0.012, 0.15 + (b.vy + g / k) * e - (g / k) * a);
      const z = b.z0 + b.vz * e;
      this.confetti.set(c++, x, y, z, b.color);
    }
    this.confetti.commit(c);
  }

  settle() {
    this.pose(this.duration);
    this.sparks.commit(0);
  }

  /** A little sparkle burst, like a sparkler touched to the letter. */
  react(letter) {
    const k = this.reduced ? 0.4 : 1;
    letter.feel.pos.y.kick(1.6 * k);
    letter.feel.squash.kick(-1.6 * k);
    const top = new THREE.Vector3();
    letter.inner.getWorldPosition(top);
    top.y += letter.size.y + 0.1;
    const col = this.plan[letter.index].color;
    const dir = new THREE.Vector3();
    this.animate(0.9, (u) => {
      for (let j = 0; j < 48; j++) {
        sphereDir(j * 7 + letter.index, dir);
        const d = 0.8 * (1 - Math.exp(-3 * u));
        this.mini.set(j, top.x + dir.x * d, top.y + dir.y * d - 0.5 * u * u, top.z + dir.z * d, col, (1 - u) ** 2);
      }
      this.mini.commit(u >= 1 ? 0 : 48);
    });
    this.ctx.sound.play('boom', { pitch: 1.6, gain: 0.35 });
  }
}
