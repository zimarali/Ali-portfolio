// Sea-glass letters bob out at sea; a wave rolls in, carries them up a
// little sandy shore and sets them down as the water slides back. The
// backwash drags the "A" out again, so a second, smaller wave returns it —
// and leaves a starfish behind for good measure.
import * as THREE from 'three';
import { Scene } from './base.js';
import { sandTexture } from '../textures.js';
import { ease, span, wobble, lerp, clamp, rng, smoothstep, TAU } from '../motion.js';

const COLORS = [0xf08a6c, 0x2d7f86, 0xf6d28b, 0xe9a3b8, 0xf08a6c, 0xf7efe3, 0x2d7f86, 0xf6d28b];
const WATER = new THREE.Color(0x4fb3b0);
const DEEP = new THREE.Color(0x2f8c97);
const FOAM = new THREE.Color(0xf4fbf8);
const DEPTH = 26;

function starShape(points = 5, outer = 0.26, inner = 0.11) {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * TAU + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (!i) s.moveTo(x, y);
    else {
      const pa = ((i - 0.5) / (points * 2)) * TAU + Math.PI / 2;
      const pr = (i % 2 ? outer : inner) * 0.78 + (i % 2 ? inner : outer) * 0.22;
      s.quadraticCurveTo(Math.cos(pa) * pr * 1.05, Math.sin(pa) * pr * 1.05, x, y);
    }
  }
  return s;
}

export class Shore extends Scene {
  static id = 'shore';
  static tracking = 0.1;
  title = 'Little shore';
  idleEvery = 12;
  look = {
    background: 0xd3ebec, floor: 0xffffff, sky: 0xf2fbff, ground: 0xd8bf94, hemi: 1.1,
    key: 0xfff1d9, keyIntensity: 2.5, keyDir: [-0.4, 1, 0.7], fill: 0xc8ecff, fillIntensity: 0.6, rimIntensity: 1.1,
    env: 0.7, shadow: 0x6b4f2a,
  };
  letterStyle = { depth: 0.24, bevel: 0.07, bevelSpread: 0.75, bevelSegments: 5 };
  framing = { elevation: 17 };

