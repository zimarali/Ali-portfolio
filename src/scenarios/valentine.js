// Valentine's Day: candy-heart letters drift down under heart balloons. As
// each one touches down its balloon lets go and floats away — except the
// "A"'s, which hauls it back up into the air until the string snaps. The
// dots of the i's become little hearts.
import * as THREE from 'three';
import { Scene, squash, landing } from './base.js';
import { ease, span, lerp, rng, bounceDrop, wobble } from '../motion.js';

const CANDY = [0xff9fb2, 0xfff0b3, 0xc9f0d6, 0xd8c8ff, 0xffb8a0, 0xff9fb2, 0xc9f0d6, 0xfff0b3];
const BALLOONS = [0xff3b6b, 0xff7aa2, 0xe0244f];
const DESCENT = 1.55;

export function heartShape(s = 1) {
  const h = new THREE.Shape();
  h.moveTo(0, -0.5 * s);
  h.bezierCurveTo(-0.15 * s, -0.36 * s, -0.55 * s, -0.12 * s, -0.5 * s, 0.16 * s);
  h.bezierCurveTo(-0.46 * s, 0.42 * s, -0.12 * s, 0.48 * s, 0, 0.26 * s);
  h.bezierCurveTo(0.12 * s, 0.48 * s, 0.46 * s, 0.42 * s, 0.5 * s, 0.16 * s);
  h.bezierCurveTo(0.55 * s, -0.12 * s, 0.15 * s, -0.36 * s, 0, -0.5 * s);
  return h;
}

export class Valentine extends Scene {
  static id = 'valentine';
  static holiday = true;
  static tracking = 0.12;
  title = "Happy Valentine's Day";
  look = {
    background: 0xffe4ea, floor: 0xffd7df, sky: 0xffffff, ground: 0xe89aac, hemi: 1.0,
    key: 0xfff0e6, keyIntensity: 2.4, keyDir: [-0.5, 1, 0.7], fill: 0xffd0e0, fillIntensity: 0.5, rimIntensity: 1,
    env: 0.5, shadow: 0x8a3a52,
  };
  letterStyle = { depth: 0.3, bevel: 0.09, bevelSpread: 0.75, bevelSegments: 5 };

  material(ch, i) { return new THREE.MeshStandardMaterial({ color: CANDY[i], roughness: 0.72, emissive: 0xff4f86, emissiveIntensity: 0 }); }

