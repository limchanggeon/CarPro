// 차량 물리 — Pacejka 결합 슬립, 파워트레인(ICE/EV), FWD/RWD/AWD, 열역학, 보조장비
// 모든 파라미터는 CarSpec으로 주입 — 차종 독립

import { CONFIG } from './constants';
import { CarSpec, PacejkaCoef, engineTorque } from './cars';

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

function pacejkaCore(slip: number, Fz: number, mu: number, P: PacejkaCoef): number {
  if (Fz < 1) return 0;
  const D = mu * Fz;
  const Bs = P.B * slip;
  return D * Math.sin(P.C * Math.atan(Bs - P.E * (Bs - Math.atan(Bs))));
}

export function tireGripFactor(temp: number, wear: number, spec: CarSpec): number {
  const dev = temp - spec.tireOptimalTemp;
  const sigma = dev < 0 ? spec.tireTempWindowCold : spec.tireTempWindowHot;
  const x = dev / sigma;
  const tempMu = spec.tireMinMu + (1 - spec.tireMinMu) * Math.exp(-x * x);
  return tempMu * (1 - wear * spec.tireWearGripFactor);
}

export function brakeFadeFactor(temp: number, spec: CarSpec): number {
  if (temp < spec.brakeFadeStart) return 1.0;
  const excess = temp - spec.brakeFadeStart;
  if (temp < spec.brakeFadeKnee) return 1 - excess * 0.0008;
  const past = temp - spec.brakeFadeKnee;
  return Math.max(spec.brakeFadeMin, 0.84 - past * 0.004);
}

function safeAlpha(vy_w: number, vx_w: number, vEps: number): number {
  if (Math.hypot(vx_w, vy_w) < vEps) return 0;
  const vx_safe = Math.abs(vx_w) > vEps ? vx_w : (Math.sign(vx_w) || 1) * vEps;
  return Math.atan2(vy_w, vx_safe);
}

function combinedTireForce(kappa: number, alpha: number, Fz: number, mu: number, spec: CarSpec) {
  const sigmaX = kappa / (1 + Math.abs(kappa));
  const sigmaY = Math.sin(alpha) / (1 + Math.abs(kappa));
  const sigma = Math.hypot(sigmaX, sigmaY);
  if (sigma < 1e-5) return { Fx: 0, Fy: 0 };
  const Fxp = pacejkaCore(sigma, Fz, mu, spec.pacejkaLong);
  const Fyp = pacejkaCore(sigma, Fz, mu, spec.pacejkaLat);
  return { Fx: Fxp * (sigmaX / sigma), Fy: -Fyp * (sigmaY / sigma) };
}

export function createCarState(spec: CarSpec, startX: number, startY: number, startYaw: number): CarState {
  return {
    x: startX, y: startY, yaw: startYaw,
    vx: 0, vy: 0, yawRate: 0, ax: 0, ay: 0,
    omegaF: 0, omegaR: 0,
    engineRpm: spec.ev ? 0 : spec.idleRpm, gear: 0, prevGear: 0,
    steer: 0, revCut: false,
    tireTempF: spec.tireStartTemp, tireTempR: spec.tireStartTemp,
    tireWearF: 0, tireWearR: 0,
    brakeTempF: spec.tireAmbient, brakeTempR: spec.tireAmbient,
    absActiveF: false, absActiveR: false, tcActive: false, escActive: false,
  };
}

