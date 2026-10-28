// Pointer, touch and keyboard play.
//
// Every letter is in one of four modes:
//   home      – in its place: hover lean, pokes, and a rubber-band tug
//   held      – pulled loose (or picked up) and carried under the pointer
//   free      – thrown or dropped: real tumbling, bouncing, sliding physics
//   returning – flying back home (snapped by hand, or called back)
// While a letter is away a faint ghost marks its place; tap the ghost (or
// press the letter's key) to call it home. Carry a letter near its ghost
// and it is pulled in like a magnet, landing with a satisfying thunk.
import * as THREE from 'three';
import { Spring, Spring3, clamp, ease, lerp, smoothstep } from './motion.js';
import { Body, bump } from './physics.js';

const TAP_PX = 8;
const TAP_MS = 450;
const DRAG_LIMIT = 1.5;
const DETACH = 1.2; // how far a tug goes before the letter pops loose
const THROW = 2.4; // release speed (units/s) that counts as a throw
const MAX_THROW = 15;
const MAGNET = 0.95;
const FAR = 40;
const GHOST = 0.16;

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Interaction state lives on the letter: springs for home, a body for flight. */
export function attachFeel(letter) {
  letter.feel = {
    mode: 'home',
    pos: new Spring3(130, 13),
    rot: new Spring3(150, 10),
    squash: new Spring(1, 260, 11),
    hover: 0,
    dragging: false,
    tracks: [],
    body: new Body(letter.size),
    com: new THREE.Vector3(0, letter.size.y / 2, 0),
    ghost: 0,
    gone: false,
  };
  return letter.feel;
}

/** Plays a short timed effect on a letter (or any object). fn(progress, t). */
export function play(letter, duration, fn) {
  letter.feel.tracks.push({ t: 0, duration, fn });
}

export class Interaction {
  constructor(stage, { reducedMotion, sound }) {
    this.stage = stage;
    this.reducedMotion = reducedMotion;
    this.sound = sound;
    this.letters = [];
    this.pokeables = [];
    this.onPoke = null;
    this.groundAt = () => 0;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(-9, -9);
    this.pointerInside = false;
    this.parallax = new Spring3(40, 11);
    this.drag = null;
    this.down = null;
    this.cursor = '';
    this.keyCursor = {};
    this.bind();
  }

  setLetters(letters) {
    this.letters = letters;
    this.drag = null;
    for (const l of letters) if (!l.feel) attachFeel(l);
  }

