// 시뮬레이션 코어 — 차종/트랙 구성, 게임 루프, 입력, 카운트다운, 랩 타이밍, 파티클

import { CONFIG } from './constants';
import { CarSpec, getCar } from './cars';
import { TrackDef, getTrack } from './tracks';
import {
  AidSettings, CarState, DebugState, SimInputs, VisualState,
  createCarState, step,
} from './physics';
import { Track, segmentsIntersect } from './track';
import { AudioEngine } from './audio';
import { Renderer } from '../render/renderer';
import { Telemetry, useStore } from '../store';

export interface SkidSegment {
  x1: number; y1: number; x2: number; y2: number;
  t: number; a: number;
}

export interface SmokeParticle {
  x: number; y: number; vx: number; vy: number;
  r: number; life: number; decay: number;
}

interface LapState {
  num: number;
  startMs: number | null;
  current: number;
  last: number | null;
  best: number | null;
  prevX: number;
  prevY: number;
  ready: boolean;
  inited: boolean;
  history: number[];
}

const KEY_CODES = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'BracketLeft', 'BracketRight', 'KeyC', 'KeyH', 'KeyR', 'KeyL',
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
] as const;

function freshLap(): LapState {
  return {
    num: 0, startMs: null, current: 0, last: null, best: null,
    prevX: 0, prevY: 0, ready: false, inited: false, history: [],
  };
}

export class Simulation {
  spec: CarSpec = getCar('gr86');
  trackDef: TrackDef = getTrack('inje');
  state: CarState = createCarState(this.spec, this.trackDef.start.x, this.trackDef.start.y, this.trackDef.start.yaw);
  inputs: SimInputs = { throttle: 0, brake: 0, hand: false, steerCmd: 0, mu: 1.0, maxSteer: 0.5, volume: 0.35 };
  aids: AidSettings = { abs: true, tc: true, tcLevel: 1, esc: true };
  debug: DebugState = { kappaF: 0, kappaR: 0, alphaF: 0, alphaR: 0, slipMagF: 0, slipMagR: 0, wheelspin: false, onTrack: true };
  visual: VisualState = {
    pitch: 0, pitchRate: 0, roll: 0, rollRate: 0,
    wheelAngleF: 0, wheelAngleR: 0, camAheadX: 0, camAheadY: 0, shakeImpulse: 0,
    gDispX: 0, gDispY: 0, gTrailX: 0, gTrailY: 0,
  };
  lap: LapState = freshLap();

  track = new Track();
  audio = new AudioEngine();
  skidSegments: SkidSegment[] = [];
  smokeParticles: SmokeParticle[] = [];
  simTime = 0;
  carNx = 0.5;
  carNy = 0.5;
  countdownEndMs = 0;

  private keys: Record<string, boolean> = {};
  private renderer: Renderer | null = null;
  private rafId = 0;
  private lastT = 0;
  private running = false;
  private lapDirty = true;
  private historySnapshot: number[] = [];
  private prevPadLb = false;
  private prevPadRb = false;
  private lastWheelPos: Array<{ x: number; y: number } | null> = [null, null, null, null];

  constructor() {
    for (const k of KEY_CODES) this.keys[k] = false;
  }

  // 차종/트랙 구성 후 카운트다운과 함께 레이스 시작
  async configure(carId: string, trackId: string): Promise<void> {
    this.spec = getCar(carId);
    this.trackDef = getTrack(trackId);
    useStore.getState().setTrackReady(false);
    this.audio.configure(this.spec.sound, this.spec.idleRpm, this.spec.maxRpm);
    await this.track.load(this.trackDef, import.meta.env.BASE_URL);
    useStore.getState().setMinimapUrl(this.track.minimapUrl);
    useStore.getState().setTrackReady(true);
    this.reset();
  }

  attach(canvas: HTMLCanvasElement): void {
    this.renderer = new Renderer(canvas);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('keydown', this.initAudioOnce, { once: true });
    window.addEventListener('pointerdown', this.initAudioOnce, { once: true });
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('keydown', this.initAudioOnce);
    window.removeEventListener('pointerdown', this.initAudioOnce);
  }

  reset = (): void => {
    const s = this.track.startPos ?? this.trackDef.start;
    this.state = createCarState(this.spec, s.x, s.y, s.yaw);
    this.visual.pitch = this.visual.pitchRate = this.visual.roll = this.visual.rollRate = 0;
    this.visual.camAheadX = this.visual.camAheadY = this.visual.shakeImpulse = 0;
    this.skidSegments.length = 0;
    this.smokeParticles.length = 0;
    this.lastWheelPos.fill(null);
    this.lap = freshLap();
    this.lapDirty = true;
    this.countdownEndMs = performance.now() + CONFIG.countdownSec * 1000;
  };