export function step(
  dt: number,
  spec: CarSpec,
  state: CarState,
  inputs: SimInputs,
  aids: AidSettings,
  debug: DebugState,
  visual: VisualState,
  isOnTrack: (x: number, y: number) => boolean,
): void {
  const { throttle, brake, hand, steerCmd, mu, maxSteer } = inputs;

  // 구동 배분
  const driveF = spec.drive === 'FWD' ? 1 : spec.drive === 'AWD' ? spec.awdFrontSplit : 0;
  const driveR = 1 - driveF;
  const omegaDrive = state.omegaF * driveF + state.omegaR * driveR;

  // ─── 조향 ───
  const speedFactor = 1 / (1 + Math.abs(state.vx) * 0.045);
  const steerTarget = steerCmd * maxSteer * speedFactor;
  const maxDStep = 4.5 * dt;
  state.steer += Math.max(-maxDStep, Math.min(maxDStep, steerTarget - state.steer));

  // ─── 기어 시프트 ───
  if (state.gear !== state.prevGear) {
    const ratioNew = state.gear === 0 ? 0 : spec.gears[state.gear + 1] * spec.finalDrive;
    if (!spec.ev && state.prevGear === 0 && state.gear !== 0) {
      // N → 기어: 클러치 덤프 — 각운동량 보존 (구동축별 배분)
      const omegaEng = state.engineRpm * Math.PI / 30;
      const r = ratioNew;
      const applyDump = (omega: number, I_w: number, share: number): number => {
        if (share < 0.01) return omega;
        const I_eff = I_w + spec.mass * spec.wheelRadius * spec.wheelRadius * share;
        return (I_eff * omega + spec.I_eng * r * omegaEng * share) / (I_eff + spec.I_eng * r * r * share);
      };
      state.omegaF = applyDump(state.omegaF, spec.I_wheel_F, driveF);
      state.omegaR = applyDump(state.omegaR, spec.I_wheel_R, driveR);
      const newDrive = state.omegaF * driveF + state.omegaR * driveR;
      state.engineRpm = Math.max(spec.idleRpm, Math.abs(newDrive * r) * 30 / Math.PI);
    } else if (!spec.ev && state.prevGear !== 0 && state.gear !== 0) {
      state.engineRpm = Math.max(spec.idleRpm,
        Math.min(spec.maxRpm + 500, Math.abs(omegaDrive * ratioNew) * 30 / Math.PI));
    }
    state.prevGear = state.gear;
  }

  // ─── 레브 리미터 ───
  if (state.engineRpm >= spec.maxRpm) state.revCut = true;
  else if (state.engineRpm < spec.maxRpm - 250) state.revCut = false;

  // ─── 엔진 RPM 동역학 + 구동 토크 ───
  let Tdrive = 0;
  const surfacePower = isOnTrack(state.x, state.y) ? 1.0 : CONFIG.offTrackEnginePenalty;

  if (spec.ev) {
    // EV — 단일 감속비 직결, 회생제동
    if (state.gear !== 0) {
      const ratio = spec.gears[state.gear + 1] * spec.finalDrive;
      state.engineRpm = Math.min(spec.maxRpm + 200, Math.abs(omegaDrive * ratio) * 30 / Math.PI);
      const effThrottle = state.revCut ? 0 : throttle;
      let T_motor = effThrottle * engineTorque(state.engineRpm, spec) * surfacePower;
      if (throttle < 0.02 && Math.abs(omegaDrive) > 1) {
        T_motor -= spec.regenTorque * Math.sign(omegaDrive * ratio);
      }
      Tdrive = T_motor * ratio * spec.drivelineEff;
    } else {
      state.engineRpm = 0;
    }
  } else {
    // ICE
    const freeSpin = () => {
      const omegaEng = state.engineRpm * Math.PI / 30;
      const omegaIdle = spec.idleRpm * Math.PI / 30;
      const effectiveThrottle = state.revCut ? 0 : throttle;
      const T_comb = effectiveThrottle * engineTorque(state.engineRpm, spec);
      const T_idle = throttle < 0.02 ? Math.max(0, (omegaIdle - omegaEng) * 2.5) : 0;
      const b = 0.06;
      const T_drag = throttle < 0.02 ? 1.5 : 0;
      const num = omegaEng + ((T_comb + T_idle - T_drag) / spec.I_eng) * dt;
      const den = 1 + (b / spec.I_eng) * dt;
      state.engineRpm = Math.max(200, Math.min(spec.maxRpm + 200, (num / den) * 30 / Math.PI));
    };

    if (state.gear !== 0) {
      const ratio = spec.gears[state.gear + 1] * spec.finalDrive;
      const coupled = Math.abs(omegaDrive * ratio) * 30 / Math.PI;
      if (coupled < spec.idleRpm) freeSpin();
      else state.engineRpm = Math.min(spec.maxRpm + 400, coupled);

      const effThrottle = state.revCut ? 0 : throttle;
      if (coupled < spec.idleRpm) {
        const slipFraction = Math.max(0, Math.min(1, (state.engineRpm - 600) / 1500));
        const T_eng = effThrottle * engineTorque(state.engineRpm, spec) * surfacePower;
        const T_demand = T_eng * slipFraction;
        const T_clutch = Math.sign(T_demand) * Math.min(Math.abs(T_demand), spec.clutchMaxTorque);
        Tdrive = T_clutch * ratio * spec.drivelineEff;
      } else {
        const T_eng = effThrottle * engineTorque(state.engineRpm, spec) * surfacePower;
        const T_clutch = Math.sign(T_eng) * Math.min(Math.abs(T_eng), spec.clutchMaxTorque);
        Tdrive = T_clutch * ratio * spec.drivelineEff;
        if (throttle < 0.2 && Math.abs(omegaDrive) > 0.5) {
          const motorRamp = Math.pow(1 - throttle * 5, 2);
          const omegaEng = Math.abs(omegaDrive * ratio);
          const T_motor = Math.min(0.055 * omegaEng + 3.0, 60);
          Tdrive -= T_motor * Math.abs(ratio) * Math.sign(omegaDrive) * motorRamp;
        }
      }
    } else {
      freeSpin();
    }
  }

  // ─── 휠 좌표계 속도 ───
  const vyF = state.vy + spec.lf * state.yawRate;
  const vyR = state.vy - spec.lr * state.yawRate;
  const cs = Math.cos(state.steer), ss = Math.sin(state.steer);
  const vxF_w = state.vx * cs + vyF * ss;
  const vyF_w = -state.vx * ss + vyF * cs;
  const vxR_w = state.vx;
  const vyR_w = vyR;

  // ─── 수직 하중 — 종방향 LT + 에어로 ───
  const wb = spec.wheelbase;
  const LT_long = spec.mass * state.ax * spec.cgHeight / wb;
  const speedSq = state.vx * state.vx;
  const Faero_z = spec.aeroLiftCoef * speedSq;   // 양수 = 다운포스
  const FzF_static = spec.mass * 9.81 * spec.lr / wb + Faero_z * spec.aeroLiftFrontFrac;
  const FzR_static = spec.mass * 9.81 * spec.lf / wb + Faero_z * (1 - spec.aeroLiftFrontFrac);
  const FzF = Math.max(0, FzF_static - LT_long);
  const FzR = Math.max(0, FzR_static + LT_long);

  const onTrack = isOnTrack(state.x, state.y);
  const surfaceMu = onTrack ? 1.0 : CONFIG.offTrackMu;
  debug.onTrack = onTrack;

  const muBase = mu * surfaceMu * spec.gripMult;
  const muF_temp = muBase * tireGripFactor(state.tireTempF, state.tireWearF, spec);
  const muR_temp = muBase * tireGripFactor(state.tireTempR, state.tireWearR, spec);

  // ─── 횡방향 LT: load-sensitive μ ───
  const Fz_ref = spec.mass * 9.81 / 4;
  const dFz_lat_total = spec.mass * Math.abs(state.ay) * spec.cgHeight / spec.track;
  const dFz_lat_F = dFz_lat_total * spec.arbBalanceFront;
  const dFz_lat_R = dFz_lat_total * (1 - spec.arbBalanceFront);
  const axleEffectiveMu = (muSrc: number, FzAxle: number, dFzLat: number): number => {
    if (FzAxle < 10) return 0;
    const Fz_o_raw = FzAxle / 2 + dFzLat;
    const Fz_i_raw = FzAxle / 2 - dFzLat;
    const muLifted = muSrc * Math.pow(FzAxle / Fz_ref, -spec.loadSensitivity);
    if (Fz_i_raw <= 100) return muLifted;
    const mu_o = muSrc * Math.pow(Fz_o_raw / Fz_ref, -spec.loadSensitivity);
    const mu_i = muSrc * Math.pow(Fz_i_raw / Fz_ref, -spec.loadSensitivity);
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
  const kappaF = (state.omegaF * spec.wheelRadius - vxF_w) / Math.abs(denomF);
  const kappaR = (state.omegaR * spec.wheelRadius - vxR_w) / Math.abs(denomR);
  const alphaF = safeAlpha(vyF_w, vxF_w, vEps);
  const alphaR = safeAlpha(vyR_w, vxR_w, vEps);

  // ─── 트랙션 컨트롤 — 구동축 슬립 감시 ───
  const kappaDrive = Math.max(driveF > 0.01 ? kappaF : -Infinity, driveR > 0.01 ? kappaR : -Infinity);
  if (aids.tc && aids.tcLevel > 0 && state.gear !== 0 && Tdrive > 0) {
    const overSlip = Math.max(0, kappaDrive - spec.tcSlipThreshold[aids.tcLevel]);
    if (overSlip > 0) {
      Tdrive *= Math.max(0, 1 - overSlip * spec.tcCutFactor);
      state.tcActive = true;
    } else state.tcActive = false;
  } else state.tcActive = false;

  const TdriveF = Tdrive * driveF;
  const TdriveR = Tdrive * driveR;

  // ─── 타이어 힘 ───
  const tireF = combinedTireForce(kappaF, alphaF, FzF, muF, spec);
  const tireR = combinedTireForce(kappaR, alphaR, FzR, muR, spec);
  const FxF_w = tireF.Fx, FyF_w = tireF.Fy;
  const FxR_w = tireR.Fx, FyR_w = tireR.Fy;

  const FxF_b = FxF_w * cs - FyF_w * ss;
  const FyF_b = FxF_w * ss + FyF_w * cs;

  // ─── 브레이크 페이드 + EBD ───
  const fadeF = brakeFadeFactor(state.brakeTempF, spec);
  const fadeR = brakeFadeFactor(state.brakeTempR, spec);
  const FzTotal = Math.max(1, FzF + FzR);
  const dynBiasF = FzF / FzTotal;
  const dynBiasF_static = spec.lr / spec.wheelbase;
  const brakeFRatio = spec.brakeStaticBias + (dynBiasF - dynBiasF_static) * spec.brakeBiasDynamic;
  let Tbrake_F = brake * spec.brakeMaxTotal * brakeFRatio * fadeF;
  let Tbrake_R = brake * spec.brakeMaxTotal * (1 - brakeFRatio) * fadeR;
  if (hand) Tbrake_R += spec.handbrakeForce;

  const brakeTorqueLimited = (Tmax: number, omega: number, I_w: number): number => {
    if (Tmax < 1 || Math.abs(omega) < 0.05) return 0;
    const cap = Math.abs(omega) * I_w / dt;
    return Math.sign(omega) * Math.min(Tmax, cap);
  };

  // ─── ABS ───
  if (aids.abs) {
    const absF = Math.max(0, Math.abs(kappaF) - spec.absSlipThreshold);
    const absR = Math.max(0, Math.abs(kappaR) - spec.absSlipThreshold);
    if (absF > 0) {
      const cut = Math.max(0, 1 - absF * spec.absModulation);
      Tbrake_F *= cut;
      state.absActiveF = cut < 0.95;
    } else state.absActiveF = false;
    if (absR > 0) {
      const handPart = hand ? spec.handbrakeForce : 0;
      const cut = Math.max(0, 1 - absR * spec.absModulation);
      Tbrake_R = (Tbrake_R - handPart) * cut + handPart;
      state.absActiveR = cut < 0.95;
    } else state.absActiveR = false;
  } else {
    state.absActiveF = false;
    state.absActiveR = false;
  }

  // ─── 휠 회전 적분 ───
  const T_F = TdriveF - brakeTorqueLimited(Tbrake_F, state.omegaF, spec.I_wheel_F) - FxF_w * spec.wheelRadius;
  const T_R = TdriveR - brakeTorqueLimited(Tbrake_R, state.omegaR, spec.I_wheel_R) - FxR_w * spec.wheelRadius;
  const omegaF_prev = state.omegaF, omegaR_prev = state.omegaR;
  state.omegaF += T_F / spec.I_wheel_F * dt;
  state.omegaR += T_R / spec.I_wheel_R * dt;

  // 저속 발진 가드 — no-slip 스냅
  const noSlipF = vxF_w / spec.wheelRadius;
  const noSlipR = vxR_w / spec.wheelRadius;
  if ((omegaF_prev - noSlipF) * (state.omegaF - noSlipF) < 0 && Math.abs(TdriveF) < 100 && Tbrake_F < 50) state.omegaF = noSlipF;
  if ((omegaR_prev - noSlipR) * (state.omegaR - noSlipR) < 0 && Math.abs(TdriveR) < 100 && Tbrake_R < 50) state.omegaR = noSlipR;

  if (brake > 0.3 && Math.abs(vxF_w) < 0.4 && Math.abs(state.omegaF) < 1.5 && Math.abs(TdriveF) < 50) state.omegaF = 0;
  if (brake > 0.3 && Math.abs(vxR_w) < 0.4 && Math.abs(state.omegaR) < 1.5 && Math.abs(TdriveR) < 50) state.omegaR = 0;

  // ─── 항력 + 구름저항 ───
  const vMag = Math.hypot(state.vx, state.vy);
  const aeroX = -spec.aeroDragCoef * vMag * state.vx;
  const aeroY = -spec.aeroDragCoef * vMag * state.vy;
  const surfaceRollMult = onTrack ? 1.0 : CONFIG.offTrackRollMult;
  const offTrackDrag = onTrack ? 0 : -Math.sign(state.vx) * state.vx * state.vx * CONFIG.offTrackDragCoef;
  const rollFx = -spec.rollResist * surfaceRollMult * Math.tanh(state.vx * spec.rollResistVelScale) + offTrackDrag;

  // ─── 차체 운동방정식 ───
  const Fx_body = FxF_b + FxR_w + aeroX + rollFx;
  const Fy_body = FyF_b + FyR_w + aeroY;
  const Mz = spec.lf * FyF_b - spec.lr * FyR_w;

  state.vx += (Fx_body / spec.mass + state.vy * state.yawRate) * dt;
  state.vy += (Fy_body / spec.mass - state.vx * state.yawRate) * dt;
  state.yawRate += Mz / spec.inertia * dt;

  // ─── ESC ───
  state.escActive = false;
  if (aids.esc && Math.abs(state.vx) > 2.0) {
    const yawTarget = Math.tan(state.steer) * state.vx / spec.wheelbase;
    const yawErr = state.yawRate - yawTarget;
    const errMag = Math.abs(yawErr) - spec.escYawRateError;
    if (errMag > 0) {
      const brakeForceVirtual = Math.min(spec.escBrakeForceMax, errMag * 18000);
      const Mz_esc = -Math.sign(yawErr) * brakeForceVirtual * (spec.track / 2);
      state.yawRate += (Mz_esc / spec.inertia) * dt;
      const decelEsc = brakeForceVirtual * 0.35 / spec.mass;
      state.vx -= Math.sign(state.vx) * decelEsc * dt;
      state.escActive = true;
    }
  }

  state.ax = Fx_body / spec.mass;
  state.ay = Fy_body / spec.mass;

  // ─── 타이어 열역학 ───
  const speedMag = Math.hypot(state.vx, state.vy);
  const slipVxF = state.omegaF * spec.wheelRadius - vxF_w;
  const slipVxR = state.omegaR * spec.wheelRadius - vxR_w;
  const slipPowF_pure = Math.abs(FxF_w * slipVxF) + Math.abs(FyF_w * vyF_w);
  const slipPowR_pure = Math.abs(FxR_w * slipVxR) + Math.abs(FyR_w * vyR_w);
  const rollHeat = spec.tireRollHeat * speedMag;
  const slipPowF = slipPowF_pure + rollHeat;
  const slipPowR = slipPowR_pure + rollHeat;

  const forcedCool = speedMag > 1.0 ? Math.pow(speedMag, spec.tireCoolSpeedExp) * spec.tireCoolSpeed : 0;
  const coolFactor = spec.tireCoolBase + forcedCool;
  state.tireTempF += (slipPowF * spec.tireHeatCoef - (state.tireTempF - spec.tireAmbient) * coolFactor) * dt;
  state.tireTempR += (slipPowR * spec.tireHeatCoef - (state.tireTempR - spec.tireAmbient) * coolFactor) * dt;

  const slipExcessF = Math.max(0, Math.abs(kappaF) - spec.tireWearKappaThreshold)
                    + Math.max(0, Math.abs(alphaF) - spec.tireWearAlphaThreshold);
  const slipExcessR = Math.max(0, Math.abs(kappaR) - spec.tireWearKappaThreshold)
                    + Math.max(0, Math.abs(alphaR) - spec.tireWearAlphaThreshold);
  if (slipExcessF > 0) state.tireWearF = Math.min(1, state.tireWearF + slipPowF_pure * spec.tireWearCoef * slipExcessF * dt);
  if (slipExcessR > 0) state.tireWearR = Math.min(1, state.tireWearR + slipPowR_pure * spec.tireWearCoef * slipExcessR * dt);

  // ─── 브레이크 열역학 ───
  const brakeWorkF = Math.abs(Tbrake_F * state.omegaF);
  const brakeWorkR = Math.abs(Tbrake_R * state.omegaR);
  const brakeMC = spec.brakeMass * spec.brakeSpecHeat;
  const brakeForcedCool = speedMag > 0.5 ? Math.pow(speedMag, 0.8) : 0;
  const brakeCoolTerm = spec.brakeCoolBase + spec.brakeCoolSpeed * brakeForcedCool;
  state.brakeTempF += (brakeWorkF - (state.brakeTempF - spec.tireAmbient) * brakeCoolTerm * spec.brakeArea) / brakeMC * dt;
  state.brakeTempR += (brakeWorkR - (state.brakeTempR - spec.tireAmbient) * brakeCoolTerm * spec.brakeArea) / brakeMC * dt;

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
  debug.wheelspin = Math.abs(kappaDrive) > 0.3 && Math.abs(Tdrive) > 50;

  // ─── 시각 상태 ───
  const kPitch = 90, cPitch = 9.0;
  const kRoll = 110, cRoll = 10.5;
  visual.pitchRate += (kPitch * (-state.ax * 0.02 - visual.pitch) - cPitch * visual.pitchRate) * dt;
  visual.pitch += visual.pitchRate * dt;
  visual.rollRate += (kRoll * (-state.ay * 0.022 - visual.roll) - cRoll * visual.rollRate) * dt;
  visual.roll += visual.rollRate * dt;

  visual.wheelAngleF = (visual.wheelAngleF + state.omegaF * dt) % (Math.PI * 2);
  visual.wheelAngleR = (visual.wheelAngleR + state.omegaR * dt) % (Math.PI * 2);

  if (debug.wheelspin && Math.abs(omegaDrive) > 8) visual.shakeImpulse += 0.6 * dt;
  if (brake > 0.5 && Math.abs(state.vx) > 5 && (Math.abs(state.omegaF) < 0.5 || Math.abs(state.omegaR) < 0.5)) visual.shakeImpulse += 0.4 * dt;
  visual.shakeImpulse *= Math.exp(-3 * dt);
}
