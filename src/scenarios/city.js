// A toy city. Most letters are built floor by floor like little towers; a
// tower crane lowers the "A" on its cable — it spins round twice before it
// can be set down. A toy car pulls up at the kerb and honks. Poke a letter
// and its windows light up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three';
import { Scene, squash, landing } from './base.js';
import { ease, span, wobble, lerp, rng, TAU, clamp } from '../motion.js';

const FACADES = [0xc8644b, 0xe9dcc0, 0x5f7d95, 0xd9a441, 0x8cc3a8, 0xc8644b, 0xe9dcc0, 0x5f7d95];
const FLOORS = 5;

function windowTextures() {
  const make = (bg, win) => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = win;
    g.fillRect(11, 11, 10, 11);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 5);
    t.anisotropy = 4;
    return t;
  };
  const map = make('#ffffff', '#a9b6c2');
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, glow: make('#000000', '#ffffff') };
}

export class City extends Scene {
  static id = 'city';
  static tracking = 0.12;
  title = 'Toy city';
  look = {
    background: 0xc3e4f5, floor: 0xd9d4c8, sky: 0xffffff, ground: 0x9a9488, hemi: 1.05,
    key: 0xfff1dc, keyIntensity: 2.6, keyDir: [-0.6, 1, 0.5], fill: 0xdcecff, fillIntensity: 0.5, rimIntensity: 0.8,
    env: 0.45, shadow: 0x3a3530,
  };
  letterStyle = { depth: 0.34, bevel: 0.02, bevelSpread: 1, bevelSegments: 1 };

  material(ch, i) {
    this.tex ??= windowTextures();
    this.track(this.tex.map); this.track(this.tex.glow);
    return new THREE.MeshStandardMaterial({ color: FACADES[i], map: this.tex.map, emissive: 0xffd27a, emissiveMap: this.tex.glow, emissiveIntensity: 0, roughness: 0.75 });
  }

