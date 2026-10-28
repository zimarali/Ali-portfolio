// Small animation toolkit: easing curves, damped springs and timing helpers.
// Scenes are written as pure functions of time wherever possible, so a
// scene can be skipped to its resolved state at any moment.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
/** Progress of `t` through a window that starts at `start` and lasts `dur`. */
export const span = (t, start, dur) => clamp((t - start) / dur);
export const smoothstep = (a, b, v) => { const x = invLerp(a, b, v); return x * x * (3 - 2 * x); };
export const TAU = Math.PI * 2;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  /** Damped oscillation that settles at 1: a hand-tuned "boing". */
  outElastic: (t, freq = 3.2, decay = 5.5) =>
    t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-decay * t) * Math.cos(freq * TAU * t),
};

/** Decaying wobble around 0: amplitude 1 at t=0, quiet by t≈1. */
export const wobble = (t, freq = 3, decay = 5) =>
  t <= 0 || t >= 1.6 ? 0 : Math.exp(-decay * t) * Math.sin(freq * TAU * t);

/**
 * Height of a ball that drops from `h0` (at t=0) and bounces with the
 * given restitution. Returns { y, impact } where impact is the index of
 * the most recent bounce and `since` the time since it.
 */
export function bounceDrop(t, h0, g = 30, restitution = 0.42, maxBounces = 3) {
  let tFall = Math.sqrt((2 * h0) / g);
  if (t < tFall) return { y: h0 - 0.5 * g * t * t, impact: -1, since: 0, landed: false };
  let tt = t - tFall;
  let v = g * tFall * restitution;
  for (let i = 0; i < maxBounces; i++) {
    const flight = (2 * v) / g;
    if (tt < flight) return { y: v * tt - 0.5 * g * tt * tt, impact: i, since: tt, landed: false };
    tt -= flight;
    v *= restitution;
  }
  return { y: 0, impact: maxBounces, since: tt, landed: true };
}

/** Critically-tunable damped spring for a scalar. */
export class Spring {
  constructor(value = 0, stiffness = 170, damping = 14) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.k = stiffness;
    this.c = damping;
  }
  step(dt) {
    // Sub-step for stability with stiff springs on slow frames.
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.k * (this.target - this.value) - this.c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  get settled() {
    return Math.abs(this.target - this.value) < 1e-4 && Math.abs(this.velocity) < 1e-3;
  }
  snap(v = this.target) { this.value = this.target = v; this.velocity = 0; }
  kick(v) { this.velocity += v; }
}

/** Three springs for x/y/z sharing tuning. */
export class Spring3 {
  constructor(stiffness, damping) {
    this.x = new Spring(0, stiffness, damping);
    this.y = new Spring(0, stiffness, damping);
    this.z = new Spring(0, stiffness, damping);
  }
  setTarget(x, y, z) { this.x.target = x; this.y.target = y; this.z.target = z; }
  kick(x, y, z) { this.x.kick(x); this.y.kick(y); this.z.kick(z); }
  step(dt) { this.x.step(dt); this.y.step(dt); this.z.step(dt); }
  get settled() { return this.x.settled && this.y.settled && this.z.settled; }
  tune(k, c) { for (const s of [this.x, this.y, this.z]) { s.k = k; s.c = c; } }
}

/** Deterministic PRNG so each scene's "random" details are stable per run. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Evaluates a smooth path through points (Catmull-Rom) at u in [0,1]. */
export function catmull(points, u, out = { x: 0, y: 0, z: 0 }) {
  const n = points.length - 1;
  const f = clamp(u) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  for (const k of ['x', 'y', 'z']) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}
