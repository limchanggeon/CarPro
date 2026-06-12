// 차량 물리 — Pacejka 결합 슬립, 파워트레인, 브레이크 열역학, 보조장비
// legacy v3 엔진의 1:1 TS 포팅 (파라미터/수식 동일)

import { SPEC, TRACK_META } from './constants';

export interface CarState {
  x: number; y: number; yaw: number;
  vx: number; vy: number; yawRate: number;
  ax: number; ay: number;
  omegaF: number; omegaR: number;
  engineRpm: number; gear: number; prevGear: number;
  steer: number;
  revCut: boolean;
  tireTempF: number; tireTempR: number;
  tireWearF: number; tireWearR: number;
  brakeTempF: number; brakeTempR: number;
  absActiveF: boolean; absActiveR: boolean;
  tcActive: boolean; escActive: boolean;
}

export interface SimInputs {
  throttle: number; brake: number; hand: boolean;
  steerCmd: number;
  mu: number; maxSteer: number; volume: number;
}

export interface AidSettings {
  abs: boolean; tc: boolean; tcLevel: number; esc: boolean;
}

export interface DebugState {
  kappaF: number; kappaR: number;
  alphaF: number; alphaR: number;
  slipMagF: number; slipMagR: number;
  wheelspin: boolean; onTrack: boolean;
}

export interface VisualState {
  pitch: number; pitchRate: number;
  roll: number; rollRate: number;
  wheelAngleF: number; wheelAngleR: number;
  camAheadX: number; camAheadY: number;
  shakeImpulse: number;
  gDispX: number; gDispY: number; gTrailX: number; gTrailY: number;
}

interface PacejkaCoef { B: number; C: number; E: number }

function pacejkaCore(slip: number, Fz: number, mu: number, P: PacejkaCoef): number {
  if (Fz < 1) return 0;
  const D = mu * Fz;
  const Bs = P.B * slip;
  return D * Math.sin(P.C * Math.atan(Bs - P.E * (Bs - Math.atan(Bs))));
}

// 비대칭 가우시안: cold σ=55(완만) / hot σ=22(가파름) + 마모 페널티
export function tireGripFactor(temp: number, wear: number): number {
  const dev = temp - SPEC.tireOptimalTemp;
  const sigma = dev < 0 ? SPEC.tireTempWindowCold : SPEC.tireTempWindowHot;
  const x = dev / sigma;
  const tempMu = SPEC.tireMinMu + (1 - SPEC.tireMinMu) * Math.exp(-x * x);
  return tempMu * (1 - wear * SPEC.tireWearGripFactor);
}

// 500~700°C 소프트 니, 이후 가파른 페이드
export function brakeFadeFactor(temp: number): number {
  if (temp < SPEC.brakeFadeStart) return 1.0;
  const excess = temp - SPEC.brakeFadeStart;
  if (temp < SPEC.brakeFadeKnee) return 1 - excess * 0.0008;
  const past = temp - SPEC.brakeFadeKnee;
  return Math.max(SPEC.brakeFadeMin, 0.84 - past * 0.004);
}

function safeAlpha(vy_w: number, vx_w: number, vEps: number): number {
  if (Math.hypot(vx_w, vy_w) < vEps) return 0;
  const vx_safe = Math.abs(vx_w) > vEps ? vx_w : (Math.sign(vx_w) || 1) * vEps;
  return Math.atan2(vy_w, vx_safe);
}

// σ 방법 — 종/횡 결합 슬립
function combinedTireForce(kappa: number, alpha: number, Fz: number, mu: number) {
  const sigmaX = kappa / (1 + Math.abs(kappa));
  const sigmaY = Math.sin(alpha) / (1 + Math.abs(kappa));
  const sigma = Math.hypot(sigmaX, sigmaY);
  if (sigma < 1e-5) return { Fx: 0, Fy: 0 };
  const Fxp = pacejkaCore(sigma, Fz, mu, SPEC.pacejkaLong);
  const Fyp = pacejkaCore(sigma, Fz, mu, SPEC.pacejkaLat);
  return { Fx: Fxp * (sigmaX / sigma), Fy: -Fyp * (sigmaY / sigma) };
}

