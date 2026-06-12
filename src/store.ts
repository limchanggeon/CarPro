// 전역 상태 — 시뮬레이션 엔진이 매 프레임 텔레메트리를 publish,
// React HUD 컴포넌트는 세분화된 selector로 구독

import { create } from 'zustand';

export interface Telemetry {
  speedKmh: number;
  gearLabel: string;
  rpm: number;
  rpmFrac: number;
  shiftLight: boolean;
  revCut: boolean;
  ledsOn: number;
  alphaF: number;
  alphaR: number;
  kappaR: number;
  statusLabel: string;
  statusCls: string;
  gDispX: number;
  gDispY: number;
  gTrailX: number;
  gTrailY: number;
  gMag: number;
  speedFx: number;
  throttle: number;
  brake: number;
  steer: number;
  tireTempF: number;
  tireTempR: number;
  tireWearF: number;
  tireWearR: number;
  brakeTempF: number;
  brakeTempR: number;
  absOn: boolean;
  tcOn: boolean;
  escOn: boolean;
  tcLevel: number;
  absActive: boolean;
  tcActive: boolean;
  escActive: boolean;
  lapNum: number;
  lapReady: boolean;
  lapRunning: boolean;
  lapCurrentSec: number;
  lapBestSec: number | null;
  lapLastSec: number | null;
  lapHistory: number[];
  posX: number;
  posY: number;
  yawDeg: number;
}

export interface Settings {
  mu: number;
  maxSteer: number;
  volume: number;
}

interface UiState {
  showHelp: boolean;
  showLap: boolean;
  trackReady: boolean;
}

interface Store {
  telemetry: Telemetry;
  settings: Settings;
  ui: UiState;
  setTelemetry: (t: Telemetry) => void;
  setSetting: (key: keyof Settings, value: number) => void;
  toggleHelp: () => void;
  toggleLap: () => void;
  setTrackReady: (v: boolean) => void;
}

const initialTelemetry: Telemetry = {
  speedKmh: 0, gearLabel: 'N', rpm: 800, rpmFrac: 800 / 7500,
  shiftLight: false, revCut: false, ledsOn: 0,
  alphaF: 0, alphaR: 0, kappaR: 0,
  statusLabel: 'CRUISE', statusCls: '',
  gDispX: 0, gDispY: 0, gTrailX: 0, gTrailY: 0, gMag: 0,
  speedFx: 0, throttle: 0, brake: 0, steer: 0,
  tireTempF: 65, tireTempR: 65, tireWearF: 0, tireWearR: 0,
  brakeTempF: 20, brakeTempR: 20,
  absOn: true, tcOn: true, escOn: true, tcLevel: 1,
  absActive: false, tcActive: false, escActive: false,
  lapNum: 0, lapReady: false, lapRunning: false,
  lapCurrentSec: 0, lapBestSec: null, lapLastSec: null, lapHistory: [],
  posX: 1022, posY: 891, yawDeg: 0,
};

export const useStore = create<Store>((set) => ({
  telemetry: initialTelemetry,
  settings: { mu: 1.0, maxSteer: 0.5, volume: 0.35 },
  ui: { showHelp: true, showLap: true, trackReady: false },
  setTelemetry: (telemetry) => set({ telemetry }),
  setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
  toggleHelp: () => set((s) => ({ ui: { ...s.ui, showHelp: !s.ui.showHelp } })),
  toggleLap: () => set((s) => ({ ui: { ...s.ui, showLap: !s.ui.showLap } })),
  setTrackReady: (trackReady) => set((s) => ({ ui: { ...s.ui, trackReady } })),
}));

export function fmtLap(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '—:——.———';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
