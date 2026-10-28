// Just enough rigid-body physics for a tossed letter: each loose letter is a
// box that falls, tumbles, bounces off the ground and slides to a stop.
// Letters bump one another as soft spheres. No library, no solver: impulses
// at the box corners, a few sub-steps per frame, and sleep when still.
import * as THREE from 'three';

const GRAVITY = 22;
const RESTITUTION = 0.32;
const FRICTION = 0.55;
const SUBSTEPS = 3;

const _r = new THREE.Vector3();
const _n = new THREE.Vector3(0, 1, 0);
const _vc = new THREE.Vector3();
const _t = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _m = new THREE.Matrix3();
const _rt = new THREE.Matrix3();
const _dq = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();

/** Physical state for one letter, built from its size (box approximation). */
export class Body {
  constructor(size) {
    this.half = new THREE.Vector3(Math.max(0.12, size.x / 2), size.y / 2, Math.max(0.08, size.z / 2));
    const [w, h, d] = [this.half.x * 2, this.half.y * 2, this.half.z * 2];
    // Slightly inflated inertia keeps tumbling readable rather than frantic.
    this.invI = new THREE.Vector3(12 / (h * h + d * d), 12 / (w * w + d * d), 12 / (w * w + h * h)).multiplyScalar(0.75);
    this.radius = Math.max(0.28, Math.min(this.half.x, this.half.y) * 0.95);
    this.c = new THREE.Vector3(); // centre of mass, world space
    this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3();
    this.still = 0;
    this.asleep = false;
    this.lastHit = 0;
  }

  wake() { this.asleep = false; this.still = 0; }

  /** World-space inverse inertia applied to a vector. */
  applyInvI(vec, out) {
    _m.setFromMatrix4(_m4.makeRotationFromQuaternion(this.q));
    _rt.copy(_m).transpose();
    out.copy(vec).applyMatrix3(_rt);
    out.set(out.x * this.invI.x, out.y * this.invI.y, out.z * this.invI.z).applyMatrix3(_m);
    return out;
  }

  /** Effective mass denominator for an impulse along `dir` at offset `r`. */
  denom(r, dir) {
    _tmp.crossVectors(r, dir);
    this.applyInvI(_tmp, _tmp);
    _tmp.cross(r);
    return 1 + dir.dot(_tmp);
  }

  impulse(r, j) {
    this.v.add(j);
    _tmp.crossVectors(r, j);
    this.w.add(this.applyInvI(_tmp, _tmp));
  }

  /**
   * Advances the body. groundAt(x, z) gives the surface height.
   * onImpact(speed) is called for audible hits. Returns true while moving.
   */
  step(dt, groundAt, onImpact) {
    if (this.asleep) return false;
    const h = dt / SUBSTEPS;
    let touching = false;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.v.y -= GRAVITY * h;
      this.c.addScaledVector(this.v, h);
      _dq.set(this.w.x * h * 0.5, this.w.y * h * 0.5, this.w.z * h * 0.5, 0).multiply(this.q);
      this.q.set(this.q.x + _dq.x, this.q.y + _dq.y, this.q.z + _dq.z, this.q.w + _dq.w).normalize();
      this.w.multiplyScalar(Math.exp(-0.35 * h));

      let deepest = 0;
      for (let i = 0; i < 8; i++) {
        _corner.set(i & 1 ? this.half.x : -this.half.x, i & 2 ? this.half.y : -this.half.y, i & 4 ? this.half.z : -this.half.z)
          .applyQuaternion(this.q).add(this.c);
        const ground = groundAt(_corner.x, _corner.z);
        const pen = ground - _corner.y;
        if (pen <= 0) continue;
        touching = true;
        deepest = Math.max(deepest, pen);
        _r.subVectors(_corner, this.c);
        _vc.crossVectors(this.w, _r).add(this.v);
        const vn = _vc.y;
        if (vn >= 0) continue;
        if (vn < -2.2 && performance.now() - this.lastHit > 90) { this.lastHit = performance.now(); onImpact?.(-vn); }
        const e = vn < -1.2 ? RESTITUTION : 0;
        const jn = (-(1 + e) * vn) / this.denom(_r, _n);
        this.impulse(_r, _t.set(0, jn, 0));
        // Friction opposes sliding at the contact.
        _vc.crossVectors(this.w, _r).add(this.v);
        _t.set(_vc.x, 0, _vc.z);
        const vt = _t.length();
        if (vt > 1e-4) {
          _t.divideScalar(vt);
          const jt = Math.min(vt / this.denom(_r, _t), FRICTION * jn);
          this.impulse(_r, _t.multiplyScalar(-jt));
        }
      }
      this.c.y += deepest * 0.8;
      if (touching) this.w.multiplyScalar(Math.exp(-2.2 * h));
    }
    // Sleep once it has been resting for a moment.
    const calm = touching && this.v.lengthSq() < 0.02 && this.w.lengthSq() < 0.04;
    this.still = calm ? this.still + dt : 0;
    if (this.still > 0.35) { this.asleep = true; this.v.set(0, 0, 0); this.w.set(0, 0, 0); }
    return !this.asleep;
  }
}

/**
 * Soft sphere bumps between a loose body and an obstacle (another body, or a
 * letter still at home, passed as a static centre). Returns impact speed.
 */
export function bump(a, bCentre, bRadius, b = null) {
  _r.subVectors(a.c, bCentre);
  const dist = _r.length();
  const min = a.radius + bRadius;
  if (dist >= min || dist < 1e-5) return 0;
  _r.divideScalar(dist);
  const push = min - dist;
  if (b) { a.c.addScaledVector(_r, push / 2); b.c.addScaledVector(_r, -push / 2); }
  else a.c.addScaledVector(_r, push);
  const rel = b ? _vc.subVectors(a.v, b.v).dot(_r) : a.v.dot(_r);
  if (rel >= 0) return 0;
  const j = -(1 + 0.45) * rel / (b ? 2 : 1);
  a.v.addScaledVector(_r, j);
  a.w.add(_t.set(_r.z, 0, -_r.x).multiplyScalar(j * 0.8));
  a.wake();
  if (b) { b.v.addScaledVector(_r, -j); b.wake(); }
  return -rel;
}
