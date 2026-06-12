// 시뮬레이션 전역 설정 (차종/트랙 무관)

export const CONFIG = {
  renderScale: 20,              // px per meter
  substeps: 8,
  maxDt: 0.05,
  cameraLookAheadMaxScreen: 0.2,
  zoomOutMax: 0.35,             // 고속에서 renderScale 최대 35% 축소
  zoomOutSpeed: 55,             // 이 속도(m/s)에서 최대 줌아웃
  cameraLerp: 8,
  baseShakeScale: 0.025,
  particleMax: 320,
  skidLifeSec: 10.0,
  skidMaxSegs: 4000,
  countdownSec: 3.2,

  // 오프트랙(잔디) 페널티
  offTrackMu: 0.75,
  offTrackRollMult: 4.0,
  offTrackDragCoef: 0.6,
  offTrackEnginePenalty: 0.85,
} as const;
