// 전역 상태 — 게임 화면 전환(로비/레이스), 차종/트랙 선택, 텔레메트리

import { create } from 'zustand';

export interface Telemetry {
  speedKmh: number;
  gearLabel: string;
  rpm: number;
  rpmFrac: number;
  redlineFrac: number;
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
  brakeFadeStart: number;
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
  carNx: number;
  carNy: number;
  countdown: number;        // 초 (양수 = 카운트다운 중, 0~-1 = GO 표시)
}

export interface Settings {
  mu: number;
  maxSteer: number;
  volume: number;
}

interface UiState {
  screen: 'lobby' | 'race';
  selectedCarId: string;
  selectedTrackId: string;
  showHelp: boolean;
  showLap: boolean;
  showSettings: boolean;
  trackReady: boolean;
  minimapUrl: string;
}

interface Store {
  telemetry: Telemetry;
  settings: Settings;
  ui: UiState;
  setTelemetry: (t: Telemetry) => void;
  setSetting: (key: keyof Settings, value: number) => void;
  selectCar: (id: string) => void;
  selectTrack: (id: string) => void;
  startRace: () => void;
  exitToLobby: () => void;
  toggleHelp: () => void;
  toggleLap: () => void;
  toggleSettings: () => void;
  setTrackReady: (v: boolean) => void;
  setMinimapUrl: (url: string) => void;
}

const initialTelemetry: Telemetry = {
  speedKmh: 0, gearLabel: 'N', rpm: 800, rpmFrac: 800 / 7500, redlineFrac: 7000 / 7500,
  shiftLight: false, revCut: false, ledsOn: 0,
  alphaF: 0, alphaR: 0, kappaR: 0,
  statusLabel: 'CRUISE', statusCls: '',
  gDispX: 0, gDispY: 0, gTrailX: 0, gTrailY: 0, gMag: 0,
  speedFx: 0, throttle: 0, brake: 0, steer: 0,
  tireTempF: 65, tireTempR: 65, tireWearF: 0, tireWearR: 0,
  brakeTempF: 20, brakeTempR: 20, brakeFadeStart: 500,
  absOn: true, tcOn: true, escOn: true, tcLevel: 1,
  absActive: false, tcActive: false, escActive: false,
  lapNum: 0, lapReady: false, lapRunning: false,
  lapCurrentSec: 0, lapBestSec: null, lapLastSec: null, lapHistory: [],
  posX: 1022, posY: 891, yawDeg: 0,
  carNx: 0.5, carNy: 0.5,
  countdown: -1,
};

// 딥링크: ?race=<carId>,<trackId> 로 바로 레이스 진입
const raceParam = typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('race')
  : null;
const [deepCarId, deepTrackId] = raceParam ? raceParam.split(',') : [null, null];

export const useStore = create<Store>((set) => ({
  telemetry: initialTelemetry,
  settings: { mu: 1.0, maxSteer: 0.5, volume: 0.35 },
  ui: {
    screen: raceParam ? 'race' : 'lobby',
    selectedCarId: deepCarId || 'gr86',
    selectedTrackId: deepTrackId || 'inje',
    showHelp: false,
    showLap: true,
    showSettings: false,
    trackReady: false,
    minimapUrl: '',
  },
  setTelemetry: (telemetry) => set({ telemetry }),
  setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
  selectCar: (selectedCarId) => set((s) => ({ ui: { ...s.ui, selectedCarId } })),
  selectTrack: (selectedTrackId) => set((s) => ({ ui: { ...s.ui, selectedTrackId } })),
  startRace: () => set((s) => ({ ui: { ...s.ui, screen: 'race', trackReady: false } })),
  exitToLobby: () => set((s) => ({ ui: { ...s.ui, screen: 'lobby', showSettings: false } })),
  toggleHelp: () => set((s) => ({ ui: { ...s.ui, showHelp: !s.ui.showHelp } })),
  toggleLap: () => set((s) => ({ ui: { ...s.ui, showLap: !s.ui.showLap } })),
  toggleSettings: () => set((s) => ({ ui: { ...s.ui, showSettings: !s.ui.showSettings } })),
  setTrackReady: (trackReady) => set((s) => ({ ui: { ...s.ui, trackReady } })),
  setMinimapUrl: (minimapUrl) => set((s) => ({ ui: { ...s.ui, minimapUrl } })),
}));

export function fmtLap(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '—:——.———';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
