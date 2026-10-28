// Tiny synthesised sound palette (no audio files). Muted by default; the
// AudioContext is only created once the visitor turns sound on.
export class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.noise = null;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on && !this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return false; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (on) this.ctx.resume();
    return this.enabled;
  }

  play(name, { pitch = 1, gain = 1, delay = 0 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const fn = this[`_${name}`];
    if (fn) fn.call(this, this.ctx.currentTime + delay, pitch, gain);
  }

  env(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  tone(t, type, f0, f1, dur, peak) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(this.env(t, peak, 0.005, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(t, filterType, freq, q, dur, peak, sweepTo) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    s.connect(f).connect(this.env(t, peak, Math.min(0.02, dur / 4), dur));
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  _pop(t, p, g) { this.tone(t, 'sine', 520 * p, 170 * p, 0.14, 0.5 * g); }
  _boing(t, p, g) { this.tone(t, 'sine', 180 * p, 420 * p, 0.22, 0.35 * g); }
  _tok(t, p, g) { this.tone(t, 'triangle', 900 * p, 600 * p, 0.06, 0.45 * g); this.burst(t, 'bandpass', 1800 * p, 3, 0.03, 0.3 * g); }
  _clack(t, p, g) { this.burst(t, 'bandpass', 2600 * p, 6, 0.035, 0.6 * g); this.tone(t, 'square', 1300 * p, 1100 * p, 0.02, 0.06 * g); }
  _thud(t, p, g) { this.tone(t, 'sine', 140 * p, 60 * p, 0.16, 0.6 * g); }
  _beep(t, p, g) { this.tone(t, 'square', 880 * p, 880 * p, 0.07, 0.08 * g); }
  _chirp(t, p, g) { this.tone(t, 'square', 700 * p, 1400 * p, 0.09, 0.07 * g); this.tone(t + 0.1, 'square', 1000 * p, 1700 * p, 0.08, 0.06 * g); }
  _whir(t, p, g) { this.tone(t, 'sawtooth', 90 * p, 140 * p, 0.35, 0.04 * g); }
  _swish(t, p, g) { this.burst(t, 'lowpass', 400 * p, 0.7, 1.1, 0.5 * g, 1600 * p); }
  _paper(t, p, g) { this.burst(t, 'highpass', 3000 * p, 0.8, 0.09, 0.35 * g); }
  _bell(t, p, g) { for (const [f, a] of [[1, 0.3], [2.76, 0.12], [5.4, 0.06]]) this.tone(t, 'sine', 1040 * p * f, 1040 * p * f, 0.9, a * g); }
  _buzz(t, p, g) { this.tone(t, 'sawtooth', 110 * p, 118 * p, 0.18, 0.06 * g); this.burst(t, 'bandpass', 3200, 2, 0.05, 0.12 * g); }
  _honk(t, p, g) { this.tone(t, 'square', 420 * p, 410 * p, 0.12, 0.07 * g); this.tone(t, 'square', 530 * p, 520 * p, 0.12, 0.05 * g); }
  _boom(t, p, g) { this.tone(t, 'sine', 90 * p, 40 * p, 0.4, 0.6 * g); this.burst(t + 0.02, 'highpass', 2500, 0.6, 0.5, 0.18 * g); }
  _click(t, p, g) { this.burst(t, 'highpass', 4000 * p, 1, 0.015, 0.4 * g); this.tone(t, 'square', 2200 * p, 1800 * p, 0.012, 0.05 * g); }
  _ratchet(t, p, g) { for (let i = 0; i < 4; i++) this._tok(t + i * 0.045, p * 1.4, g * 0.5); }
}
