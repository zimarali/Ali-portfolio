// Soft, inflated vinyl letters tumble from above, bounce, nudge their
// neighbours and jiggle to rest. Gag: the last "i" loses its dot, which
// bonks off the top of the "l" before plopping into place.
import * as THREE from 'three';
import { Scene } from './base.js';
import { bounceDrop, ease, span, wobble, rng, lerp, clamp } from '../motion.js';

const COLORS = [0xff7a90, 0x7cc6ff, 0xffd36e, 0x8fdcb4, 0xb9a3ff, 0xff9f6e, 0x7cc6ff, 0xff7a90];
const ORDER = [2, 0, 5, 3, 7, 1, 6, 4];
const G = 24;

function squash(mesh, sy) {
  const w = 1 / Math.sqrt(Math.max(0.3, sy));
  mesh.scale.set(w, sy, w);
}

export class Inflatables extends Scene {
  static id = 'inflatables';
  static tracking = 0.17;
  title = 'Balloon letters';
  duration = 4.7;
  idleEvery = 9;
  look = {
    background: 0xf7dfe4, floor: 0xf4d3db, sky: 0xfff2f5, ground: 0xe6aebb, hemi: 0.85,
    key: 0xfff4ea, keyIntensity: 2.2, fill: 0xd7e9ff, fillIntensity: 0.6, rimIntensity: 1.2,
    env: 0.6, shadow: 0x7a3550, exposure: 0.98,
  };
  letterStyle = { depth: 0.3, bevel: 0.13, bevelSpread: 0.78, bevelSegments: 7 };

  material(ch, i) {
    return new THREE.MeshPhysicalMaterial({
      color: COLORS[i], roughness: 0.34, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.14,
      sheen: 0.25, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5,
    });
  }

  build() {
    const r = rng(7);
    this.plan = this.letters.map((l, i) => {
      const order = ORDER.indexOf(i);
      return {
        start: 0.12 + order * 0.19,
        h0: 6.6 + r() * 1.4,
        dx: (r() - 0.5) * 1.1,
        spin: new THREE.Vector3((r() - 0.5) * 3.2, (r() - 0.5) * 2, (r() - 0.5) * 3.6),
        side: r() > 0.5 ? 1 : -1,
      };
    });
    for (const p of this.plan) p.land = p.start + Math.sqrt((2 * p.h0) / G);

    // The two i's: index 3 (Ramiz) and index 7 (Ali). The l is index 6.
    this.iA = this.letters[3];
    this.iB = this.letters[7];
    this.l = this.letters[6];
    this.dotA = { start: this.plan[3].land + 0.5, h0: 5.5 };
    const lTop = this.l.size.y;
    this.gag = { start: 2.75, h0: 7.2, lTop, bonk: 0, hop: 0.56 };
    this.gag.bonk = this.gag.start + Math.sqrt((2 * (this.gag.h0 - lTop)) / G);

    this.plan.forEach((p, i) => {
      this.sfx(p.land, 'pop', { pitch: 0.8 + i * 0.05, gain: 0.7 });
      this.sfx(p.land + 0.33, 'pop', { pitch: 1.1 + i * 0.05, gain: 0.25 });
    });
    this.sfx(this.dotA.start + Math.sqrt((2 * this.dotA.h0) / G), 'pop', { pitch: 1.7, gain: 0.5 });
    this.sfx(this.gag.bonk, 'boing', { pitch: 1.1 });
    this.sfx(this.gag.bonk + this.gag.hop, 'pop', { pitch: 1.9, gain: 0.7 });
  }

