// 절차적 사운드 — 차종별 프로파일 (수평4/직4/수평6/F1 V6/EV 모터 와인)

import type { SoundProfile } from './cars';

interface EngineOsc {
  o: OscillatorNode;
  g: GainNode;
  mul: number;
}

interface OscSpec { type: OscillatorType; mul: number; detune: number; g: number }

const ICE_OSCS: OscSpec[] = [
  { type: 'sawtooth', mul: 0.5, detune: -7, g: 0.32 },
  { type: 'sawtooth', mul: 1.0, detune: 0, g: 0.5 },
  { type: 'sawtooth', mul: 1.0, detune: 9, g: 0.3 },
  { type: 'square', mul: 2.0, detune: -5, g: 0.22 },
  { type: 'sawtooth', mul: 3.0, detune: 6, g: 0.12 },
  { type: 'square', mul: 4.0, detune: 0, g: 0.06 },
];

const EV_OSCS: OscSpec[] = [
  { type: 'sine', mul: 1.0, detune: 0, g: 0.45 },
  { type: 'sine', mul: 2.0, detune: 4, g: 0.18 },
  { type: 'triangle', mul: 3.0, detune: -3, g: 0.08 },
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engGain!: GainNode;
  private engLP!: BiquadFilterNode;
  private oscs: EngineOsc[] = [];
  private tireBP!: BiquadFilterNode;
  private tireG!: GainNode;
  private windLP!: BiquadFilterNode;
  private windG!: GainNode;
  private lastThrottle = 0;
  private popUntil = 0;
  private profile: SoundProfile = { fireFactor: 1.0, ev: false };
  private idleRpm = 800;
  private maxRpm = 7500;

  configure(profile: SoundProfile, idleRpm: number, maxRpm: number): void {
    this.profile = profile;
    this.idleRpm = idleRpm;
    this.maxRpm = maxRpm;
    if (this.ctx) this.rebuildOscs();
  }

  init(volume: number): void {
    if (this.ctx) return;
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);

      const engGain = ctx.createGain();
      engGain.gain.value = 0;
      const engHP = ctx.createBiquadFilter();
      engHP.type = 'highpass'; engHP.frequency.value = 40;
      const engLP = ctx.createBiquadFilter();
      engLP.type = 'lowpass'; engLP.frequency.value = 2200; engLP.Q.value = 0.7;
      engGain.connect(engHP).connect(engLP).connect(master);

      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

      const tireSrc = ctx.createBufferSource();
      tireSrc.buffer = noiseBuf; tireSrc.loop = true;
      const tireBP = ctx.createBiquadFilter();
      tireBP.type = 'bandpass'; tireBP.frequency.value = 1800; tireBP.Q.value = 6;
      const tireG = ctx.createGain();
      tireG.gain.value = 0;
      tireSrc.connect(tireBP).connect(tireG).connect(master);
      tireSrc.start();

      const windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuf; windSrc.loop = true;
      const windLP = ctx.createBiquadFilter();
      windLP.type = 'lowpass'; windLP.frequency.value = 200;
      const windG = ctx.createGain();
      windG.gain.value = 0;
      windSrc.connect(windLP).connect(windG).connect(master);
      windSrc.start();

      this.ctx = ctx;
      this.master = master;
      this.engGain = engGain;
      this.engLP = engLP;
      this.tireBP = tireBP;
      this.tireG = tireG;
      this.windLP = windLP;
      this.windG = windG;
      this.rebuildOscs();
      void ctx.resume();
    } catch (e) {
      console.warn('audio init failed', e);
    }
  }

  private rebuildOscs(): void {
    if (!this.ctx) return;
    for (const s of this.oscs) {
      try { s.o.stop(); } catch { /* already stopped */ }
      s.o.disconnect();
      s.g.disconnect();
    }
    const specs = this.profile.ev ? EV_OSCS : ICE_OSCS;
    this.oscs = specs.map((sp) => {
      const o = this.ctx!.createOscillator();
      o.type = sp.type; o.frequency.value = 30; o.detune.value = sp.detune;
      const g = this.ctx!.createGain();
      g.gain.value = sp.g;
      o.connect(g).connect(this.engGain);
      o.start();
      return { o, g, mul: sp.mul };
    });
  }

  update(params: {
    volume: number; rpm: number; throttle: number; revCut: boolean;
    slipMag: number; speed: number;
  }): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(params.volume, now, 0.05);

    const ev = this.profile.ev;
    const rpm = ev ? Math.max(0, params.rpm) : Math.max(this.idleRpm, params.rpm);
    const baseHz = Math.max(8, (rpm / 30) * this.profile.fireFactor);
    for (const s of this.oscs) s.o.frequency.setTargetAtTime(baseHz * s.mul, now, 0.015);

    const load = params.throttle * 0.6 + Math.min(rpm / this.maxRpm, 1) * 0.3;
    let engVol = (ev ? 0.02 : 0.14) + load * (ev ? 0.55 : 1.0);
    if (!ev && params.revCut) engVol *= Math.random() < 0.5 ? 0.4 : 1.0;

    if (!ev) {
      if (params.throttle - this.lastThrottle < -0.5 && rpm > this.maxRpm * 0.45) this.popUntil = now + 0.12;
      this.lastThrottle = params.throttle;
      if (now < this.popUntil) engVol += 0.35;
    }

    this.engGain.gain.setTargetAtTime(engVol, now, 0.03);
    const lpBase = ev ? 2500 : 1200;
    this.engLP.frequency.setTargetAtTime(lpBase + rpm * (ev ? 0.1 : 0.2 * (7500 / this.maxRpm)), now, 0.05);

    let squeal = 0;
    if (params.speed > 2 && params.slipMag > 0.2) squeal = Math.min(0.5, (params.slipMag - 0.15) * 1.5);
    this.tireG.gain.setTargetAtTime(squeal, now, 0.03);
    this.tireBP.frequency.setTargetAtTime(1200 + params.slipMag * 1800, now, 0.05);

    const wind = Math.min(0.35, Math.max(0, params.speed - 5) * 0.012);
    this.windG.gain.setTargetAtTime(wind, now, 0.05);
    this.windLP.frequency.setTargetAtTime(150 + params.speed * 25, now, 0.05);
  }
}
