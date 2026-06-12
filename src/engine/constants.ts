// 차량 제원 / 시뮬레이션 상수 — legacy/main.html v3 물리 파라미터를 그대로 계승

export const SPEC = {
  // ── 차체 (GR86 실차 스펙) ──
  mass: 1285,                   // kg, 6MT
  inertia: 1950,                // Izz, kg·m² (실차 1700~2100 중간)
  lf: 1.21, lr: 1.36,           // 53:47 무게배분
  wheelbase: 2.575,
  cgHeight: 0.46,
  track: 1.52,
  wheelRadius: 0.31,
  I_wheel_F: 1.6, I_wheel_R: 2.0,   // 전축/후축 비대칭 (후축은 드라이브샤프트 포함)
  I_eng: 0.18,                  // FA24 + DMFW + 풀리
  idleRpm: 800, maxRpm: 7500, redline: 7000,
  peakTorque: 250, peakTorqueRpm: 3700,
  gears: [-3.437, 0, 3.626, 2.188, 1.541, 1.213, 1.0, 0.767],
  finalDrive: 4.1,

  // ── 브레이크 (정적 + 동적 EBD) ──
  brakeMaxTotal: 3200,
  brakeStaticBias: 0.625,
  brakeBiasDynamic: 0.7,
  handbrakeForce: 3500,

  // ── 클러치 ──
  clutchMaxTorque: 350,
  drivelineEff: 0.88,

  // ── 에어로 (스톡 GR86: 양력 차량) ──
  aeroDragCoef: 0.34,
  aeroLiftCoef: -0.13,
  aeroLiftFrontFrac: 0.3,
  rollResist: 150,
  rollResistVelScale: 12.0,

  // ── Pacejka MF 계수 ──
  pacejkaLong: { B: 15, C: 1.5, E: 0.85 },
  pacejkaLat: { B: 12, C: 1.4, E: 0.85 },
  loadSensitivity: 0.18,

  // ── 타이어 열역학 (비대칭 그립 곡선) ──
  tireOptimalTemp: 85,
  tireTempWindowCold: 55,
  tireTempWindowHot: 22,
  tireMinMu: 0.78,
  tireAmbient: 20,
  tireStartTemp: 65,
  tireHeatCoef: 2.5e-4,
  tireCoolBase: 0.0015,
  tireCoolSpeed: 0.0025,
  tireCoolSpeedExp: 0.8,
  tireRollHeat: 75,
  arbBalanceFront: 0.55,
  tireWearCoef: 5.0e-8,
  tireWearKappaThreshold: 0.05,
  tireWearAlphaThreshold: 0.09,
  tireWearGripFactor: 0.35,

  // ── 브레이크 열역학 ──
  brakeMass: 14,
  brakeSpecHeat: 460,
  brakeArea: 0.18,
  brakeCoolBase: 30,
  brakeCoolSpeed: 1.5,
  brakeFadeStart: 500,
  brakeFadeKnee: 700,
  brakeFadeMin: 0.3,

  // ── 보조장비 ──
  absSlipThreshold: 0.12,
  absModulation: 5,
  tcSlipThreshold: [0.4, 0.2, 0.14, 0.1],
  tcCutFactor: 5,
  escYawRateError: 0.08,
  escBrakeForceMax: 6000,
} as const;

export const CONFIG = {
  renderScale: 20,              // px per meter
  substeps: 8,
  maxDt: 0.05,
  cameraLookAheadMaxScreen: 0.3,
  cameraLerp: 8,
  baseShakeScale: 0.025,
  particleMax: 320,
  skidLifeSec: 10.0,
  skidMaxSegs: 4000,
  startX: 1022, startY: 891, startYaw: -Math.PI / 2,
} as const;

export const TRACK_META = {
  imgWidthMeters: 1500,
  originXm: 50, originYm: 50,
  offTrackMu: 1.0,
  offTrackRollMult: 1.0,
  offTrackDragCoef: 0.0,
  offTrackEnginePenalty: 1.0,
} as const;

export const START_LINE = {
  cx: 1022, cy: 879,
  halfWidth: 30,
  validDy: -1,                  // 통과 시 -y(북향)가 정상 진행 방향
} as const;