  pose(t) {
    this.letters.forEach((l, i) => {
      const p = this.plan[i];
      const lt = t - p.start;
      const s = l.slot;
      if (lt < 0) {
        l.root.position.set(s.x + p.dx, p.h0 + 2, s.z);
        l.root.rotation.set(p.spin.x, p.spin.y, p.spin.z);
        return;
      }
      const b = bounceDrop(lt, p.h0, G, 0.36, 3);
      const fall = clamp(lt / (p.land - p.start));
      const tumble = 1 - ease.inQuad(fall);
      const since = Math.max(0, t - p.land);
      // Neighbours that land later bump this letter sideways.
      let bump = 0;
      for (const k of [i - 1, i + 1]) {
        const q = this.plan[k];
        if (q && this.letters[k].slot.row === s.row && q.land > p.land && t > q.land) bump += (k < i ? -1 : 1) * -0.11 * wobble((t - q.land) * 0.9, 2.2, 4.2);
      }
      let bonk = 0;
      if (l === this.l && t > this.gag.bonk) bonk = 0.5 * wobble((t - this.gag.bonk) * 0.8, 2.5, 4);

      l.root.position.set(s.x + p.dx * (1 - ease.outCubic(span(lt, 0, 1.2))), b.y, s.z);
      l.root.rotation.set(
        p.spin.x * tumble + 0.12 * wobble(since * 0.8, 1.6, 4),
        p.spin.y * tumble,
        p.spin.z * tumble + p.side * 0.2 * wobble(since * 0.7, 1.5, 3.6) + bump,
      );
      const jelly = since > 0 ? 1 - 0.34 * Math.exp(-5.5 * since) * Math.cos(Math.PI * 2 * 2.4 * since) : 1 + 0.06 * fall;
      squash(l.body, jelly - (l === this.l ? bonk * 0.5 : 0));
    });
    this.poseDots(t);
  }

  poseDots(t) {
    // Dot A: a simple drop onto its stem.
    const a = this.iA.dot;
    const ha = this.iA.dotHome;
    if (a) {
      const b = bounceDrop(t - this.dotA.start, this.dotA.h0, G, 0.4, 2);
      a.position.set(ha.x, t < this.dotA.start ? 20 : ha.y + b.y, ha.z);
      const land = this.dotA.start + Math.sqrt((2 * this.dotA.h0) / G);
      squash(a, t > land ? 1 - 0.4 * Math.exp(-7 * (t - land)) * Math.cos(Math.PI * 2 * 3 * (t - land)) : 1.1);
    }
    // Dot B: falls onto the l, boings off and plops onto its own i.
    const d = this.iB.dot;
    const hb = this.iB.dotHome;
    if (!d) return;
    const g = this.gag;
    const lx = this.l.slot.x - this.iB.slot.x; // l's position in the i's local frame
    if (t < g.start) {
      d.position.set(lx, 20, hb.z);
    } else if (t < g.bonk) {
      const tt = t - g.start;
      d.position.set(lx, g.h0 - 0.5 * G * tt * tt, hb.z);
      d.rotation.set(0, 0, 0);
      squash(d, 1.12);
    } else if (t < g.bonk + g.hop) {
      const u = (t - g.bonk) / g.hop;
      d.position.set(lerp(lx, hb.x, ease.inOutSine(u)), lerp(g.lTop + 0.12, hb.y, u) + Math.sin(Math.PI * u) * 1.05, hb.z);
      d.rotation.set(0, 0, -u * Math.PI * 2);
      squash(d, 1 + 0.25 * Math.sin(Math.PI * u));
    } else {
      const since = t - g.bonk - g.hop;
      d.position.copy(hb);
      d.rotation.set(0, 0, 0);
      squash(d, 1 - 0.45 * Math.exp(-6.5 * since) * Math.cos(Math.PI * 2 * 2.8 * since));
    }
  }

  settle() {
    for (const l of this.letters) squash(l.body, 1);
  }

  react(letter) {
    const f = letter.feel;
    const k = this.reduced ? 0.4 : 1;
    f.squash.kick(-5.5 * k);
    f.rot.kick((Math.random() - 0.5) * 3 * k, 0, (Math.random() - 0.5) * 4 * k);
    f.pos.y.kick(1.4 * k);
    this.ctx.sound.play('boing', { pitch: 0.8 + Math.random() * 0.5 });
    if (letter.dot) {
      const home = letter.dotHome;
      this.play(letter, 0.75, (p) => {
        letter.dot.position.y = home.y + Math.sin(Math.PI * Math.min(1, p * 1.25)) * 0.75 * k;
        letter.dot.rotation.z = -ease.outCubic(Math.min(1, p * 1.25)) * Math.PI * 2;
        const land = Math.max(0, p * 1.25 - 1) / 0.25;
        squash(letter.dot, p > 0.8 ? 1 - 0.3 * Math.sin(Math.PI * land) : 1);
      });
    }
  }

  idle() {
    const l = this.letters[Math.floor(Math.random() * this.letters.length)];
    l.feel.squash.kick(-1.6);
    l.feel.rot.z.kick((Math.random() - 0.5) * 0.8);
    this.stage.wake();
  }
}