  clearSkids = (): void => {
    this.skidSegments.length = 0;
  };

  toggleAid = (aid: 'abs' | 'tc' | 'esc'): void => {
    this.aids[aid] = !this.aids[aid];
  };

  cycleTcLevel = (): void => {
    this.aids.tcLevel = (this.aids.tcLevel + 1) % 4;
  };

  maxGear(): number {
    return this.spec.gears.length - 2;
  }

  shiftUp = (): void => { if (this.state.gear < this.maxGear()) this.state.gear++; };
  shiftDown = (): void => { if (this.state.gear > -1) this.state.gear--; };

  private initAudioOnce = (): void => {
    this.audio.init(useStore.getState().settings.volume);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') { useStore.getState().exitToLobby(); return; }
    if (e.code === 'BracketRight') this.shiftUp();
    if (e.code === 'BracketLeft') this.shiftDown();
    if (e.code === 'KeyC') this.clearSkids();
    if (e.code === 'KeyH') useStore.getState().toggleHelp();
    if (e.code === 'KeyL') useStore.getState().toggleLap();
    if (e.code === 'KeyR') this.reset();
    if (e.code === 'Digit1') this.toggleAid('abs');
    if (e.code === 'Digit2') this.toggleAid('tc');
    if (e.code === 'Digit3') this.toggleAid('esc');
    if (e.code === 'Digit4') this.cycleTcLevel();
    if (Object.prototype.hasOwnProperty.call(this.keys, e.code)) {
      e.preventDefault();
      this.keys[e.code] = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (Object.prototype.hasOwnProperty.call(this.keys, e.code)) this.keys[e.code] = false;
  };

  private countdownLeft(): number {
    return (this.countdownEndMs - performance.now()) / 1000;
  }

  private readInputs(): void {
    const k = this.keys;
    let throttle = k.KeyW || k.ArrowUp ? 1 : 0;
    let brake = k.KeyS || k.ArrowDown ? 1 : 0;
    let hand = !!k.Space;
    let steerCmd = k.KeyA || k.ArrowLeft ? -1 : k.KeyD || k.ArrowRight ? 1 : 0;

    try {
      const gp = navigator.getGamepads?.()[0];
      if (gp && gp.mapping === 'standard') {
        const sx = gp.axes[0] ?? 0;
        if (Math.abs(sx) > 0.12) steerCmd = sx;
        const rt = gp.buttons[7]?.value ?? 0;
        const lt = gp.buttons[6]?.value ?? 0;
        if (rt > 0.05) throttle = Math.max(throttle, rt);
        if (lt > 0.05) brake = Math.max(brake, lt);
        if (gp.buttons[0]?.pressed) hand = true;
        const lb = !!gp.buttons[4]?.pressed, rb = !!gp.buttons[5]?.pressed;
        if (rb && !this.prevPadRb) this.shiftUp();
        if (lb && !this.prevPadLb) this.shiftDown();
        this.prevPadLb = lb;
        this.prevPadRb = rb;
      }
    } catch { /* 게임패드 미지원 환경 무시 */ }

    // 카운트다운 중 — 출발 잠금 (스로틀로 레브는 가능하되 제동 고정)
    if (this.countdownLeft() > 0) {
      brake = 1;
      hand = true;
    }

    const settings = useStore.getState().settings;
    this.inputs.throttle = throttle;
    this.inputs.brake = brake;
    this.inputs.hand = hand;
    this.inputs.steerCmd = steerCmd;
    this.inputs.mu = settings.mu;
    this.inputs.maxSteer = settings.maxSteer;
    this.inputs.volume = settings.volume;
  }

  private updateLapTiming(): void {
    const lap = this.lap, state = this.state;
    if (!lap.inited) {
      lap.prevX = state.x;
      lap.prevY = state.y;
      lap.inited = true;
      return;
    }
    const x1 = lap.prevX, y1 = lap.prevY, x2 = state.x, y2 = state.y;
    if (Math.abs(x2 - x1) + Math.abs(y2 - y1) < 0.1) {
      lap.prevX = x2; lap.prevY = y2;
      if (lap.startMs !== null) lap.current = (performance.now() - lap.startMs) / 1000;
      return;
    }
    const sl = this.track.startLine ?? this.trackDef.startLine;
    if (segmentsIntersect(x1, y1, x2, y2, sl.x1, sl.y1, sl.x2, sl.y2)) {
      const forward = (x2 - x1) * sl.nx + (y2 - y1) * sl.ny;
      if (forward > 0) {
        const nowMs = performance.now();
        if (lap.startMs !== null) {
          const t = (nowMs - lap.startMs) / 1000;
          if (t > 3.0) {
            lap.last = t;
            if (lap.best === null || t < lap.best) lap.best = t;
            lap.history.push(t);
            lap.num++;
            this.lapDirty = true;
          }
        }
        lap.startMs = nowMs;
        lap.ready = true;
      }
    }
    lap.prevX = x2;
    lap.prevY = y2;
    if (lap.startMs !== null) lap.current = (performance.now() - lap.startMs) / 1000;
  }

  private spawnSkidsAndSmoke(dt: number): void {
    const { state, debug, spec } = this;
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const wheelOffsets = [
      { x: spec.lf, y: -spec.track / 2 },
      { x: spec.lf, y: spec.track / 2 },
      { x: -spec.lr, y: -spec.track / 2 },
      { x: -spec.lr, y: spec.track / 2 },
    ];
    const slipMag = [debug.slipMagF, debug.slipMagF, debug.slipMagR, debug.slipMagR];
    const speedMag = Math.hypot(state.vx, state.vy);

    for (let i = 0; i < 4; i++) {
      const off = wheelOffsets[i];
      const wx = state.x + off.x * cy - off.y * sy;
      const wy = state.y + off.x * sy + off.y * cy;
      const slipping = slipMag[i] > 0.18 && speedMag > 0.5;

      if (slipping) {
        const last = this.lastWheelPos[i];
        if (last) {
          this.skidSegments.push({
            x1: last.x, y1: last.y, x2: wx, y2: wy,
            t: this.simTime,
            a: Math.min(0.85, slipMag[i] * 1.1 + 0.15),
          });
          if (this.skidSegments.length > CONFIG.skidMaxSegs) this.skidSegments.shift();
        }
        this.lastWheelPos[i] = { x: wx, y: wy };

        if (this.smokeParticles.length < CONFIG.particleMax) {
          const rate = Math.min(3, slipMag[i] * 2.5);
          if (Math.random() < rate * 0.45) {
            const vWorldX = state.vx * cy - state.vy * sy;
            const vWorldY = state.vx * sy + state.vy * cy;
            this.smokeParticles.push({
              x: wx + (Math.random() - 0.5) * 0.6,
              y: wy + (Math.random() - 0.5) * 0.6,
              vx: -vWorldX * 0.15 + (Math.random() - 0.5) * 2,
              vy: -vWorldY * 0.15 + (Math.random() - 0.5) * 2,
              r: 0.4 + Math.random() * 0.5,
              life: 1.0,
              decay: 0.012 + Math.random() * 0.012,
            });
          }
        }
      } else {
        this.lastWheelPos[i] = null;
      }
    }

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2 * dt);
      p.vy *= Math.exp(-2 * dt);
      p.r += 1.4 * dt;
      p.life -= p.decay * (dt * 60);
      if (p.life <= 0) this.smokeParticles.splice(i, 1);
    }

