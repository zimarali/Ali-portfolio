// Shared plumbing for every scene. A scene describes:
//   look        – palette and lighting for the stage
//   letterStyle – extrusion/bevel for its letter material
//   build()     – creates letters' materials and any props
//   pose(t)     – places everything for time t of the entrance (pure function of t)
//   react()     – what a poke does to a letter in this material
// Because pose(t) is pure, any entrance can be skipped instantly.
import * as THREE from 'three';
import { createLetters } from '../typography.js';
import { blobShadowTexture } from '../stage.js';
import { attachFeel, play } from '../interaction.js';
import { clamp } from '../motion.js';

const box = new THREE.Box3();

export class Scene {
  static id = 'base';
  static tracking = 0.06; // extra space between letters (world units)
  duration = 4;
  idleEvery = 0; // seconds between optional idle flourishes (0 = none)

  constructor(ctx) {
    this.ctx = ctx;
    this.stage = ctx.stage;
    this.layout = ctx.layout;
    this.group = new THREE.Group();
    this.stage.scene.add(this.group);
    this.t = 0;
    this.done = false;
    this.cues = [];
    this.blobs = [];
    this.disposables = new Set();
    this.idleTracks = [];
  }

  /** Called by the director after construction. */
  init() {
    this.stage.setLook(this.look);
    this.letters = createLetters(this.ctx.font, { curveSegments: this.ctx.tier.curve, bevelSegments: this.ctx.tier.bevelSegments, ...this.letterStyle }, (ch, i) => this.material(ch, i), (ch, i) => this.dotMaterial?.(ch, i));
    this.layout.slots.forEach((slot, i) => {
      const l = this.letters[i];
      l.setSlot(slot);
      attachFeel(l);
      l.makeGhost(this.look.ghost ?? this.look.shadow ?? 0x000000);
      this.group.add(l.root);
      this.addBlob(l.body, { strength: 1 });
      if (l.dot) this.addBlob(l.dot, { strength: 0.6 });
    });
    this.build();
    this.stage.frame(this.frameBox(), this.framing ?? {});
    this.pose(0);
    this.updateBlobs();
  }

  frameBox() { return this.layout.box; }

  /** Registers a function to run when the entrance clock passes `time`. */
  cue(time, fn) { this.cues.push({ time, fn }); }
  sfx(time, name, opts) { this.cue(time, () => this.ctx.sound.play(name, opts)); }

  track(thing) { this.disposables.add(thing); return thing; }

  add(obj) { this.group.add(obj); return obj; }