  build() {
    const L = this.letters;
    const r = rng(214);
    const balloonGeo = this.track(new THREE.ExtrudeGeometry(heartShape(0.62), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 5, curveSegments: 16 }));
    balloonGeo.center();
    const knotGeo = this.track(new THREE.SphereGeometry(0.04, 8, 6));
    this.balloons = L.map((l, i) => {
      const mat = this.track(new THREE.MeshPhysicalMaterial({ color: BALLOONS[i % 3], roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }));
      const g = new THREE.Group();
      const b = new THREE.Mesh(balloonGeo, mat);
      b.castShadow = true;
      const knot = new THREE.Mesh(knotGeo, mat);
      knot.position.y = -0.36;
      g.add(b, knot);
      this.add(g);
      return g;
    });
    // One line segment per string.
    this.strings = new THREE.LineSegments(this.track(new THREE.BufferGeometry()), this.track(new THREE.LineBasicMaterial({ color: 0xa06a7c })));
    this.strings.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L.length * 6), 3));
    this.strings.frustumCulled = false;
    this.add(this.strings);

    // Heart tittles.
    const tittle = this.track(new THREE.ExtrudeGeometry(heartShape(0.3), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 }));
    tittle.center();
    const red = this.track(new THREE.MeshPhysicalMaterial({ color: 0xe0244f, roughness: 0.3, clearcoat: 1 }));
    this.hearts = L.filter((l) => l.dot).map((l) => {
      l.dot.visible = false;
      const h = new THREE.Mesh(tittle, red);
      h.position.copy(l.dotHome);
      h.castShadow = true;
      l.inner.add(h);
      return h;
    });
    this.heartGeo = tittle;
    this.heartMat = red;

    const order = L.map((_, i) => i).sort(() => r() - 0.5);
    this.gag = L.findIndex((l) => l.char === 'A');
    this.plan = L.map((l, i) => {
      const start = 0.1 + order.indexOf(i) * 0.12;
      return { start, land: start + DESCENT, drift: (r() - 0.5) * 1.6, sway: r() * 6, away: (r() - 0.5) * 2 };
    });
    const g = this.plan[this.gag];
    g.yank = g.land + 0.25;
    g.snap = Math.max(g.land + 1.25, 3.0);
    this.heartAt = Math.max(...this.plan.map((p) => p.land), g.snap + 0.5) + 0.1;
    this.duration = this.heartAt + 1.0;

    this.plan.forEach((p, i) => this.sfx(p.land, 'tok', { pitch: 1 + i * 0.05, gain: 0.5 }));
    this.sfx(g.yank, 'boing', { pitch: 0.8 });
    this.sfx(g.snap, 'pop', { pitch: 1.6, gain: 1.2 });
    this.hearts.forEach((_, k) => this.sfx(this.heartAt + k * 0.15, 'pop', { pitch: 1.8 }));
  }

  frameBox() {
    const b = this.layout.box.clone();
    b.max.y = 1.6;
    return b;
  }

  pose(t) {
    const pos = this.strings.geometry.attributes.position;
    const top = new THREE.Vector3();
    this.letters.forEach((l, i) => {
      const p = this.plan[i];
      const u = span(t, p.start, DESCENT);
      const sway = Math.sin(t * 2.2 + p.sway) * (1 - u);
      // Letter: floats down, swaying, and lands with a little squash.
      let y = lerp(5.2, 0, ease.inOutSine(u));
      let x = l.slot.x + p.drift * (1 - ease.outCubic(u)) + sway * 0.25;
      let rz = sway * 0.18;
      let sq = landing(t - p.land, 0.2);
      let attached = t < p.land + 0.15;
      if (i === this.gag && t > p.land) {
        // Yanked back up, bobbing… until the string snaps and it drops.
        if (t < p.snap) {
          const lift = ease.outBack(span(t, p.yank, 0.35), 1.6);
          y = lift * (0.55 + 0.1 * Math.sin((t - p.yank) * 9));
          rz = 0.12 * Math.sin((t - p.yank) * 7) * lift;
          attached = true;
          sq = 1 + 0.06 * lift;
        } else {
          const drop = bounceDrop(t - p.snap, 0.6, 26, 0.35, 2);
          y = drop.y;
          rz = 0.1 * wobble(t - p.snap - 0.3, 2, 4);
          sq = drop.impact >= 0 ? landing(drop.since, 0.24) : 1;
        }
      }
      l.root.position.set(x, y, l.slot.z);
      l.root.rotation.set(0, 0, rz);
      squash(l.body, sq);

      // Balloon: above the letter while attached, then floats up and away.
      const b = this.balloons[i];
      top.set(x, y + l.size.y + 0.05, l.slot.z);
      const release = i === this.gag ? p.snap : p.land + 0.15;
      const free = Math.max(0, t - release);
      const speed = i === this.gag ? 2.6 : 1.4;
      b.position.set(top.x + Math.sin(t * 1.7 + p.sway) * 0.08 + p.away * free * 0.3, top.y + 0.75 + speed * free * free * 0.9 + free * 0.6, top.z - 0.1 - free * 0.4);
      b.rotation.set(0, Math.sin(t * 1.3 + p.sway) * 0.4, Math.sin(t * 1.9 + p.sway) * 0.12 + p.away * free * 0.2);
      b.visible = b.position.y < 9;
      // String from knot to letter (or trailing under the balloon once free).
      const end = attached ? top : new THREE.Vector3(b.position.x - 0.05, b.position.y - 1.0, b.position.z);
      pos.setXYZ(i * 2, b.position.x, b.position.y - 0.36, b.position.z);
      pos.setXYZ(i * 2 + 1, end.x, end.y, end.z);
      if (!b.visible) { pos.setXYZ(i * 2, 0, -99, 0); pos.setXYZ(i * 2 + 1, 0, -99, 0); }
    });
    pos.needsUpdate = true;

    this.hearts.forEach((h, k) => {
      const s = ease.outBack(span(t, this.heartAt + k * 0.15, 0.35), 2.6);
      h.scale.setScalar(Math.max(0.001, s));
      h.rotation.y = (1 - s) * Math.PI;
    });
  }

  settle() { this.pose(this.duration); }

  /** Blushes pink, hops, and lets a little heart float up. */
  react(letter) {
    const k = this.reduced ? 0.4 : 1;
    letter.feel.pos.y.kick(1.8 * k);
    letter.feel.squash.kick(-2 * k);
    this.play(letter, 1.0, (p) => { letter.body.material.emissiveIntensity = 0.45 * Math.sin(Math.PI * p); });
    const h = new THREE.Mesh(this.heartGeo, this.heartMat.clone());
    h.material.transparent = true;
    const start = new THREE.Vector3();
    letter.inner.getWorldPosition(start);
    start.y += letter.size.y + 0.2;
    this.add(h);
    const side = Math.random() > 0.5 ? 1 : -1;
    this.animate(1.4, (u) => {
      h.position.set(start.x + Math.sin(u * 7) * 0.15 * side, start.y + u * 1.4, start.z);
      h.scale.setScalar(ease.outBack(Math.min(1, u * 4)) * (1 + u * 0.4));
      h.material.opacity = 1 - ease.inQuad(u);
      if (u >= 1) { this.group.remove(h); h.material.dispose(); }
    });
    this.ctx.sound.play('pop', { pitch: 1.5 });
  }
}
