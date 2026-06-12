// 트랙 — map.png 픽셀 마스크(플러드필 + 팽창) + 오프스크린 아스팔트 렌더

import { TRACK_META } from './constants';

const SEED_CANDIDATES: ReadonlyArray<readonly [number, number]> = [
  [469, 300], [469, 400], [463, 500],   // 메인 스트레이트
  [488, 350],                            // 피트 레인
  [575, 200],                            // 우상단 헤어핀
  [165, 700],                            // 좌하단 루프
];

export class Track {
  mask: Uint8Array | null = null;
  maskW = 0;
  maskH = 0;
  metersPerImgPx = 1;
  surface: HTMLCanvasElement | null = null;   // 이미지 해상도의 아스팔트 렌더
  img: HTMLImageElement | null = null;

  async load(url: string): Promise<void> {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('track image load failed'));
      img.src = url;
    });
    this.img = img;
    const W = img.naturalWidth, H = img.naturalHeight;
    this.metersPerImgPx = TRACK_META.imgWidthMeters / W;

    try {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;

      // 1) 이진화 — 밝은 픽셀 = 주행 후보
      const bin = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        bin[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] > 540 ? 1 : 0;
      }

      // 2) 시드 플러드필
      const mask = new Uint8Array(W * H);
      for (const [sx, sy] of SEED_CANDIDATES) {
        const seedIdx = sx + sy * W;
        if (seedIdx < 0 || seedIdx >= W * H || mask[seedIdx] || !bin[seedIdx]) continue;
        const stack = [seedIdx];
        while (stack.length) {
          const idx = stack.pop()!;
          if (mask[idx] || !bin[idx]) continue;
          mask[idx] = 1;
          const x = idx % W, y = (idx / W) | 0;
          if (x > 0) stack.push(idx - 1);
          if (x < W - 1) stack.push(idx + 1);
          if (y > 0) stack.push(idx - W);
          if (y < H - 1) stack.push(idx + W);
        }
      }

      // 3) 팽창 4회 — 트랙 폭 확보
      let dilated = mask;
      for (let iter = 0; iter < 4; iter++) {
        const next = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = x + y * W;
            if (dilated[i]) { next[i] = 1; continue; }
            if ((x > 0 && dilated[i - 1]) || (x < W - 1 && dilated[i + 1]) ||
                (y > 0 && dilated[i - W]) || (y < H - 1 && dilated[i + W]) ||
                (x > 0 && y > 0 && dilated[i - 1 - W]) || (x < W - 1 && y > 0 && dilated[i + 1 - W]) ||
                (x > 0 && y < H - 1 && dilated[i - 1 + W]) || (x < W - 1 && y < H - 1 && dilated[i + 1 + W])) {
              next[i] = 1;
            }
          }
        }
        dilated = next;
      }

      this.mask = dilated;
      this.maskW = W;
      this.maskH = H;
      this.surface = this.renderSurface(dilated, W, H);
    } catch (e) {
      console.warn('[track] mask build failed — schematic fallback:', e);
      this.mask = null;
      this.surface = null;
    }
  }

  isOnTrack(xm: number, ym: number): boolean {
    if (!this.mask) return true;
    const ix = ((xm - TRACK_META.originXm) / this.metersPerImgPx) | 0;
    const iy = ((ym - TRACK_META.originYm) / this.metersPerImgPx) | 0;
    if (ix < 0 || iy < 0 || ix >= this.maskW || iy >= this.maskH) return false;
    return this.mask[ix + iy * this.maskW] === 1;
  }

  // 마스크 → 아스팔트 + 가장자리 흰 라인 + 노란 센터라인 (medial axis 근사)
  private renderSurface(mask: Uint8Array, W: number, H: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;

    const id = ctx.createImageData(W, H);
    const d = id.data;
    for (let i = 0; i < W * H; i++) {
      if (mask[i]) {
        const n = (Math.random() * 18) | 0;
        d[i * 4] = 80 + n;
        d[i * 4 + 1] = 80 + n;
        d[i * 4 + 2] = 85 + n;
        d[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);

    ctx.fillStyle = 'rgba(250,250,255,0.95)';
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = x + y * W;
        if (!mask[i]) continue;
        if (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W]) ctx.fillRect(x, y, 1, 1);
      }
    }

    ctx.fillStyle = 'rgba(255,205,30,0.92)';
    for (let y = 0; y < H; y++) {
      let i = 0;
      while (i < W) {
        if (!mask[i + y * W]) { i++; continue; }
        const start = i;
        while (i < W && mask[i + y * W]) i++;
        const end = i - 1;
        const mid = (start + end) >> 1;
        const rowRun = end - start + 1;
        let u = y, d2 = y;
        while (u > 0 && mask[mid + (u - 1) * W]) u--;
        while (d2 < H - 1 && mask[mid + (d2 + 1) * W]) d2++;
        if (rowRun <= d2 - u + 1 && rowRun < 50) ctx.fillRect(mid - 1, y, 2, 1);
      }
    }
    for (let x = 0; x < W; x++) {
      let i = 0;
      while (i < H) {
        if (!mask[x + i * W]) { i++; continue; }
        const start = i;
        while (i < H && mask[x + i * W]) i++;
        const end = i - 1;
        const mid = (start + end) >> 1;
        const colRun = end - start + 1;
        let l = x, r = x;
        while (l > 0 && mask[(l - 1) + mid * W]) l--;
        while (r < W - 1 && mask[(r + 1) + mid * W]) r++;
        if (colRun < r - l + 1 && colRun < 50) ctx.fillRect(x, mid - 1, 1, 2);
      }
    }
    return cv;
  }
}

export function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-10) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