// GR86 FA24 실 dyno 보간 토크 커브 (4000rpm dip 포함)
export function engineTorque(rpm: number): number {
  if (rpm < 200 || rpm > SPEC.maxRpm) return 0;
  const peak = SPEC.peakTorque;
  if (rpm < 700) return 25 + (75 - 25) * (rpm - 200) / 500;
  if (rpm < 1500) return 75 + (185 - 75) * (rpm - 700) / 800;
  if (rpm < 2500) return 185 + (215 - 185) * (rpm - 1500) / 1000;
  if (rpm < 3700) return 215 + (peak - 215) * (rpm - 2500) / 1200;
  if (rpm < 4200) {
    const u = (rpm - 4000) / 200;
    return peak - 18 * Math.exp(-u * u);
  }
  if (rpm < 6500) return 245 + 5 * Math.sin(((rpm - 4200) / 2300) * Math.PI);
  if (rpm < 7400) return 250 - (250 - 195) * (rpm - 6500) / 900;
  return 195 * (1 - (rpm - 7400) / 100);
}

export function createCarState(startX: number, startY: number, startYaw: number): CarState {
  return {
    x: startX, y: startY, yaw: startYaw,
    vx: 0, vy: 0, yawRate: 0, ax: 0, ay: 0,
    omegaF: 0, omegaR: 0,
    engineRpm: SPEC.idleRpm, gear: 0, prevGear: 0,
    steer: 0, revCut: false,
    tireTempF: SPEC.tireStartTemp, tireTempR: SPEC.tireStartTemp,
    tireWearF: 0, tireWearR: 0,
    brakeTempF: SPEC.tireAmbient, brakeTempR: SPEC.tireAmbient,
    absActiveF: false, absActiveR: false, tcActive: false, escActive: false,
  };
}