  build() {
    const L = this.letters;
    const r = rng(8);
    const box = this.layout.box;
    const backZ = Math.min(...this.layout.rows.map((row) => row.z));
    const frontZ = Math.max(...this.layout.rows.map((row) => row.z));
    const mat = (color, o = {}) => this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }));
    const geo = (g) => this.track(g);

    // Road and kerb in front of the name.
    this.roadZ = frontZ + 1.25;
    const road = new THREE.Mesh(geo(new THREE.PlaneGeometry(60, 1.0)), mat(0x55585e, { roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.004, this.roadZ);
    road.receiveShadow = true;
    const kerb = new THREE.Mesh(geo(new THREE.BoxGeometry(60, 0.05, 0.08)), mat(0xf0ece2));
    kerb.position.set(0, 0.025, this.roadZ - 0.54);
    this.add(road, kerb);
    const dash = geo(new THREE.PlaneGeometry(0.34, 0.05));
    const paint = mat(0xffffff, { roughness: 0.6 });
    for (let x = -24; x < 24; x += 0.7) {
      const d = new THREE.Mesh(dash, paint);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.006, this.roadZ);
      this.add(d);
    }

    // Skyline of little blocks behind, with the same windows.
    for (let k = 0; k < 13; k++) {
      const w = 0.8 + r() * 1.2, h = 0.9 + r() * 1.7, d = 0.8 + r() * 0.6;
      const m = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), this.track(new THREE.MeshStandardMaterial({ color: FACADES[k % 5], map: this.tex.map, roughness: 0.8 })));
      m.position.set(lerp(box.min.x - 4, box.max.x + 4, k / 12) + (r() - 0.5) * 0.6, h / 2, backZ - 5 - r() * 3.5);
      m.castShadow = m.receiveShadow = true;
      this.add(m);
    }
    // Round street trees along the kerb, clear of the letters.
    const crown = geo(new THREE.SphereGeometry(0.3, 14, 10));
    const stick = geo(new THREE.CylinderGeometry(0.035, 0.045, 0.45, 6));
    for (const x of [box.min.x - 1.2, box.min.x - 2.4, box.max.x + 2.4, box.max.x + 3.6]) {
      const t = new THREE.Group();
      const s = new THREE.Mesh(stick, mat(0x6b4a2f));
      s.position.y = 0.22;
      const c = new THREE.Mesh(crown, mat(0x6fae55));
      c.position.y = 0.6;
      t.add(s, c);
      t.traverse((o) => { o.castShadow = true; });
      t.position.set(x, 0, this.roadZ - 0.85);
      this.add(t);
    }

    // The crane.
    this.craneLetter = L.findIndex((l) => l.char === 'A');
    const A = L[this.craneLetter];
    const yellow = mat(0xf2b632, { roughness: 0.5 });
    const steel = mat(0x3a3d44, { roughness: 0.4, metalness: 0.5 });
    const top = 3.15;
    const mastX = box.max.x + 1.1, mastZ = backZ - 1.4;
    const mast = new THREE.Mesh(geo(new THREE.BoxGeometry(0.2, top, 0.2)), yellow);
    mast.position.set(mastX, top / 2, mastZ);
    const jibLen = mastX - (box.min.x - 0.6);
    const jib = new THREE.Mesh(geo(new THREE.BoxGeometry(jibLen + 1.4, 0.14, 0.16)), yellow);
    jib.position.set(mastX - jibLen / 2 + 0.7, top + 0.05, mastZ);
    const weight = new THREE.Mesh(geo(new THREE.BoxGeometry(0.4, 0.3, 0.3)), steel);
    weight.position.set(mastX + 1.15, top - 0.12, mastZ);
    const cab = new THREE.Mesh(geo(new THREE.BoxGeometry(0.3, 0.26, 0.3)), mat(0xf4f0e6));
    cab.position.set(mastX - 0.25, top - 0.15, mastZ + 0.05);
    for (const m of [mast, jib, weight, cab]) { m.castShadow = true; this.add(m); }
    this.trolley = new THREE.Mesh(geo(new THREE.BoxGeometry(0.22, 0.1, 0.24)), steel);
    this.cable = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.012, 0.012, 1, 6)), steel);
    this.hook = new THREE.Mesh(geo(new THREE.BoxGeometry(0.1, 0.1, 0.1)), steel);
    this.add(this.trolley, this.cable, this.hook);
    this.crane = { top, mastX, mastZ, ax: A.slot.x, az: A.slot.z };

    // The car.
    this.car = new THREE.Group();
    const body = new THREE.Mesh(geo(new RoundedBoxGeometry(0.72, 0.2, 0.38, 3, 0.07)), mat(0xd94a3a, { roughness: 0.35 }));
    body.position.y = 0.17;
    const cabin = new THREE.Mesh(geo(new RoundedBoxGeometry(0.4, 0.17, 0.34, 3, 0.06)), mat(0xbfe3f2, { roughness: 0.1, metalness: 0.2 }));
    cabin.position.set(-0.04, 0.33, 0);
    this.lights = mat(0xfff3c4, { emissive: 0xffe08a, emissiveIntensity: 0 });
    this.car.add(body, cabin);
    for (const z of [-0.12, 0.12]) {
      const lamp = new THREE.Mesh(geo(new THREE.BoxGeometry(0.03, 0.05, 0.07)), this.lights);
      lamp.position.set(0.36, 0.18, z);
      this.car.add(lamp);
    }
    const tyre = geo(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14));
    this.wheels = [];
    for (const x of [-0.22, 0.22]) for (const z of [-0.19, 0.19]) {
      const w = new THREE.Mesh(tyre, steel);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.075, z);
      this.car.add(w);
      this.wheels.push(w);
    }
    this.car.traverse((o) => { o.castShadow = true; });
    this.carBody = [body, cabin];
    this.add(this.car);
    this.addBlob(body, { strength: 0.9 });
    this.parkX = box.max.x - 0.35;

    // Timing.
    const others = L.map((_, i) => i).filter((i) => i !== this.craneLetter);
    this.rise = L.map(() => 0);
    others.forEach((i, k) => { this.rise[i] = 0.25 + k * 0.17 + r() * 0.06; });
    this.lowerFrom = 1.0;
    this.setDown = 3.0;
    this.carFrom = 3.15;
    this.carAt = 4.05;
    this.duration = 5.0;
    others.forEach((i) => this.sfx(this.rise[i] + 0.55, 'tok', { pitch: 1 + i * 0.04, gain: 0.6 }));
    this.sfx(0.4, 'whir', { pitch: 0.6 });
    this.sfx(this.setDown, 'thud');
    this.sfx(this.carFrom, 'whir', { pitch: 1.4 });
    this.sfx(this.carAt + 0.25, 'honk');
    this.sfx(this.carAt + 0.45, 'honk');
    this.pokeables = [{ object: this.car, onPoke: () => this.honk() }];
    this.car.userData.pokeable = this.pokeables[0];
  }

  pose(t) {
    const L = this.letters;
    // Built floor by floor: each storey pops on with a small bounce.
    L.forEach((l, i) => {
      if (i === this.craneLetter) return;
      const u = clamp((t - this.rise[i]) / 0.6);
      const step = Math.min(FLOORS - 1, Math.floor(u * FLOORS));
      const frac = clamp((u * FLOORS - step) * 1.8);
      const sy = u >= 1 ? 1 : (step + ease.outBack(frac, 2)) / FLOORS;
      l.root.position.copy(l.rest.position);
      l.root.visible = t > this.rise[i];
      l.body.scale.set(1, Math.max(0.001, sy), 1);
      if (u >= 1) squash(l.body, landing(t - this.rise[i] - 0.6, 0.12));
    });

    // The crane: trolley runs out, lowers the A (which spins), then winds up.
    const c = this.crane;
    const out = ease.inOutCubic(span(t, 0.3, 0.7)) * (1 - ease.inOutCubic(span(t, this.setDown + 0.7, 0.8)));
    const tx = lerp(c.mastX - 0.6, c.ax, out);
    const tz = lerp(c.mastZ, c.az, out);
    const A = L[this.craneLetter];
    const lower = ease.inOutSine(span(t, this.lowerFrom, this.setDown - this.lowerFrom));
    const hookY = t < this.setDown ? lerp(c.top - 0.7, A.size.y + 0.08, lower) : lerp(A.size.y + 0.08, c.top - 0.5, ease.inOutCubic(span(t, this.setDown + 0.15, 0.6)));
    this.trolley.position.set(tx, c.top - 0.05, tz);
    this.hook.position.set(tx, hookY, tz);
    const len = c.top - 0.1 - hookY;
    this.cable.scale.y = Math.max(0.01, len);
    this.cable.position.set(tx, hookY + len / 2, tz);
    if (t < this.setDown) {
      const swing = 0.16 * Math.sin(t * 4.2) * (1 - lower * 0.7);
      A.root.position.set(tx + Math.sin(swing) * 0.3, hookY - A.size.y - 0.05, tz);
      A.root.rotation.set(0, (1 - ease.inOutSine(span(t, this.lowerFrom, this.setDown - this.lowerFrom - 0.2))) * TAU * 2, swing);
      squash(A.body, 1);
    } else {
      A.root.position.copy(A.rest.position);
      A.root.rotation.set(0, 0, 0.05 * wobble(t - this.setDown, 2, 5));
      squash(A.body, landing(t - this.setDown, 0.2));
    }

    // The car pulls in and parks at the kerb.
    const cu = ease.outCubic(span(t, this.carFrom, this.carAt - this.carFrom));
    const x = lerp(this.layout.box.min.x - 7, this.parkX, cu);
    this.car.position.set(x, 0, this.roadZ + 0.18);
    this.car.rotation.y = 0;
    for (const w of this.wheels) w.rotation.y = -x / 0.075;
    const brake = Math.sin(Math.PI * span(t, this.carAt - 0.15, 0.4));
    for (const b of this.carBody) b.rotation.z = -0.06 * brake;
    this.lights.emissiveIntensity = Math.max(Math.sin(Math.PI * span(t, this.carAt + 0.2, 0.2)), Math.sin(Math.PI * span(t, this.carAt + 0.4, 0.2))) * 2;
  }

  settle() {
    this.pose(this.duration);
    for (const l of this.letters) l.body.scale.set(1, 1, 1);
  }

  /** Lights come on in the windows, then fade back to daytime. */
  react(letter) {
    const k = this.reduced ? 0.4 : 1;
    letter.feel.pos.y.kick(1.4 * k);
    letter.feel.squash.kick(-1.5 * k);
    this.play(letter, 1.6, (p) => { letter.body.material.emissiveIntensity = 1.6 * Math.min(1, p * 8) * (1 - ease.inQuad(p)); });
    this.ctx.sound.play('click', { pitch: 0.8 });
  }

  honk() {
    const c = this.car;
    this.animate(0.6, (u) => {
      c.position.y = Math.sin(Math.PI * span(u, 0, 0.4)) * 0.08;
      this.lights.emissiveIntensity = Math.sin(Math.PI * u) * 2;
    });
    this.ctx.sound.play('honk');
    this.ctx.sound.play('honk', { delay: 0.18 });
  }
}
