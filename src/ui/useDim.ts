// 차량이 HUD 위젯 영역(정규화 스크린 좌표)과 겹치면 true — 위젯 페이드용

import { useStore } from '../store';

export function useDim(x0: number, x1: number, y0: number, y1: number): boolean {
  return useStore((s) => {
    const { carNx, carNy } = s.telemetry;
    return carNx > x0 && carNx < x1 && carNy > y0 && carNy < y1;
  });
}
