// 차종 정의 — 물리 파라미터 전체를 차별 스펙으로 일반화

export interface PacejkaCoef { B: number; C: number; E: number }

export type DriveType = 'FWD' | 'RWD' | 'AWD';

export interface CarVisual {
  color: string;        // 차체 메인
  colorTop: string;     // 그라데이션 밝은쪽
  colorBottom: string;  // 그라데이션 어두운쪽
  len: number;          // m
  wid: number;          // m
  kind: 'car' | 'f1';
}

export interface SoundProfile {
  fireFactor: number;   // 점화 주파수 = rpm/30 × factor
  ev: boolean;
}

export interface CarSpec {
  id: string;
  name: string;
  brand: string;
  desc: string;
  stats: { power: string; torque: string; weight: string; drive: string };

  drive: DriveType;
  awdFrontSplit: number;
  ev: boolean;
  regenTorque: number;          // EV 회생제동 토크 (Nm, 모터축)

  mass: number; inertia: number;
  lf: number; lr: number; wheelbase: number;
  cgHeight: number; track: number; wheelRadius: number;
  I_wheel_F: number; I_wheel_R: number; I_eng: number;

  idleRpm: number; maxRpm: number; redline: number;
  torque: Array<[number, number]>;     // [rpm, Nm] 보간점
  gears: number[];                     // [R, N, 1..n]
  finalDrive: number;

  brakeMaxTotal: number;
  brakeStaticBias: number;
  brakeBiasDynamic: number;
  handbrakeForce: number;

  clutchMaxTorque: number;
  drivelineEff: number;

  aeroDragCoef: number;
  aeroLiftCoef: number;        // 음수 = 양력, 양수 = 다운포스
  aeroLiftFrontFrac: number;
  rollResist: number;
  rollResistVelScale: number;

  pacejkaLong: PacejkaCoef;
  pacejkaLat: PacejkaCoef;
  loadSensitivity: number;
  gripMult: number;            // 타이어 컴파운드 (슬릭 > 1)
  steerScale: number;          // 조향 입력 스케일 (1 = 승용차)

  tireOptimalTemp: number;
  tireTempWindowCold: number;
  tireTempWindowHot: number;
  tireMinMu: number;
  tireAmbient: number;
  tireStartTemp: number;
  tireHeatCoef: number;
  tireCoolBase: number;
  tireCoolSpeed: number;
  tireCoolSpeedExp: number;
  tireRollHeat: number;
  arbBalanceFront: number;
  tireWearCoef: number;
  tireWearKappaThreshold: number;
  tireWearAlphaThreshold: number;
  tireWearGripFactor: number;

  brakeMass: number;
  brakeSpecHeat: number;
  brakeArea: number;
  brakeCoolBase: number;
  brakeCoolSpeed: number;
  brakeFadeStart: number;
  brakeFadeKnee: number;
  brakeFadeMin: number;

  absSlipThreshold: number;
  absModulation: number;
  tcSlipThreshold: number[];
  tcCutFactor: number;
  escYawRateError: number;
  escBrakeForceMax: number;

  sound: SoundProfile;
  visual: CarVisual;
}

// GR86 기준값 — 모든 차종의 베이스
const BASE: Omit<CarSpec, 'id' | 'name' | 'brand' | 'desc' | 'stats' | 'torque' | 'gears' | 'visual'> = {
  drive: 'RWD', awdFrontSplit: 0.4, ev: false, regenTorque: 0,
  mass: 1285, inertia: 1950,
  lf: 1.21, lr: 1.36, wheelbase: 2.575,
  cgHeight: 0.46, track: 1.52, wheelRadius: 0.31,
  I_wheel_F: 1.6, I_wheel_R: 2.0, I_eng: 0.18,
  idleRpm: 800, maxRpm: 7500, redline: 7000,
  finalDrive: 4.1,
  brakeMaxTotal: 3200, brakeStaticBias: 0.625, brakeBiasDynamic: 0.7, handbrakeForce: 3500,
  clutchMaxTorque: 350, drivelineEff: 0.88,
  aeroDragCoef: 0.34, aeroLiftCoef: -0.13, aeroLiftFrontFrac: 0.3,
  rollResist: 150, rollResistVelScale: 12.0,
  pacejkaLong: { B: 15, C: 1.5, E: 0.85 },
  pacejkaLat: { B: 12, C: 1.4, E: 0.85 },
  loadSensitivity: 0.18, gripMult: 1.0, steerScale: 1.0,
  tireOptimalTemp: 85, tireTempWindowCold: 55, tireTempWindowHot: 22,
  tireMinMu: 0.78, tireAmbient: 20, tireStartTemp: 65,
  tireHeatCoef: 2.5e-4, tireCoolBase: 0.0015, tireCoolSpeed: 0.0025, tireCoolSpeedExp: 0.8,
  tireRollHeat: 75, arbBalanceFront: 0.55,
  tireWearCoef: 5.0e-8, tireWearKappaThreshold: 0.05, tireWearAlphaThreshold: 0.09, tireWearGripFactor: 0.35,
  brakeMass: 14, brakeSpecHeat: 460, brakeArea: 0.18, brakeCoolBase: 30, brakeCoolSpeed: 1.5,
  brakeFadeStart: 500, brakeFadeKnee: 700, brakeFadeMin: 0.3,
  absSlipThreshold: 0.12, absModulation: 5,
  tcSlipThreshold: [0.4, 0.2, 0.14, 0.1], tcCutFactor: 5,
  escYawRateError: 0.08, escBrakeForceMax: 6000,
  sound: { fireFactor: 1.0, ev: false },
};