export function step(
  dt: number,
  state: CarState,
  inputs: SimInputs,
  aids: AidSettings,
  debug: DebugState,
  visual: VisualState,
  isOnTrack: (x: number, y: number) => boolean,
): void {
  const { throttle, brake, hand, steerCmd, mu, maxSteer } = inputs;

  // ─── 조향: 속도 센서티브 + 레이트 리미트 ───
  const speedFactor = 1 / (1 + Math.abs(state.vx) * 0.045);
  const steerTarget = steerCmd * maxSteer * speedFactor;
  const steerRate = 4.5;
  const dSteer = steerTarget - state.steer;
  const maxDStep = steerRate * dt;
  state.steer += Math.max(-maxDStep, Math.min(maxDStep, dSteer));

  // ─── 기어 시프트 ───
  if (state.gear !== state.prevGear) {
    const ratioNew = state.gear === 0 ? 0 : SPEC.gears[state.gear + 1] * SPEC.finalDrive;
    if (state.prevGear === 0 && state.gear !== 0) {
      // N → 기어: 클러치 덤프 — 각운동량 보존
      const omegaEng = state.engineRpm * Math.PI / 30;
      const r = ratioNew;
      const I_w_eff = SPEC.I_wheel_R + SPEC.mass * SPEC.wheelRadius * SPEC.wheelRadius;
      state.omegaR = (I_w_eff * state.omegaR + SPEC.I_eng * r * omegaEng)
                  / (I_w_eff + SPEC.I_eng * r * r);
      state.engineRpm = Math.max(SPEC.idleRpm, Math.abs(state.omegaR * r) * 30 / Math.PI);
    } else if (state.prevGear !== 0 && state.gear !== 0) {
      // 기어 → 기어: 휠 속도 유지, 엔진 RPM 새 기어비로 일치
      state.engineRpm = Math.max(SPEC.idleRpm,
        Math.min(SPEC.maxRpm + 500, Math.abs(state.omegaR * ratioNew) * 30 / Math.PI));
    }
    state.prevGear = state.gear;
  }

  // ─── 레브 리미터 히스테리시스 ───
  if (state.engineRpm >= SPEC.maxRpm) state.revCut = true;
  else if (state.engineRpm < SPEC.maxRpm - 250) state.revCut = false;

  // ─── 엔진 RPM 동역학 ───
  const freeSpin = () => {
    const omegaEng = state.engineRpm * Math.PI / 30;
    const omegaIdle = SPEC.idleRpm * Math.PI / 30;
    const effectiveThrottle = state.revCut ? 0 : throttle;
    const T_comb = effectiveThrottle * engineTorque(state.engineRpm);
    const T_idle = throttle < 0.02 ? Math.max(0, (omegaIdle - omegaEng) * 2.5) : 0;
    const b = 0.06;
    const T_drag = throttle < 0.02 ? 1.5 : 0;
    const num = omegaEng + ((T_comb + T_idle - T_drag) / SPEC.I_eng) * dt;
    const den = 1 + (b / SPEC.I_eng) * dt;
    state.engineRpm = Math.max(200, Math.min(SPEC.maxRpm + 200, (num / den) * 30 / Math.PI));
  };
  if (state.gear !== 0) {
    const ratio = SPEC.gears[state.gear + 1] * SPEC.finalDrive;
    const coupled = Math.abs(state.omegaR * ratio) * 30 / Math.PI;
    if (coupled < SPEC.idleRpm) freeSpin();          // 클러치 자동 슬립
    else state.engineRpm = Math.min(SPEC.maxRpm + 400, coupled);
  } else {
    freeSpin();
  }

  // ─── 구동 토크 (후륜) ───
  let Tdrive = 0;
  if (state.gear !== 0) {
    const ratio = SPEC.gears[state.gear + 1] * SPEC.finalDrive;
    const coupled = Math.abs(state.omegaR * ratio) * 30 / Math.PI;
    const effThrottle = state.revCut ? 0 : throttle;
    const surfacePower = isOnTrack(state.x, state.y) ? 1.0 : TRACK_META.offTrackEnginePenalty;

    if (coupled < SPEC.idleRpm) {
      const slipFraction = Math.max(0, Math.min(1, (state.engineRpm - 600) / 1500));
      const T_eng = effThrottle * engineTorque(state.engineRpm) * surfacePower;
      const T_demand = T_eng * slipFraction;
      const T_clutch = Math.sign(T_demand) * Math.min(Math.abs(T_demand), SPEC.clutchMaxTorque);
      Tdrive = T_clutch * ratio * SPEC.drivelineEff;
    } else {
      const T_eng = effThrottle * engineTorque(state.engineRpm) * surfacePower;
      const T_clutch = Math.sign(T_eng) * Math.min(Math.abs(T_eng), SPEC.clutchMaxTorque);
      Tdrive = T_clutch * ratio * SPEC.drivelineEff;
      // 엔진 브레이크 — 실측 FMEP 기반 (0.055ω+3, 60Nm cap)
      if (throttle < 0.2 && Math.abs(state.omegaR) > 0.5) {
        const motorRamp = Math.pow(1 - throttle * 5, 2);
        const omegaEng = Math.abs(state.omegaR * ratio);
        const T_motor = Math.min(0.055 * omegaEng + 3.0, 60);
        Tdrive -= T_motor * Math.abs(ratio) * Math.sign(state.omegaR) * motorRamp;
      }
    }
  }

  // ─── 휠 좌표계 속도 ───
  const vyF = state.vy + SPEC.lf * state.yawRate;
  const vyR = state.vy - SPEC.lr * state.yawRate;
  const cs = Math.cos(state.steer), ss = Math.sin(state.steer);
  const vxF_w = state.vx * cs + vyF * ss;
  const vyF_w = -state.vx * ss + vyF * cs;
  const vxR_w = state.vx;
  const vyR_w = vyR;

  // ─── 수직 하중 — 종방향 LT + 양력 ───
  const wb = SPEC.wheelbase;
  const LT_long = SPEC.mass * state.ax * SPEC.cgHeight / wb;
  const speedSq = state.vx * state.vx;
  const Faero_z = SPEC.aeroLiftCoef * speedSq;
  const FzF_static = SPEC.mass * 9.81 * SPEC.lr / wb + Faero_z * SPEC.aeroLiftFrontFrac;
  const FzR_static = SPEC.mass * 9.81 * SPEC.lf / wb + Faero_z * (1 - SPEC.aeroLiftFrontFrac);
  const FzF = Math.max(0, FzF_static - LT_long);
  const FzR = Math.max(0, FzR_static + LT_long);

  const onTrack = isOnTrack(state.x, state.y);
  const surfaceMu = onTrack ? 1.0 : TRACK_META.offTrackMu;
  debug.onTrack = onTrack;

  const muBase = mu * surfaceMu;
  const muF_temp = muBase * tireGripFactor(state.tireTempF, state.tireWearF);
  const muR_temp = muBase * tireGripFactor(state.tireTempR, state.tireWearR);

  // ─── 횡방향 LT: load-sensitive μ (4-corner lite, ARB 분배) ───
  const Fz_ref = SPEC.mass * 9.81 / 4;
  const dFz_lat_total = SPEC.mass * Math.abs(state.ay) * SPEC.cgHeight / SPEC.track;
  const dFz_lat_F = dFz_lat_total * SPEC.arbBalanceFront;
  const dFz_lat_R = dFz_lat_total * (1 - SPEC.arbBalanceFront);
  const axleEffectiveMu = (muSrc: number, FzAxle: number, dFzLat: number): number => {
    if (FzAxle < 10) return 0;
    const Fz_o_raw = FzAxle / 2 + dFzLat;
    const Fz_i_raw = FzAxle / 2 - dFzLat;
    const muLifted = muSrc * Math.pow(FzAxle / Fz_ref, -SPEC.loadSensitivity);
    if (Fz_i_raw <= 100) return muLifted;
    const mu_o = muSrc * Math.pow(Fz_o_raw / Fz_ref, -SPEC.loadSensitivity);
    const mu_i = muSrc * Math.pow(Fz_i_raw / Fz_ref, -SPEC.loadSensitivity);
    const muBoth = Math.min((mu_o * Fz_o_raw + mu_i * Fz_i_raw) / FzAxle, muSrc * 1.2);
    if (Fz_i_raw < 400) {
      const t = (Fz_i_raw - 100) / 300;
      return muLifted + (muBoth - muLifted) * t;
    }
    return muBoth;
  };
  const muF = axleEffectiveMu(muF_temp, FzF, dFz_lat_F);
  const muR = axleEffectiveMu(muR_temp, FzR, dFz_lat_R);

  // ─── 슬립비/슬립각 ───
  const vEps = 0.5;
  const denomF = Math.abs(vxF_w) > vEps ? vxF_w : (Math.sign(vxF_w) || 1) * vEps;
  const denomR = Math.abs(vxR_w) > vEps ? vxR_w : (Math.sign(vxR_w) || 1) * vEps;
  const kappaF = (state.omegaF * SPEC.wheelRadius - vxF_w) / Math.abs(denomF);
  const kappaR = (state.omegaR * SPEC.wheelRadius - vxR_w) / Math.abs(denomR);
  const alphaF = safeAlpha(vyF_w, vxF_w, vEps);
  const alphaR = safeAlpha(vyR_w, vxR_w, vEps);

  // ─── 트랙션 컨트롤 ───
  if (aids.tc && aids.tcLevel > 0 && state.gear !== 0 && Tdrive > 0) {
    const overSlip = Math.max(0, kappaR - SPEC.tcSlipThreshold[aids.tcLevel]);
    if (overSlip > 0) {
      Tdrive *= Math.max(0, 1 - overSlip * SPEC.tcCutFactor);
      state.tcActive = true;
    } else state.tcActive = false;
  } else state.tcActive = false;

  // ─── 타이어 힘 ───
  const tireF = combinedTireForce(kappaF, alphaF, FzF, muF);
  const tireR = combinedTireForce(kappaR, alphaR, FzR, muR);
  const FxF_w = tireF.Fx, FyF_w = tireF.Fy;
  const FxR_w = tireR.Fx, FyR_w = tireR.Fy;

  // 휠 → 차체
  const FxF_b = FxF_w * cs - FyF_w * ss;
  const FyF_b = FxF_w * ss + FyF_w * cs;

  // ─── 브레이크 페이드 + EBD ───
  const fadeF = brakeFadeFactor(state.brakeTempF);
  const fadeR = brakeFadeFactor(state.brakeTempR);
  const FzTotal = Math.max(1, FzF + FzR);
  const dynBiasF = FzF / FzTotal;
  const dynBiasF_static = SPEC.lr / SPEC.wheelbase;
  const brakeFRatio = SPEC.brakeStaticBias + (dynBiasF - dynBiasF_static) * SPEC.brakeBiasDynamic;
  let Tbrake_F = brake * SPEC.brakeMaxTotal * brakeFRatio * fadeF;
  let Tbrake_R = brake * SPEC.brakeMaxTotal * (1 - brakeFRatio) * fadeR;
  if (hand) Tbrake_R += SPEC.handbrakeForce;

  const brakeTorqueLimited = (Tmax: number, omega: number, I_w: number): number => {
    if (Tmax < 1 || Math.abs(omega) < 0.05) return 0;
    const cap = Math.abs(omega) * I_w / dt;
    return Math.sign(omega) * Math.min(Tmax, cap);
  };

  // ─── ABS ───
  if (aids.abs) {
    const absF = Math.max(0, Math.abs(kappaF) - SPEC.absSlipThreshold);
    const absR = Math.max(0, Math.abs(kappaR) - SPEC.absSlipThreshold);
    if (absF > 0) {
      const cut = Math.max(0, 1 - absF * SPEC.absModulation);
      Tbrake_F *= cut;
      state.absActiveF = cut < 0.95;
    } else state.absActiveF = false;
    if (absR > 0) {
      const handPart = hand ? SPEC.handbrakeForce : 0;
      const cut = Math.max(0, 1 - absR * SPEC.absModulation);
      Tbrake_R = (Tbrake_R - handPart) * cut + handPart;
      state.absActiveR = cut < 0.95;
    } else state.absActiveR = false;
  } else {
    state.absActiveF = false;
    state.absActiveR = false;
  }

  // ─── 휠 회전 적분 ───
  const T_F = -brakeTorqueLimited(Tbrake_F, state.omegaF, SPEC.I_wheel_F) - FxF_w * SPEC.wheelRadius;
  const T_R = Tdrive - brakeTorqueLimited(Tbrake_R, state.omegaR, SPEC.I_wheel_R) - FxR_w * SPEC.wheelRadius;
  const omegaF_prev = state.omegaF, omegaR_prev = state.omegaR;
  state.omegaF += T_F / SPEC.I_wheel_F * dt;
  state.omegaR += T_R / SPEC.I_wheel_R * dt;

  // 저속 발진 가드 — no-slip 점 통과 시 스냅 (explicit Euler 진동 방지)
  const noSlipF = vxF_w / SPEC.wheelRadius;
  const noSlipR = vxR_w / SPEC.wheelRadius;
  if ((omegaF_prev - noSlipF) * (state.omegaF - noSlipF) < 0 && Tbrake_F < 50) state.omegaF = noSlipF;
  if ((omegaR_prev - noSlipR) * (state.omegaR - noSlipR) < 0 && Math.abs(Tdrive) < 100 && Tbrake_R < 50) state.omegaR = noSlipR;

  if (brake > 0.3 && Math.abs(vxF_w) < 0.4 && Math.abs(state.omegaF) < 1.5) state.omegaF = 0;
  if (brake > 0.3 && Math.abs(vxR_w) < 0.4 && Math.abs(state.omegaR) < 1.5 && Math.abs(Tdrive) < 50) state.omegaR = 0;

  // ─── 항력 + 구름저항 ───
  const vMag = Math.hypot(state.vx, state.vy);
  const aeroX = -SPEC.aeroDragCoef * vMag * state.vx;
  const aeroY = -SPEC.aeroDragCoef * vMag * state.vy;
  const surfaceRollMult = onTrack ? 1.0 : TRACK_META.offTrackRollMult;
  const offTrackDrag = onTrack ? 0 : -Math.sign(state.vx) * state.vx * state.vx * TRACK_META.offTrackDragCoef;
  const rollFx = -SPEC.rollResist * surfaceRollMult * Math.tanh(state.vx * SPEC.rollResistVelScale) + offTrackDrag;

  // ─── 차체 운동방정식 (bicycle) ───
  const Fx_body = FxF_b + FxR_w + aeroX + rollFx;
  const Fy_body = FyF_b + FyR_w + aeroY;
  const Mz = SPEC.lf * FyF_b - SPEC.lr * FyR_w;

  state.vx += (Fx_body / SPEC.mass + state.vy * state.yawRate) * dt;
  state.vy += (Fy_body / SPEC.mass - state.vx * state.yawRate) * dt;
  state.yawRate += Mz / SPEC.inertia * dt;

  // ─── ESC — yaw rate error 기반 가상 휠 브레이크 ───
  state.escActive = false;
  if (aids.esc && Math.abs(state.vx) > 2.0) {
    const yawTarget = Math.tan(state.steer) * state.vx / SPEC.wheelbase;
    const yawErr = state.yawRate - yawTarget;
    const errMag = Math.abs(yawErr) - SPEC.escYawRateError;
    if (errMag > 0) {
      const brakeForceVirtual = Math.min(SPEC.escBrakeForceMax, errMag * 18000);
      const Mz_esc = -Math.sign(yawErr) * brakeForceVirtual * (SPEC.track / 2);
      state.yawRate += (Mz_esc / SPEC.inertia) * dt;
      const decelEsc = brakeForceVirtual * 0.35 / SPEC.mass;
      state.vx -= Math.sign(state.vx) * decelEsc * dt;
      state.escActive = true;
    }
  }

  state.ax = Fx_body / SPEC.mass;
  state.ay = Fy_body / SPEC.mass;

  // ─── 타이어 열역학 ───
  const speedMag = Math.hypot(state.vx, state.vy);
  const slipVxF = state.omegaF * SPEC.wheelRadius - vxF_w;
  const slipVxR = state.omegaR * SPEC.wheelRadius - vxR_w;
  const slipPowF_pure = Math.abs(FxF_w * slipVxF) + Math.abs(FyF_w * vyF_w);
  const slipPowR_pure = Math.abs(FxR_w * slipVxR) + Math.abs(FyR_w * vyR_w);
  const rollHeat = SPEC.tireRollHeat * speedMag;
  const slipPowF = slipPowF_pure + rollHeat;
  const slipPowR = slipPowR_pure + rollHeat;

  const forcedCool = speedMag > 1.0 ? Math.pow(speedMag, SPEC.tireCoolSpeedExp) * SPEC.tireCoolSpeed : 0;
  const coolFactor = SPEC.tireCoolBase + forcedCool;
  state.tireTempF += (slipPowF * SPEC.tireHeatCoef - (state.tireTempF - SPEC.tireAmbient) * coolFactor) * dt;
  state.tireTempR += (slipPowR * SPEC.tireHeatCoef - (state.tireTempR - SPEC.tireAmbient) * coolFactor) * dt;

  const slipExcessF = Math.max(0, Math.abs(kappaF) - SPEC.tireWearKappaThreshold)
                    + Math.max(0, Math.abs(alphaF) - SPEC.tireWearAlphaThreshold);
  const slipExcessR = Math.max(0, Math.abs(kappaR) - SPEC.tireWearKappaThreshold)
                    + Math.max(0, Math.abs(alphaR) - SPEC.tireWearAlphaThreshold);
  if (slipExcessF > 0) state.tireWearF = Math.min(1, state.tireWearF + slipPowF_pure * SPEC.tireWearCoef * slipExcessF * dt);
  if (slipExcessR > 0) state.tireWearR = Math.min(1, state.tireWearR + slipPowR_pure * SPEC.tireWearCoef * slipExcessR * dt);

  // ─── 브레이크 열역학 (m·c 모델) ───
  const brakeWorkF = Math.abs(Tbrake_F * state.omegaF);
  const brakeWorkR = Math.abs(Tbrake_R * state.omegaR);
  const brakeMC = SPEC.brakeMass * SPEC.brakeSpecHeat;
  const brakeForcedCool = speedMag > 0.5 ? Math.pow(speedMag, 0.8) : 0;
  const brakeCoolTerm = SPEC.brakeCoolBase + SPEC.brakeCoolSpeed * brakeForcedCool;
  state.brakeTempF += (brakeWorkF - (state.brakeTempF - SPEC.tireAmbient) * brakeCoolTerm * SPEC.brakeArea) / brakeMC * dt;
  state.brakeTempR += (brakeWorkR - (state.brakeTempR - SPEC.tireAmbient) * brakeCoolTerm * SPEC.brakeArea) / brakeMC * dt;

  // ─── 위치 적분 ───
  const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
  state.x += (state.vx * cy - state.vy * sy) * dt;
  state.y += (state.vx * sy + state.vy * cy) * dt;
  state.yaw += state.yawRate * dt;
  if (state.yaw > Math.PI) state.yaw -= 2 * Math.PI;
  else if (state.yaw < -Math.PI) state.yaw += 2 * Math.PI;

  // ─── 디버그 ───
  debug.kappaF = kappaF; debug.kappaR = kappaR;
  debug.alphaF = alphaF; debug.alphaR = alphaR;
  debug.slipMagF = Math.hypot(kappaF, alphaF);
  debug.slipMagR = Math.hypot(kappaR, alphaR);
  debug.wheelspin = Math.abs(kappaR) > 0.3 && Math.abs(Tdrive) > 50;

  // ─── 시각 상태 (서스펜션 2차계 ζ≈0.5) ───
  const kPitch = 90, cPitch = 9.0;
  const kRoll = 110, cRoll = 10.5;
  visual.pitchRate += (kPitch * (-state.ax * 0.02 - visual.pitch) - cPitch * visual.pitchRate) * dt;
  visual.pitch += visual.pitchRate * dt;
  visual.rollRate += (kRoll * (-state.ay * 0.022 - visual.roll) - cRoll * visual.rollRate) * dt;
  visual.roll += visual.rollRate * dt;

  visual.wheelAngleF = (visual.wheelAngleF + state.omegaF * dt) % (Math.PI * 2);
  visual.wheelAngleR = (visual.wheelAngleR + state.omegaR * dt) % (Math.PI * 2);

  if (debug.wheelspin && Math.abs(state.omegaR) > 8) visual.shakeImpulse += 0.6 * dt;
  if (brake > 0.5 && Math.abs(state.vx) > 5 && (Math.abs(state.omegaF) < 0.5 || Math.abs(state.omegaR) < 0.5)) visual.shakeImpulse += 0.4 * dt;
  visual.shakeImpulse *= Math.exp(-3 * dt);
}
