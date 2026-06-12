// 트랙 빌드 — 이미지 마스크(인제) 또는 스플라인 래스터화(자체 서킷)

import { StartLineDef, TrackDef, sampleClosedSpline } from './tracks';

const SEED_CANDIDATES: ReadonlyArray<readonly [number, number]> = [
  [469, 300], [469, 400], [463, 500],
  [488, 350], [575, 200], [165, 700],
];

export class Track {
  def: TrackDef | null = null;
  mask: Uint8Array | null = null;
  maskW = 0;
  maskH = 0;
  metersPerImgPx = 1;
  surface: HTMLCanvasElement | null = null;
  img: HTMLImageElement | null = null;
  minimapUrl = '';
  // 스플라인 트랙은 커브에 스냅된 실제 스타트 위치/라인 사용
  startPos: { x: number; y: number; yaw: number } | null = null;
  startLine: StartLineDef | null = null;

  async load(def: TrackDef, baseUrl: string): Promise<void> {
    this.def = def;
    this.mask = null;
    this.surface = null;
    this.img = null;
    this.minimapUrl = '';
    this.startPos = { ...def.start };
    this.startLine = { ...def.startLine };
    if (def.kind === 'image') await this.loadImage(def, baseUrl);
    else this.buildSpline(def);
    this.buildMinimap();
  }

  isOnTrack(xm: number, ym: number): boolean {
    if (!this.mask || !this.def) return true;
    const ix = ((xm - this.def.originX) / this.metersPerImgPx) | 0;
    const iy = ((ym - this.def.originY) / this.metersPerImgPx) | 0;
    if (ix < 0 || iy < 0 || ix >= this.maskW || iy >= this.maskH) return false;
    return this.mask[ix + iy * this.maskW] === 1;
  }

  // ── 이미지 트랙: 이진화 → 플러드필 → 팽창 ──
  private async loadImage(def: TrackDef, baseUrl: string): Promise<void> {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('track image load failed'));
      img.src = baseUrl + def.image!;
    });
    this.img = img;
    const W = img.naturalWidth, H = img.naturalHeight;
    this.metersPerImgPx = def.worldWidthMeters / W;

    try {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;

      const bin = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        bin[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] > 540 ? 1 : 0;
      }

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
      this.surface = renderSurface(dilated, W, H);
    } catch (e) {
      console.warn('[track] mask build failed — schematic fallback:', e);
    }
  }

  // ── 스플라인 트랙: 센터라인 스트로크 → 알파 마스크 ──
  private buildSpline(def: TrackDef): void {
    const W = 1000, H = 1000;
    this.metersPerImgPx = def.worldWidthMeters / W;
    const samples = sampleClosedSpline(def.points!, 14);

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = (def.halfWidthM! * 2) / this.metersPerImgPx;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    samples.forEach(([x, y], i) => {
      const px = (x - def.originX) / this.metersPerImgPx;
      const py = (y - def.originY) / this.metersPerImgPx;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    const d = ctx.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = d[i * 4 + 3] > 128 ? 1 : 0;

    this.mask = mask;
    this.maskW = W;
    this.maskH = H;
    this.surface = renderSurface(mask, W, H);

    // 스타트 위치를 커브 위 가장 가까운 샘플에 스냅, 스타트라인은 그 지점의 법선 방향으로 생성
    let bi = 0, bd = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const dx = samples[i][0] - def.start.x;
      const dy = samples[i][1] - def.start.y;
      const dist = dx * dx + dy * dy;
      if (dist < bd) { bd = dist; bi = i; }
    }
    const p = samples[bi];
    const q = samples[(bi + 1) % samples.length];
    let tx = q[0] - p[0], ty = q[1] - p[1];
    const tlen = Math.hypot(tx, ty) || 1;
    tx /= tlen; ty /= tlen;
    // 진행 방향은 정의된 스타트라인 노멀과 일치하도록
    if (tx * def.startLine.nx + ty * def.startLine.ny < 0) { tx = -tx; ty = -ty; }
    this.startPos = { x: p[0], y: p[1], yaw: Math.atan2(ty, tx) };
    const hw = def.halfWidthM! + 3;
    this.startLine = {
      x1: p[0] - ty * hw, y1: p[1] + tx * hw,
      x2: p[0] + ty * hw, y2: p[1] - tx * hw,
      nx: tx, ny: ty,
    };
  }

  // 레이스/로비 미니맵용 축소 이미지
  private buildMinimap(): void {
    if (!this.surface) {
      this.minimapUrl = '';
      return;
    }
    const size = 256;
    const cv = document.createElement('canvas');
    const aspect = this.surface.height / this.surface.width;
    cv.width = size;
    cv.height = Math.round(size * aspect);
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(this.surface, 0, 0, cv.width, cv.height);
    this.minimapUrl = cv.toDataURL();
  }
}

// 마스크 → 아스팔트 + 가장자리 흰 라인 + 노란 센터라인
function renderSurface(mask: Uint8Array, W: number, H: number): HTMLCanvasElement {
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