export const CARS: CarSpec[] = [
  {
    ...BASE,
    id: 'gr86',
    name: 'GR86',
    brand: 'Toyota',
    desc: '수평대향 4기통 NA · 경량 FR 쿠페 — 밸런스의 교과서',
    stats: { power: '237 ps', torque: '250 Nm', weight: '1,285 kg', drive: 'RWD' },
    torque: [[200, 25], [700, 75], [1500, 185], [2500, 215], [3700, 250], [4000, 232], [4400, 247], [5500, 252], [6500, 250], [7000, 215], [7400, 195], [7500, 0]],
    gears: [-3.437, 0, 3.626, 2.188, 1.541, 1.213, 1.0, 0.767],
    visual: { color: '#c8302e', colorTop: '#e04340', colorBottom: '#8e1f1e', len: 4.26, wid: 1.78, kind: 'car' },
  },
  {
    ...BASE,
    id: 'avante-n',
    name: '아반떼 N',
    brand: 'Hyundai',
    desc: '2.0 터보 FF 핫해치 세단 — 앞바퀴가 그립을 지배한다',
    stats: { power: '280 ps', torque: '392 Nm', weight: '1,430 kg', drive: 'FWD' },
    drive: 'FWD',
    mass: 1430, inertia: 2250,
    lf: 1.09, lr: 1.63, wheelbase: 2.72,          // 60:40 노즈헤비
    cgHeight: 0.5, track: 1.58, wheelRadius: 0.33,
    I_wheel_F: 2.0, I_wheel_R: 1.6,
    idleRpm: 800, maxRpm: 6850, redline: 6500,
    torque: [[200, 40], [1000, 180], [2100, 392], [4700, 392], [5800, 340], [6500, 280], [6850, 0]],
    gears: [-3.7, 0, 3.61, 2.19, 1.59, 1.21, 1.0, 0.83],
    finalDrive: 4.2,
    brakeMaxTotal: 3400, brakeStaticBias: 0.68,
    aeroDragCoef: 0.38, aeroLiftCoef: -0.08,
    sound: { fireFactor: 1.0, ev: false },
    visual: { color: '#3a6fd8', colorTop: '#5085ea', colorBottom: '#274d9a', len: 4.68, wid: 1.83, kind: 'car' },
  },
  {
    ...BASE,
    id: 'porsche-911',
    name: '911 카레라 S',
    brand: 'Porsche',
    desc: '리어엔진 RR의 전설 — 수평6 트윈터보, 출구 트랙션 괴물',
    stats: { power: '450 ps', torque: '530 Nm', weight: '1,480 kg', drive: 'RWD' },
    mass: 1480, inertia: 1850,
    lf: 1.52, lr: 0.93, wheelbase: 2.45,          // 38:62 리어헤비
    cgHeight: 0.45, track: 1.59, wheelRadius: 0.33,
    I_wheel_F: 1.7, I_wheel_R: 2.3, I_eng: 0.16,
    idleRpm: 750, maxRpm: 7500, redline: 7300,
    torque: [[300, 80], [1200, 300], [2300, 530], [5000, 530], [6200, 470], [7100, 420], [7500, 0]],
    gears: [-3.5, 0, 3.55, 2.36, 1.78, 1.43, 1.21, 1.05, 0.88, 0.72],
    finalDrive: 3.6,
    brakeMaxTotal: 4400, brakeStaticBias: 0.62,
    clutchMaxTorque: 600, drivelineEff: 0.9,
    aeroDragCoef: 0.36, aeroLiftCoef: 0.05,        // 액티브 에어로 — 약한 다운포스
    gripMult: 1.08,
    brakeFadeStart: 600, brakeFadeKnee: 800,
    sound: { fireFactor: 1.5, ev: false },
    visual: { color: '#d8d8dc', colorTop: '#f0f0f4', colorBottom: '#9a9aa2', len: 4.52, wid: 1.85, kind: 'car' },
  },
  {
    ...BASE,
    id: 'ioniq5-n',
    name: '아이오닉 5 N',
    brand: 'Hyundai',
    desc: '650마력 듀얼모터 AWD EV — 즉각 토크 740Nm, 2.2톤의 가속 폭력',
    stats: { power: '650 ps', torque: '740 Nm', weight: '2,200 kg', drive: 'AWD' },
    drive: 'AWD', awdFrontSplit: 0.45,
    ev: true, regenTorque: 160,
    mass: 2200, inertia: 3300,
    lf: 1.5, lr: 1.5, wheelbase: 3.0,
    cgHeight: 0.44, track: 1.64, wheelRadius: 0.36,   // 배터리 저중심
    I_wheel_F: 2.4, I_wheel_R: 2.4, I_eng: 0.05,
    idleRpm: 0, maxRpm: 21000, redline: 20000,
    torque: [[0, 740], [5900, 740], [8000, 549], [12000, 366], [16000, 274], [21000, 0]],
    gears: [-10.5, 0, 10.5],
    finalDrive: 1.0,
    brakeMaxTotal: 4800, brakeStaticBias: 0.62,
    clutchMaxTorque: 2000, drivelineEff: 0.94,
    aeroDragCoef: 0.42, aeroLiftCoef: -0.05,
    brakeMass: 18,
    sound: { fireFactor: 2.2, ev: true },
    visual: { color: '#8a93a6', colorTop: '#aab3c4', colorBottom: '#5e6675', len: 4.72, wid: 1.94, kind: 'car' },
  },
  {
    ...BASE,
    id: 'f1',
    name: 'F1 머신',
    brand: 'Formula 1',
    desc: '1.6 V6 하이브리드 1,000마력 — 다운포스가 물리를 새로 쓴다',
    stats: { power: '1,000 ps', torque: '640 Nm', weight: '798 kg', drive: 'RWD' },
    mass: 798, inertia: 1100,
    lf: 1.98, lr: 1.62, wheelbase: 3.6,
    cgHeight: 0.25, track: 1.6, wheelRadius: 0.33,
    I_wheel_F: 0.9, I_wheel_R: 1.1, I_eng: 0.09,
    idleRpm: 4000, maxRpm: 15000, redline: 14000,
    torque: [[2000, 200], [4000, 380], [6000, 520], [10000, 620], [12000, 640], [13500, 600], [15000, 0]],
    gears: [-12, 0, 12.0, 9.5, 7.8, 6.6, 5.7, 5.0, 4.5, 4.1],
    finalDrive: 1.0,
    brakeMaxTotal: 11000, brakeStaticBias: 0.58, handbrakeForce: 1000,
    clutchMaxTorque: 900, drivelineEff: 0.95,
    aeroDragCoef: 0.9,
    aeroLiftCoef: 3.5, aeroLiftFrontFrac: 0.45,    // 강한 다운포스
    gripMult: 1.85,                                 // 슬릭 — 기계적 그립 자체가 높음
    loadSensitivity: 0.08,                          // 슬릭은 고하중에서 μ 손실이 적음 → 다운포스가 온전히 그립으로
    steerScale: 0.62,                               // 작은 조향각 — 고속 트위치 억제
    pacejkaLong: { B: 18, C: 1.5, E: 0.85 },        // 강성 높은 슬릭 곡선
    pacejkaLat: { B: 16, C: 1.45, E: 0.85 },
    tireOptimalTemp: 95, tireStartTemp: 90,         // 타이어 워머 — 출발부터 작동 온도
    tireHeatCoef: 4.0e-4, tireWearCoef: 1.6e-7,
    brakeMass: 8, brakeFadeStart: 900, brakeFadeKnee: 1100, brakeFadeMin: 0.45,
    absSlipThreshold: 0.1, tcSlipThreshold: [0.4, 0.22, 0.15, 0.1],
    escBrakeForceMax: 9000,
    sound: { fireFactor: 1.67, ev: false },
    visual: { color: '#1b2533', colorTop: '#2a3a52', colorBottom: '#0e1520', len: 5.6, wid: 2.0, kind: 'f1' },
  },
];

export function getCar(id: string): CarSpec {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

// [rpm, Nm] 보간점 기반 토크 — 범위 밖 0
export function engineTorque(rpm: number, spec: CarSpec): number {
  const pts = spec.torque;
  if (rpm < pts[0][0] || rpm > spec.maxRpm) return rpm < pts[0][0] && spec.ev ? pts[0][1] : 0;
  for (let i = 1; i < pts.length; i++) {
    if (rpm <= pts[i][0]) {
      const [r0, t0] = pts[i - 1];
      const [r1, t1] = pts[i];
      return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
    }
  }
  return 0;
}
