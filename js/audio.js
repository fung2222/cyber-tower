// NEON BASTION sounds — distinct synth SFX per tower (rate-limited so big defences stay pleasant) + 'chill' synthwave music.
import { SynthAudio, mtof } from 'cyber-kit/audio/synth.js';
export class TowerAudio extends SynthAudio {
  constructor(store) { super({ store, music: 'chill' }); this.last = {}; }
  gate(k, ms) { const n = performance.now(); if (n - (this.last[k] || 0) < ms) return false; this.last[k] = n; return true; }
  laser() { if (!this.gate('laser', 70)) return; this.osc({ type: 'square', f: 2400, f2: 1300, dur: 0.05, vol: 0.016, lp: 6000 }); }
  cryo() { if (!this.gate('cryo', 160)) return; this.noiseHit({ dur: 0.35, vol: 0.05, type: 'bandpass', f: 3200, f2: 900, q: 2 }); this.osc({ type: 'sine', f: 880, f2: 1320, dur: 0.18, vol: 0.025, send: 0.5 }); }
  launch() { if (!this.gate('launch', 110)) return; this.noiseHit({ dur: 0.22, vol: 0.05, type: 'highpass', f: 800, f2: 3000, q: 0.7 }); }
  boom() { if (!this.gate('boom', 90)) return; this.noiseHit({ dur: 0.35, vol: 0.11, type: 'lowpass', f: 2000, f2: 120, q: 0.8, a: 0.003 }); this.osc({ type: 'sine', f: 150, f2: 45, dur: 0.3, vol: 0.12 }); }
  tesla() { if (!this.gate('tesla', 120)) return; this.noiseHit({ dur: 0.16, vol: 0.06, type: 'bandpass', f: 5200, f2: 2600, q: 4 }); this.osc({ type: 'sawtooth', f: 160, f2: 110, dur: 0.14, vol: 0.03, lp: 2400 }); }
  pop(big = false) { if (!this.gate(big ? 'popB' : 'pop', big ? 60 : 45)) return; this.osc({ type: 'triangle', f: big ? 520 : 760, f2: big ? 140 : 300, dur: big ? 0.18 : 0.07, vol: big ? 0.07 : 0.035 }); if (big) this.noiseHit({ dur: 0.25, vol: 0.06, type: 'lowpass', f: 1600, f2: 200 }); }
  shieldBreak() { if (!this.gate('sb', 120)) return; this.osc({ type: 'sine', f: 1500, f2: 400, dur: 0.15, vol: 0.04 }); }
  build() { [0, 7].forEach((n, i) => this.osc({ type: 'square', f: mtof(67 + n), t: i * 0.06, dur: 0.09, vol: 0.05, lp: 3000, send: 0.3 })); this.noiseHit({ dur: 0.12, vol: 0.05, type: 'lowpass', f: 1200, f2: 300 }); }
  upgrade() { [0, 4, 7, 12].forEach((n, i) => this.osc({ type: 'square', f: mtof(72 + n), t: i * 0.05, dur: 0.08, vol: 0.045, lp: 4200, send: 0.35 })); }
  sell() { this.osc({ type: 'triangle', f: mtof(79), dur: 0.08, vol: 0.05 }); this.osc({ type: 'triangle', f: mtof(74), t: 0.07, dur: 0.12, vol: 0.05 }); }
  coin() { if (!this.gate('coin', 200)) return; this.osc({ type: 'square', f: mtof(88), dur: 0.05, vol: 0.025, lp: 5000 }); this.osc({ type: 'square', f: mtof(95), t: 0.05, dur: 0.08, vol: 0.025, lp: 5000 }); }
  leak() { this.osc({ type: 'sawtooth', f: 220, f2: 90, dur: 0.4, vol: 0.1, lp: 1500 }); this.noiseHit({ dur: 0.3, vol: 0.08, type: 'bandpass', f: 700, f2: 200, q: 1 }); }
  wave(boss = false) { const notes = boss ? [0, 0, -5] : [0, 5, 12]; notes.forEach((n, i) => this.osc({ type: boss ? 'square' : 'sawtooth', f: mtof((boss ? 52 : 64) + n), t: i * (boss ? 0.42 : 0.09), dur: boss ? 0.3 : 0.12, vol: boss ? 0.07 : 0.05, lp: boss ? 1800 : 3500, send: 0.4 })); }
  win() { [0, 4, 7, 12, 16].forEach((n, i) => this.osc({ type: 'square', f: mtof(72 + n), t: i * 0.09, dur: 0.22, vol: 0.05, lp: 4000, send: 0.5 })); }
}