  bind() {
    const el = this.stage.canvas;
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerdown', (e) => this.press(e));
    el.addEventListener('pointerup', (e) => this.release(e));
    el.addEventListener('pointercancel', (e) => this.release(e, true));
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.pointerInside = false; this.parallax.setTarget(0, 0, 0); this.stage.wake(); } });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  toNdc(e) {
    const r = this.stage.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return this.ndc;
  }

  pick() {
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const targets = [];
    for (const l of this.letters) {
      const m = l.feel.mode;
      if (!l.feel.gone && m !== 'returning') targets.push(l.hit);
      if (m !== 'home') targets.push(l.ghostHit);
    }
    for (const p of this.pokeables) targets.push(p.object);
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.letter && !o.userData.ghostOf && !o.userData.pokeable) o = o.parent;
    return o ? { letter: o.userData.letter, ghostOf: o.userData.ghostOf, pokeable: o.userData.pokeable, point: hit.point } : null;
  }

  move(e) {
    this.toNdc(e);
    this.pointerInside = true;
    if (!this.reducedMotion && (e.pointerType === 'mouse' || this.down)) this.parallax.setTarget(this.ndc.x, this.ndc.y, 0);
    if (this.drag && e.pointerId === this.drag.id) this.dragTo();
    else if (this.down && e.pointerId === this.down.id && this.down.letter) {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > TAP_PX) this.beginDrag(this.down.letter, e);
    }
    if (!this.drag && e.pointerType === 'mouse') {
      const hit = this.pick();
      this.setCursor(hit?.letter ? 'grab' : hit ? 'pointer' : '');
    }
    this.stage.wake();
  }

  press(e) {
    this.toNdc(e);
    const hit = this.pick();
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now(), ...hit };
    if (hit?.letter) try { this.stage.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    if (!this.reducedMotion && e.pointerType !== 'mouse') this.parallax.setTarget(this.ndc.x * 0.6, this.ndc.y * 0.6, 0);
    this.stage.wake();
  }

  release(e, cancelled = false) {
    const down = this.down;
    this.down = null;
    if (e.pointerType !== 'mouse') this.parallax.setTarget(0, 0, 0);
    if (this.drag && this.drag.id === e.pointerId) {
      this.endDrag(cancelled);
    } else if (!cancelled && down && down.id === e.pointerId) {
      const quick = performance.now() - down.time < TAP_MS && Math.hypot(e.clientX - down.x, e.clientY - down.y) < TAP_PX;
      if (quick && down.letter) this.poke(down.letter, down.point);
      else if (quick && down.ghostOf) this.callHome(down.ghostOf);
      else if (quick && down.pokeable) down.pokeable.onPoke(down.point);
    }
    this.stage.wake();
  }

  /** A tap: home letters do their scene's reaction; loose ones get a hop. */
  poke(letter, point) {
    const f = letter.feel;
    if (f.mode === 'home') { this.onPoke?.(letter, point); return; }
    if (f.mode !== 'free') return;
    const b = f.body;
    b.wake();
    b.v.y += 5.5;
    b.v.x += (Math.random() - 0.5) * 1.5;
    b.w.add(_v.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8));
    this.sound?.play('pop', { pitch: 1.3 });
  }

  // ---- Dragging --------------------------------------------------------

  dragPlane(through) {
    const normal = this.stage.camera.getWorldDirection(new THREE.Vector3()).negate();
    normal.y = Math.max(0, normal.y * 0.5); // mostly upright: sideways and up
    normal.normalize();
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, through);
  }

  pointerOn(plane) {
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, p) ? p : null;
  }

  beginDrag(letter, e) {
    const f = letter.feel;
    if (f.mode === 'returning' || f.gone) return;
    const anchor = this.down?.point?.clone() ?? this.centre(letter);
    const plane = this.dragPlane(anchor);
    const start = this.pointerOn(plane);
    if (!start) return;
    this.drag = { id: e.pointerId, letter, plane, start, samples: [{ p: start.clone(), t: performance.now() }] };
    if (f.mode === 'free') {
      this.pickUp(letter, start);
    } else {
      f.dragging = true;
      f.pos.tune(260, 22);
      f.squash.target = 1.04;
    }
    this.setCursor('grabbing');
  }

  dragTo() {
    const d = this.drag;
    const p = this.pointerOn(d.plane);
    if (!p) return;
    const now = performance.now();
    d.samples.push({ p: p.clone(), t: now });
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
    const l = d.letter;
    const f = l.feel;
    if (f.mode === 'held') { d.target = p; return; }

    // Still at home: a rubber-band tug, until it pops loose.
    const off = p.clone().sub(d.start);
    const len = off.length();
    if (len > DETACH) {
      this.loosen(l);
      this.pickUp(l, p);
      this.drag.target = p;
      f.squash.kick(-3);
      this.sound?.play('pop', { pitch: 1.15, gain: 0.8 });
      return;
    }
    if (len > 1e-5) off.multiplyScalar((DRAG_LIMIT * Math.tanh(len / DRAG_LIMIT)) / len);
    off.y = Math.max(off.y, -0.02);
    const local = off.applyQuaternion(_qi.copy(l.rest.quaternion).invert());
    f.pos.setTarget(local.x, local.y, local.z);
    const vx = this.velocity().x;
    f.rot.setTarget(0, 0, clamp(-vx * 0.06, -0.35, 0.35) - local.x * 0.1);
  }

  /** Pointer velocity over the last ~100 ms, in world units per second. */
  velocity() {
    const s = this.drag?.samples;
    if (!s || s.length < 2) return new THREE.Vector3();
    const a = s[0], b = s.at(-1);
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    return b.p.clone().sub(a.p).divideScalar(dt);
  }

  endDrag(cancelled) {
    const { letter } = this.drag;
    const f = letter.feel;
    const v = cancelled ? new THREE.Vector3() : this.velocity();
    if (v.length() > MAX_THROW) v.setLength(MAX_THROW);
    const speed = v.length();
    this.drag = null;
    this.setCursor('');

    if (f.mode === 'home') {
      f.dragging = false;
      if (speed > THROW * 1.4) { this.loosen(letter); this.toss(letter, v); return; }
      // Let go gently: swing back into place.
      f.pos.tune(95, 8.5);
      f.pos.setTarget(0, 0, 0);
      f.rot.setTarget(0, 0, 0);
      f.rot.kick(0, 0, -f.pos.x.value * 1.4);
      f.squash.target = 1;
      f.squash.kick(-1.2);
      setTimeout(() => { if (!f.dragging && f.mode === 'home') f.pos.tune(130, 13); }, 1200);
      return;
    }
    // Held: thrown, snapped home, or simply dropped.
    if (speed > THROW) this.toss(letter, v);
    else if (f.body.c.distanceTo(this.homeCentre(letter)) < MAGNET) this.returnHome(letter, { snap: true });
    else { f.mode = 'free'; f.body.v.copy(v); f.body.wake(); }
  }

  // ---- Mode changes ----------------------------------------------------

  centre(letter) { return letter.inner.localToWorld(letter.feel.com.clone()); }

  homeCentre(letter) {
    return letter.feel.com.clone().applyQuaternion(letter.rest.quaternion).add(letter.rest.position);
  }

  /** Converts a letter at home into a physical body at its current pose. */
  loosen(letter) {
    const f = letter.feel;
    letter.inner.updateWorldMatrix(true, false);
    const b = f.body;
    b.c.copy(this.centre(letter));
    letter.inner.getWorldQuaternion(b.q);
    b.v.set(0, 0, 0);
    b.w.set(0, 0, 0);
    b.wake();
    f.dragging = false;
    f.tracks = [];
    f.pos.x.snap(0); f.pos.y.snap(0); f.pos.z.snap(0);
    f.rot.x.snap(0); f.rot.y.snap(0); f.rot.z.snap(0);
    f.pos.tune(130, 13);
    f.mode = 'free';
    f.gone = false;
    letter.toRest();
    letter.inner.visible = true;
  }

  pickUp(letter, grabPoint) {
    const f = letter.feel;
    f.mode = 'held';
    f.gone = false;
    letter.inner.visible = true;
    // Carry it in the name's own plane, so lining it up with its ghost is easy.
    const d = this.drag;
    d.plane = this.dragPlane(this.homeCentre(letter));
    const p = this.pointerOn(d.plane) ?? grabPoint;
    d.samples = [{ p: p.clone(), t: performance.now() }];
    d.grab = new THREE.Vector3(0, -0.15, 0);
    d.target = p;
    f.body.v.set(0, 0, 0);
    f.body.w.set(0, 0, 0);
    f.squash.kick(-2);
  }

  toss(letter, v) {
    const f = letter.feel;
    const b = f.body;
    f.mode = 'free';
    b.v.copy(v);
    b.v.z -= Math.max(0, v.y) * 0.35; // flung upward = flung into the scene
    b.w.set(v.z, 0, -v.x).multiplyScalar(0.9).add(_v.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3));
    b.wake();
    this.sound?.play('swish', { pitch: 1.8, gain: 0.25 + Math.min(0.4, v.length() / 30) });
  }

  /** Flies a letter back to its place. snap = short magnetic pull. */
  returnHome(letter, { snap = false } = {}) {
    const f = letter.feel;
    if (f.mode === 'home' || f.mode === 'returning') return;
    if (this.drag?.letter === letter) this.drag = null;
    const from = f.body.c.clone();
    const dist = from.distanceTo(this.homeCentre(letter));
    f.ret = {
      t: 0,
      dur: snap ? 0.2 : clamp(0.45 + dist * 0.035, 0.45, 1.0),
      c0: from,
      q0: f.body.q.clone(),
      arc: snap ? 0 : Math.min(2.2, 0.6 + dist * 0.25),
      spin: snap ? 0 : (Math.random() > 0.5 ? 1 : -1),
    };
    f.mode = 'returning';
    f.gone = false;
    letter.inner.visible = true;
    if (!snap) this.sound?.play('swish', { pitch: 2.2, gain: 0.2 });
  }

  callHome(letter) { this.returnHome(letter); this.stage.wake(); }

  /** Lands at home: thunk, squash, and a little shiver through the neighbours. */
  arrive(letter, snap) {
    const f = letter.feel;
    f.mode = 'home';
    f.ret = null;
    letter.toRest();
    letter.inner.position.set(0, 0, 0);
    letter.inner.quaternion.identity();
    f.squash.kick(snap ? -3.6 : -4.4);
    f.pos.y.kick(snap ? 0 : 0.6);
    this.sound?.play('tok', { pitch: 0.75, gain: 1.1 });
    this.sound?.play('pop', { pitch: 1.6, gain: 0.5, delay: 0.03 });
    for (const n of this.letters) {
      if (n === letter || n.feel.mode !== 'home' || n.slot.row !== letter.slot.row) continue;
      const k = Math.abs(n.index - letter.index);
      if (k > 2) continue;
      const side = Math.sign(n.slot.x - letter.slot.x);
      setTimeout(() => { n.feel.rot.z.kick(-side * (k === 1 ? 1.4 : 0.6)); n.feel.squash.kick(-0.8 / k); this.stage.wake(); }, 40 * k);
    }
  }

  // ---- Keyboard --------------------------------------------------------

  key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('button, input, textarea')) return;
    if (e.key === 'Escape') {
      for (const l of this.letters) this.returnHome(l);
      this.stage.wake();
      return;
    }
    const ch = e.key.toLowerCase();
    const matches = this.letters.filter((l) => l.char.toLowerCase() === ch);
    if (!matches.length) return;
    // A letter that is away comes home first; otherwise poke them in turn.
    const away = matches.find((l) => l.feel.mode === 'free' || l.feel.mode === 'held');
    if (away) this.returnHome(away);
    else {
      const n = (this.keyCursor[ch] = ((this.keyCursor[ch] ?? -1) + 1) % matches.length);
      this.onPoke?.(matches[n], null);
    }
    this.stage.wake();
  }

  setCursor(c) {
    if (c !== this.cursor) this.stage.canvas.style.cursor = this.cursor = c;
  }

  // ---- Per-frame -------------------------------------------------------

  /** Writes a body's world pose into the letter's inner group. */
  writePose(letter) {
    const b = letter.feel.body;
    letter.toRest();
    _qi.copy(letter.rest.quaternion).invert();
    letter.inner.quaternion.copy(_qi).multiply(b.q);
    _v.copy(letter.feel.com).applyQuaternion(b.q);
    letter.inner.position.copy(b.c).sub(_v).sub(letter.rest.position).applyQuaternion(_qi);
  }

  updateHome(l, dt, hoverOn, r, radius) {
    const f = l.feel;
    let active = false;
    if (!f.dragging) {
      let inf = 0, dx = 0;
      if (hoverOn) {
        l.root.getWorldPosition(_v);
        _v.y += l.size.y * 0.5;
        _v.project(this.stage.camera);
        dx = ((_v.x - this.ndc.x) * r.width) / 2;
        const dy = ((_v.y - this.ndc.y) * r.height) / 2;
        inf = Math.exp(-((dx * dx + dy * dy) / (radius * radius)));
      }
      if (Math.abs(inf - f.hover) > 0.002) active = true;
      f.hover = inf;
      f.pos.y.target = 0.07 * inf;
      f.rot.setTarget(-0.07 * inf, 0, clamp(dx / radius, -1, 1) * 0.09 * inf);
    }
    f.pos.step(dt);
    f.rot.step(dt);
    if (!f.pos.settled || !f.rot.settled || f.dragging) active = true;
    l.inner.position.set(f.pos.x.value, f.pos.y.value, f.pos.z.value);
    l.inner.rotation.set(f.rot.x.value, f.rot.y.value, f.rot.z.value);
    if (f.tracks.length) {
      active = true;
      for (const tr of f.tracks) { tr.t += dt; tr.fn(clamp(tr.t / tr.duration), tr.t); }
      f.tracks = f.tracks.filter((tr) => tr.t < tr.duration);
    }
    return active;
  }

  updateHeld(l, dt) {
    const f = l.feel;
    const b = f.body;
    const d = this.drag;
    const target = (d?.target ?? b.c).clone().add(d?.grab ?? _v.set(0, 0, 0));
    // Never carry it through the floor.
    target.y = Math.max(target.y, this.groundAt(target.x, target.z) + b.half.y + 0.04);
    // Near home: the ghost pulls it in like a magnet.
    const home = this.homeCentre(l);
    const near = 1 - smoothstep(0.2, MAGNET, target.distanceTo(home));
    target.lerp(home, near * 0.6);
    f.near = near;
    const prev = b.c.clone();
    b.c.lerp(target, 1 - Math.exp(-28 * dt));
    const vel = b.c.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
    b.v.lerp(vel, 0.5);
    // Hang upright with a little swing from the motion.
    _e.set(clamp(b.v.y * 0.02 - b.v.z * 0.04, -0.4, 0.4), 0, clamp(-b.v.x * 0.07, -0.55, 0.55));
    _q.setFromEuler(_e).premultiply(l.rest.quaternion);
    b.q.slerp(_q, 1 - Math.exp(-12 * dt));
    this.writePose(l);
    return true;
  }

  updateFree(l, dt) {
    const f = l.feel;
    const b = f.body;
    if (f.gone || b.asleep) return false;
    const moving = b.step(dt, this.groundAt, (speed) => {
      this.sound?.play('tok', { pitch: 0.6 + Math.random() * 0.3, gain: clamp(speed / 9, 0.15, 1) });
      if (speed > 4) f.squash.kick(-Math.min(4, speed * 0.5));
    });
    // Out of sight and out of reach: stop simulating; its ghost can call it back.
    if (b.c.y < -4 || Math.hypot(b.c.x, b.c.z) > FAR) { f.gone = true; b.asleep = true; l.inner.visible = false; }
    this.writePose(l);
    return moving;
  }

  updateReturning(l, dt) {
    const f = l.feel;
    const r = f.ret;
    const b = f.body;
    r.t += dt;
    const u = clamp(r.t / r.dur);
    const home = this.homeCentre(l);
    const e = r.arc ? ease.inOutCubic(u) : ease.outCubic(u);
    b.c.lerpVectors(r.c0, home, e);
    b.c.y += Math.sin(Math.PI * u) * r.arc;
    b.q.copy(r.q0).slerp(l.rest.quaternion, ease.outCubic(u));
    if (r.spin) b.q.multiply(_q.setFromAxisAngle(UP, r.spin * (1 - ease.outCubic(u)) * Math.PI * 2));
    this.writePose(l);
    if (u >= 1) this.arrive(l, !r.arc);
    return true;
  }

  /** Loose letters knock into each other and into letters still at home. */
  collide() {
    const L = this.letters;
    for (let i = 0; i < L.length; i++) {
      const a = L[i].feel;
      if (a.mode !== 'free' || a.gone) continue;
      for (let j = 0; j < L.length; j++) {
        if (i === j) continue;
        const o = L[j].feel;
        if (o.mode === 'free' && !o.gone && j > i) {
          const hit = bump(a.body, o.body.c, o.body.radius, o.body);
          if (hit > 2.5) this.sound?.play('tok', { pitch: 1.3, gain: clamp(hit / 10, 0.1, 0.6) });
        } else if (o.mode === 'home' && !a.body.asleep) {
          const hc = this.homeCentre(L[j]);
          const hit = bump(a.body, hc, o.body.radius);
          if (hit > 0.6) {
            // The letter at home gets knocked and wobbles back.
            _v.subVectors(hc, a.body.c).setY(0).normalize();
            o.pos.kick(_v.x * hit * 0.35, 0, _v.z * hit * 0.35);
            o.rot.kick(_v.z * hit * 0.4, 0, -_v.x * hit * 0.5);
            o.squash.kick(-hit * 0.3);
            this.sound?.play('tok', { pitch: 1.1, gain: clamp(hit / 10, 0.1, 0.7) });
          }
        }
      }
    }
  }

  /** Steps everything; returns true while anything moves. */
  update(dt) {
    let active = false;
    const hoverOn = !this.reducedMotion && this.pointerInside && !this.drag;
    const r = this.stage.canvas.getBoundingClientRect();
    const radius = 0.16 * Math.max(r.width, r.height);
    for (const l of this.letters) {
      const f = l.feel;
      if (f.mode === 'home' && this.updateHome(l, dt, hoverOn, r, radius)) active = true;
      else if (f.mode === 'held' && this.updateHeld(l, dt)) active = true;
      else if (f.mode === 'free' && this.updateFree(l, dt)) active = true;
      else if (f.mode === 'returning' && this.updateReturning(l, dt)) active = true;

      f.squash.step(dt);
      if (!f.squash.settled) active = true;
      const s = Math.max(0.3, f.squash.value);
      const w = 1 / Math.sqrt(s);
      l.inner.scale.set(w, s, w);

      // Ghost fades in while the letter is away, brighter as it nears home.
      const want = f.mode === 'home' ? 0 : f.mode === 'returning' ? GHOST * 0.6 : GHOST + (f.mode === 'held' ? (f.near ?? 0) * 0.3 : 0);
      if (Math.abs(want - f.ghost) > 0.003) { f.ghost = lerp(f.ghost, want, 1 - Math.exp(-10 * dt)); active = true; } else f.ghost = want;
      l.ghost.visible = f.ghost > 0.004;
      l.ghost.children[0].material.opacity = f.ghost;
    }
    this.collide();
    this.parallax.step(dt);
    if (!this.parallax.settled) active = true;
    this.stage.setCameraOffset(this.parallax.x.value, this.parallax.y.value);
    return active;
  }
}
