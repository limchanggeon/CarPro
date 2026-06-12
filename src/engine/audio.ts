// 절차적 사운드 — 멀티 하모닉 엔진 합성 / 타이어 스퀼 / 풍절음

import { SPEC } from './constants';

interface EngineOsc {
  o: OscillatorNode;
  mul: number;
}

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

  get ready(): boolean { return this.ctx !== null; }

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

      // 4기통 점화 주파수 = rpm/30 — 서브하모닉/펀더멘털/디튠 페어/배음
      const specs: Array<{ type: OscillatorType; mul: number; detune: number; g: number }> = [
        { type: 'sawtooth', mul: 0.5, detune: -7, g: 0.32 },
        { type: 'sawtooth', mul: 1.0, detune: 0, g: 0.5 },
        { type: 'sawtooth', mul: 1.0, detune: 9, g: 0.3 },
        { type: 'square', mul: 2.0, detune: -5, g: 0.22 },
        { type: 'sawtooth', mul: 3.0, detune: 6, g: 0.12 },
        { type: 'square', mul: 4.0, detune: 0, g: 0.06 },
      ];
      this.oscs = specs.map(s => {
        const o = ctx.createOscillator();
        o.type = s.type; o.frequency.value = 30; o.detune.value = s.detune;
        const g = ctx.createGain();
        g.gain.value = s.g;
        o.connect(g).connect(engGain);
        o.start();
        return { o, mul: s.mul };
      });

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
      void ctx.resume();
    } catch (e) {
      console.warn('audio init failed', e);
    }
  }

  update(params: {
    volume: number; rpm: number; throttle: number; revCut: boolean;
    slipMag: number; speed: number;
  }): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(params.volume, now, 0.05);

    const rpm = Math.max(SPEC.idleRpm, params.rpm);
    const baseHz = rpm / 30;
    for (const s of this.oscs) s.o.frequency.setTargetAtTime(baseHz * s.mul, now, 0.015);

    const load = params.throttle * 0.6 + Math.min(rpm / SPEC.maxRpm, 1) * 0.3;
    let engVol = 0.14 + load;
    if (params.revCut) engVol *= Math.random() < 0.5 ? 0.4 : 1.0;

    // 디셀 팝 — 고RPM 스로틀 오프 백파이어
    if (params.throttle - this.lastThrottle < -0.5 && rpm > 3500) this.popUntil = now + 0.12;
    this.lastThrottle = params.throttle;
    if (now < this.popUntil) engVol += 0.35;

    this.engGain.gain.setTargetAtTime(engVol, now, 0.03);
    this.engLP.frequency.setTargetAtTime(1200 + rpm * 0.2, now, 0.05);

    let squeal = 0;
    if (params.speed > 2 && params.slipMag > 0.2) squeal = Math.min(0.5, (params.slipMag - 0.15) * 1.5);
    this.tireG.gain.setTargetAtTime(squeal, now, 0.03);
    this.tireBP.frequency.setTargetAtTime(1200 + params.slipMag * 1800, now, 0.05);

    const wind = Math.min(0.35, Math.max(0, params.speed - 5) * 0.012);
    this.windG.gain.setTargetAtTime(wind, now, 0.05);
    this.windLP.frequency.setTargetAtTime(150 + params.speed * 25, now, 0.05);
  }
}