    const cutoff = this.simTime - CONFIG.skidLifeSec;
    while (this.skidSegments.length && this.skidSegments[0].t < cutoff) this.skidSegments.shift();
  }

  private publish(): void {
    const { state, debug, aids, lap, inputs, visual, spec } = this;

    let label = 'CRUISE', cls = '';
    const absAR = Math.abs(debug.alphaR), absAF = Math.abs(debug.alphaF);
    const isSpin = (absAR > 0.7 || absAF > 0.7) && Math.abs(state.yawRate) > 1.5;
    if (!debug.onTrack) { label = 'OFF TRACK'; cls = 'under'; }
    else if (isSpin) { label = 'SPIN!'; cls = 'spin'; }
    else if (debug.wheelspin && absAR > 0.2) { label = 'POWER OVER'; cls = 'power'; }
    else if (debug.wheelspin) { label = 'WHEELSPIN'; cls = 'wspin'; }
    else if (absAR > 0.2) { label = 'DRIFT'; cls = 'drift'; }
    else if (absAF > 0.18 && Math.abs(state.steer) > 0.15) { label = 'UNDERSTEER'; cls = 'under'; }

    const gLat = state.ay / 9.81, gLon = state.ax / 9.81;
    const G_SCALE = 38;
    const gMag = Math.hypot(gLat, gLon);
    const gClamp = gMag > 1.45 ? 1.45 / gMag : 1;
    visual.gDispX += (gLat * G_SCALE * gClamp - visual.gDispX) * 0.25;
    visual.gDispY += (gLon * G_SCALE * gClamp - visual.gDispY) * 0.25;
    visual.gTrailX += (visual.gDispX - visual.gTrailX) * 0.08;
    visual.gTrailY += (visual.gDispY - visual.gTrailY) * 0.08;

    // 레브 LED — 차종 RPM 범위에 맞게 정규화
    const ledLo = spec.maxRpm * 0.42;
    const ledHi = spec.maxRpm * 0.97;
    const revFrac = (state.engineRpm - ledLo) / (ledHi - ledLo);
    const speed = Math.hypot(state.vx, state.vy);

    if (this.lapDirty) {
      this.historySnapshot = [...lap.history];
      this.lapDirty = false;
    }

    const gearLabel = spec.ev
      ? (state.gear === -1 ? 'R' : state.gear === 0 ? 'N' : 'D')
      : (state.gear === -1 ? 'R' : state.gear === 0 ? 'N' : String(state.gear));

    const t: Telemetry = {
      speedKmh: Math.abs(state.vx * 3.6),
      gearLabel,
      rpm: Math.round(state.engineRpm),
      rpmFrac: Math.min(1, state.engineRpm / spec.maxRpm),
      redlineFrac: spec.redline / spec.maxRpm,
      shiftLight: state.engineRpm >= spec.redline,
      revCut: state.revCut,
      ledsOn: Math.max(0, Math.min(12, Math.floor(revFrac * 12 + 0.5))),
      alphaF: debug.alphaF,
      alphaR: debug.alphaR,
      kappaR: debug.kappaR,
      statusLabel: label,
      statusCls: cls,
      gDispX: Math.round(visual.gDispX * 10) / 10,
      gDispY: Math.round(visual.gDispY * 10) / 10,
      gTrailX: Math.round(visual.gTrailX * 10) / 10,
      gTrailY: Math.round(visual.gTrailY * 10) / 10,
      gMag,
      speedFx: Math.min(1, speed / 45),
      throttle: inputs.throttle,
      brake: inputs.brake,
      steer: state.steer,
      tireTempF: state.tireTempF,
      tireTempR: state.tireTempR,
      tireWearF: state.tireWearF,
      tireWearR: state.tireWearR,
      brakeTempF: state.brakeTempF,
      brakeTempR: state.brakeTempR,
      brakeFadeStart: spec.brakeFadeStart,
      absOn: aids.abs,
      tcOn: aids.tc,
      escOn: aids.esc,
      tcLevel: aids.tcLevel,
      absActive: state.absActiveF || state.absActiveR,
      tcActive: state.tcActive,
      escActive: state.escActive,
      lapNum: lap.num,
      lapReady: lap.ready,
      lapRunning: lap.startMs !== null,
      lapCurrentSec: lap.current,
      lapBestSec: lap.best,
      lapLastSec: lap.last,
      lapHistory: this.historySnapshot,
      posX: state.x,
      posY: state.y,
      yawDeg: state.yaw * 180 / Math.PI,
      carNx: Math.round(this.carNx * 50) / 50,
      carNy: Math.round(this.carNy * 50) / 50,
      countdown: Math.round(Math.max(-1, this.countdownLeft()) * 10) / 10,
    };
    useStore.getState().setTelemetry(t);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const rawDt = Math.min(CONFIG.maxDt, (now - this.lastT) / 1000);
    this.lastT = now;

    this.readInputs();
    const dt = rawDt / CONFIG.substeps;
    const isOn = (x: number, y: number) => this.track.isOnTrack(x, y);
    for (let i = 0; i < CONFIG.substeps; i++) {
      step(dt, this.spec, this.state, this.inputs, this.aids, this.debug, this.visual, isOn);
    }

    this.simTime += rawDt;
    this.spawnSkidsAndSmoke(rawDt);
    this.updateLapTiming();
    this.renderer?.render(this, rawDt);
    this.audio.update({
      volume: this.inputs.volume,
      rpm: this.state.engineRpm,
      throttle: this.inputs.throttle,
      revCut: this.state.revCut,
      slipMag: Math.max(this.debug.slipMagF, this.debug.slipMagR),
      speed: Math.hypot(this.state.vx, this.state.vy),
    });
    this.publish();

    this.rafId = requestAnimationFrame(this.frame);
  };
}

let instance: Simulation | null = null;
export function getSimulation(): Simulation {
  if (!instance) instance = new Simulation();
  return instance;
}