  /** Soft contact shadow that follows an object's footprint on the floor. */
  addBlob(object, { strength = 1, scale = 1 } = {}) {
    const mat = this.track(new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0, color: this.look.shadow ?? 0x000000 }));
    const mesh = new THREE.Mesh(this.blobGeometry ??= this.track(new THREE.PlaneGeometry(1, 1)), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = -1;
    this.group.add(mesh);
    this.blobs.push({ object, mesh, strength, scale });
  }

  updateBlobs() {
    const base = this.ctx.tier.shadows ? 0.32 : 0.62;
    this.group.updateMatrixWorld(true);
    for (const b of this.blobs) {
      if (!b.object.visible || !b.object.parent) { b.mesh.visible = false; continue; }
      box.setFromObject(b.object);
      if (box.isEmpty()) continue;
      const h = Math.max(0, box.min.y - (b.floor ?? 0));
      const fade = clamp(1 - h / 1.4);
      b.mesh.visible = fade > 0.01;
      b.mesh.position.set((box.min.x + box.max.x) / 2, (b.floor ?? 0) + 0.004, (box.min.z + box.max.z) / 2);
      const grow = 1 + h * 0.5;
      b.mesh.scale.set((box.max.x - box.min.x + 0.35) * b.scale * grow, (box.max.z - box.min.z + 0.35) * b.scale * grow, 1);
      b.mesh.material.opacity = base * b.strength * fade * fade;
    }
  }

  /** Advances the entrance; returns true while the scene needs frames. */
  update(dt) {
    let active = false;
    if (!this.done) {
      const prev = this.t;
      this.t = Math.min(this.duration, this.t + dt);
      for (const c of this.cues) if (c.time > prev && c.time <= this.t) c.fn();
      this.pose(this.t);
      this.releaseLoose();
      if (this.t >= this.duration) this.finish();
      active = true;
    }
    if (this.idleTracks.length) {
      active = true;
      for (const tr of this.idleTracks) { tr.t += dt; tr.fn(clamp(tr.t / tr.duration)); }
      this.idleTracks = this.idleTracks.filter((tr) => tr.t < tr.duration);
    }
    if (this.tick?.(dt)) active = true;
    return active;
  }

  /** Letters the visitor has picked up or thrown are no longer choreographed. */
  releaseLoose() {
    for (const l of this.letters) if (l.feel.mode !== 'home') l.toRest();
  }

  /**
   * Background life after the entrance, driven by wall-clock seconds.
   * Return true to keep ticking at the stage's gentle ambient rate.
   */
  ambient() { return false; }

  /** Height of whatever surface is under (x, z); scenes with a base override it. */
  groundAt() { return 0; }

  /** Small timed animation for props (robot blink, bird hop...). */
  animate(duration, fn) { this.idleTracks.push({ t: 0, duration, fn }); this.stage.wake(); }

  /** Jumps straight to the resolved composition. */
  skip() {
    if (this.done) return;
    this.t = this.duration;
    this.pose(this.duration);
    this.finish();
  }

  finish() {
    this.done = true;
    for (const l of this.letters) l.toRest();
    this.settle?.();
    this.updateBlobs();
    // Restrained idle life: one small moment every so often, then stillness
    // (the render loop sleeps in between).
    if (this.idleEvery && this.idle && !this.ctx.reducedMotion) {
      this.idleTimer = setInterval(() => {
        if (document.hidden || this.ctx.interaction.drag) return;
        this.idle();
        this.stage.wake();
      }, this.idleEvery * 1000);
    }
  }

  /** Default poke: a springy squash-and-hop. Scenes override with material-specific reactions. */
  react(letter) {
    const f = letter.feel;
    f.squash.kick(-3.5);
    f.pos.y.kick(2.2);
  }

  play(letter, duration, fn) { play(letter, duration, fn); }

  get reduced() { return this.ctx.reducedMotion; }

  dispose() {
    clearInterval(this.idleTimer);
    this.stage.scene.remove(this.group);
    for (const l of this.letters ?? []) {
      l.dispose();
      this.disposables.add(l.body.material);
      if (l.dot) this.disposables.add(l.dot.material);
    }
    this.group.traverse((o) => {
      if (o.geometry) this.disposables.add(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) this.disposables.add(m);
    });
    for (const d of this.disposables) {
      if (d.isMaterial) for (const k of ['map', 'bumpMap', 'roughnessMap', 'normalMap']) if (d[k] && d[k] !== blobShadowTexture()) d[k].dispose();
      if (d !== blobShadowTexture()) d.dispose?.();
    }
    this.disposables.clear();
  }
}

/** Volume-preserving squash on a mesh (sy < 1 squashes, > 1 stretches). */
export function squash(mesh, sy) {
  const w = 1 / Math.sqrt(Math.max(0.3, sy));
  mesh.scale.set(w, sy, w);
}

/** Squash factor for a landing that happened `since` seconds ago. */
export function landing(since, amp = 0.24, freq = 2.6, decay = 8) {
  return since > 0 ? 1 - amp * Math.exp(-decay * since) * Math.cos(Math.PI * 2 * freq * since) : 1;
}

/** Copy a root transform from position + Euler angles in one call. */
export function setRoot(letter, x, y, z, rx = 0, ry = 0, rz = 0, order = 'XYZ') {
  letter.root.position.set(x, y, z);
  letter.root.rotation.set(rx, ry, rz, order);
}