  material(ch, i) {
    return new THREE.MeshPhysicalMaterial({ color: COLORS[i], roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) });
  }

  init() {
    this.look.floorMap = this.track(sandTexture('#ecdcbf'));
    super.init();
  }

  build() {
    const L = this.letters;
    const rows = this.layout.rows;
    this.backZ = Math.min(...rows.map((r) => r.z));
    this.frontZ = Math.max(...rows.map((r) => r.z));
    this.restEdge = this.backZ - 2.1;
    this.gagIndex = this.layout.mode === 'single' ? 5 : 5; // the "A"

    // Water: a grid we reshape on the CPU — cheap at this size.
    const geo = this.track(new THREE.PlaneGeometry(44, DEPTH, 88, 52));
    geo.rotateX(-Math.PI / 2);
    this.waterBase = Float32Array.from(geo.attributes.position.array);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.water = new THREE.Mesh(geo, this.track(new THREE.MeshPhysicalMaterial({
      vertexColors: true, transparent: true, opacity: 0.86, roughness: 0.12, metalness: 0, clearcoat: 0.6, depthWrite: false,
    })));
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
    this.add(this.water);

    // Damp sand the wave leaves behind.
    this.wet = new THREE.Mesh(this.track(new THREE.PlaneGeometry(44, DEPTH)), this.track(new THREE.MeshBasicMaterial({ color: 0x8a6a3e, transparent: true, opacity: 0, depthWrite: false })));
    this.wet.rotation.x = -Math.PI / 2;
    this.wet.position.set(0, 0.003, this.frontZ + 0.9 - DEPTH / 2);
    this.add(this.wet);

    // Sculpted dunes either side.
    const sandMat = this.track(new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.look.floorMap, roughness: 1 }));
    const r = rng(4);
    const box = this.layout.box;
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const dune = new THREE.Mesh(this.track(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2)), sandMat);
      dune.scale.set(1.1 + r() * 0.9, 0.32 + r() * 0.22, 0.8 + r() * 0.4);
      dune.position.set(side * (box.max.x + 1.3 + k * 1.5 + r() * 0.6), -0.04, this.frontZ - 0.4 - k * 1.6);
      dune.castShadow = true;
      dune.receiveShadow = true;
      this.add(dune);
    }

    // Starfish, delivered by the second wave.
    const starGeo = this.track(new THREE.ExtrudeGeometry(starShape(), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 4 }));
    starGeo.rotateX(-Math.PI / 2);
    this.star = new THREE.Mesh(starGeo, this.track(new THREE.MeshStandardMaterial({ color: 0xf07c4a, roughness: 0.75 })));
    this.star.castShadow = true;
    const gs = L[this.gagIndex].slot;
    this.starHome = new THREE.Vector3(gs.x + 0.75, 0.04, gs.z + 0.75);
    this.add(this.star);
    this.addBlob(this.star, { strength: 0.7 });
    this.pokeables = [{ object: this.star, onPoke: () => this.wiggleStar() }];
    this.star.userData.pokeable = this.pokeables[0];

    // Each letter: where it bobs at sea and when the wave sets it down.
    this.plan = L.map((l, i) => ({
      seaZ: this.backZ - 3.4 - r() * 1.2,
      drift: (r() - 0.5) * 0.8,
      tilt: -0.5 - r() * 0.4,
      roll: (r() - 0.5) * 0.9,
      land: 1.35 + (l.slot.z - this.backZ) * 0.12 + r() * 0.2,
      phase: r() * TAU,
    }));

    this.sfx(0.15, 'swish', { pitch: 0.8 });
    this.sfx(2.0, 'swish', { pitch: 0.6, gain: 0.6 });
    this.sfx(3.25, 'swish', { pitch: 1.1, gain: 0.5 });
    this.plan.forEach((p, i) => this.sfx(p.land, 'tok', { pitch: 0.7 + i * 0.04, gain: 0.4 }));
    this.sfx(4.0, 'pop', { pitch: 0.9 });
    this.duration = 5.2;
    this.lap = 0;
  }

  frameBox() {
    const b = this.layout.box.clone();
    b.min.z -= 1.4; // keep a strip of sea in view
    return b;
  }

  /** Where the water's leading edge is at time t. */
  edge(t) {
    const far = this.backZ - 4.8;
    const reach = this.frontZ + 0.95;
    const back = this.backZ - 1.8;
    const second = this.frontZ - 0.05;
    if (t < 1.55) return lerp(far, reach, ease.outCubic(span(t, 0.05, 1.5)));
    if (t < 3.0) return lerp(reach, back, ease.inOutSine(span(t, 1.55, 1.45)));
    if (t < 3.85) return lerp(back, second, ease.outCubic(span(t, 3.0, 0.85)));
    return lerp(second, this.restEdge, ease.inOutSine(span(t, 3.85, 1.3)));
  }

  /** Crest height: tall while surging, flat when sliding back. */
  crest(t) {
    return 0.42 * Math.sin(Math.PI * span(t, 0, 1.6)) + 0.2 * Math.sin(Math.PI * span(t, 3.0, 0.9));
  }

  updateWater(t, e, crest) {
    const pos = this.water.geometry.attributes.position;
    const col = this.water.geometry.attributes.color;
    const base = this.waterBase;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const u = 0.5 - base[i * 3 + 2] / DEPTH; // 0 front edge … 1 far back
      const d = u * DEPTH; // distance behind the edge
      const lip = 0.16 * Math.sin(0.9 * x + 1.3 * t) + 0.08 * Math.sin(2.1 * x - t);
      pos.array[i * 3] = x;
      pos.array[i * 3 + 2] = e + lip - d;
      const swell = crest * Math.exp(-(((d - 0.5) / 0.55) ** 2));
      const ripple = 0.015 * Math.sin(x * 1.7 + d * 2.3 + t * 2);
      pos.array[i * 3 + 1] = 0.03 + swell * smoothstep(0, 0.35, d) + ripple * smoothstep(0, 1, d) - (d < 0.08 ? 0.03 : 0);
      c.copy(FOAM).lerp(WATER, smoothstep(0.02, 0.5 + crest, d)).lerp(DEEP, smoothstep(3, 12, d));
      col.array.set([c.r, c.g, c.b], i * 3);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }

  pose(t) {
    const e = this.edge(t);
    this.updateWater(t, e, this.crest(t));
    // Damp sand fades from dark to a soft tide line.
    const wetness = clamp(span(t, 0.6, 0.6)) * (1 - 0.75 * span(t, 2.4, 2.8));
    this.wet.material.opacity = 0.22 * wetness;

    const g = this.gagIndex;
    this.letters.forEach((l, i) => {
      const p = this.plan[i];
      const s = l.slot;
      // Bobbing at sea → carried on the crest → set down on the sand.
      const ride = ease.inOutCubic(span(t, 0.25, p.land - 0.25));
      const bob = (1 - ride) * 0.07 * Math.sin(t * 3.2 + p.phase);
      const lift = Math.sin(Math.PI * ride) * 0.32;
      let z = lerp(p.seaZ, s.z, ride);
      let x = s.x + p.drift * (1 - ride);
      let y = lerp(-0.32, 0, ease.outQuad(ride)) + bob + lift;
      let rx = lerp(p.tilt, 0, ease.outBack(ride, 1.6));
      let rz = p.roll * (1 - ride);
      const since = t - p.land;
      rz += 0.1 * wobble(since * 0.8, 1.4, 3.5) * (i % 2 ? 1 : -1);
      rx += 0.06 * wobble(since * 0.8, 1.2, 3.5);

      if (i === g && t > 2.05) {
        // Backwash tugs the A out to sea… and the next wave brings it home.
        const out = ease.inOutSine(span(t, 2.05, 0.9)) * (1 - ease.outCubic(span(t, 3.15, 0.65)));
        z = s.z - out * 0.95;
        y = -0.12 * out + Math.sin(Math.PI * span(t, 3.15, 0.65)) * 0.22;
        rx = -0.45 * out;
        rz = 0.25 * out + 0.16 * wobble(t - 3.8, 1.8, 4);
        x = s.x + 0.12 * out;
      }
      l.root.position.set(x, y, z);
      l.root.rotation.set(rx, 0, rz);
    });

    // The starfish surfs in on wave two and stays.
    const su = span(t, 3.05, 0.8);
    this.star.visible = t > 2.95;
    this.star.position.set(this.starHome.x + 0.3 * (1 - su), lerp(-0.1, this.starHome.y, ease.outQuad(su)) + Math.sin(Math.PI * su) * 0.18, lerp(this.backZ - 1.6, this.starHome.z, ease.outCubic(su)));
    this.star.rotation.y = 0.6 + su * 1.4;
    this.star.rotation.z = 0.25 * wobble(t - 3.85, 2, 4);
  }

  settle() {
    this.pose(this.duration);
    this.wet.material.opacity = 0.055;
  }

  /** Sea-glass rocks like a buoy and sends a ripple across the sand. */
  react(letter) {
    const k = this.reduced ? 0.35 : 1;
    letter.feel.rot.kick(0.9 * k, 0, (Math.random() > 0.5 ? 1 : -1) * 2.6 * k);
    letter.feel.pos.y.kick(0.6 * k);
    const ring = new THREE.Mesh(this.ringGeo ??= this.track(new THREE.RingGeometry(0.42, 0.5, 40)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(letter.slot.x, 0.01, letter.slot.z);
    this.add(ring);
    this.animate(1.1, (u) => {
      ring.scale.setScalar(1 + ease.outCubic(u) * 1.6);
      ring.material.opacity = 0.55 * (1 - u);
      if (u >= 1) { this.group.remove(ring); ring.material.dispose(); }
    });
    this.ctx.sound.play('pop', { pitch: 0.55 + Math.random() * 0.2 });
  }

  wiggleStar() {
    const s = this.star;
    const r0 = s.rotation.y;
    this.animate(0.9, (u) => {
      s.position.y = this.starHome.y + Math.sin(Math.PI * span(u, 0, 0.4)) * 0.25;
      s.rotation.y = r0 + ease.outBack(u) * 1.26;
      s.rotation.z = 0.2 * wobble(u, 3, 4);
    });
    this.ctx.sound.play('boing', { pitch: 1.6 });
  }

  /** Every so often, one small lap of water — then calm again. */
  idle() {
    this.ctx.sound.play('swish', { pitch: 1.3, gain: 0.25 });
    this.animate(2.6, (u) => {
      const e = this.restEdge + Math.sin(Math.PI * u) * 0.45;
      this.updateWater(this.duration + u * 2.6, e, 0.05 * Math.sin(Math.PI * u));
    });
  }
}
