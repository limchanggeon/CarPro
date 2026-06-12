// 단일 캔버스 렌더 파이프라인 — 잔디/그리드/트랙/스타트라인/스키드/연기/차량
// 속도 비례 동적 줌아웃 + 카메라 룩어헤드/셰이크

import { CONFIG, SPEC, START_LINE, TRACK_META } from '../engine/constants';
import type { Simulation } from '../engine/simulation';

const SC = CONFIG.renderScale;

// 차량 외형 (미터) — GR86 실측 비율
const CAR_LEN = 4.26;
const CAR_WID = 1.78;
const WHEEL_LEN = 0.62;
const WHEEL_WID = 0.24;

const GRID_SPACING = 50;   // m

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private grass: CanvasPattern | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.grass = this.makeGrassPattern();
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent?.clientWidth || window.innerWidth;
    this.canvas.height = parent?.clientHeight || window.innerHeight;
  };

  private makeGrassPattern(): CanvasPattern | null {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const t = tile.getContext('2d')!;
    t.fillStyle = '#0e130e';
    t.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1100; i++) {
      const r = Math.random();
      t.fillStyle = `rgba(${18 + r * 16 | 0},${26 + r * 22 | 0},${16 + r * 14 | 0},0.6)`;
      t.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    return this.ctx.createPattern(tile, 'repeat');
  }

  render(sim: Simulation, rawDt: number): void {
    const { ctx, canvas } = this;
    const { state, visual } = sim;
    const vw = canvas.width, vh = canvas.height;

    // ─── 동적 줌: 고속일수록 화면을 넓게 ───
    const speed = Math.hypot(state.vx, state.vy);
    const zoomTarget = 1 - CONFIG.zoomOutMax * Math.min(1, speed / CONFIG.zoomOutSpeed);
    this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-2 * rawDt));
    const s = SC * this.zoom;

    // ─── 카메라: 룩어헤드 + 셰이크 ───
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const wvx = state.vx * cy - state.vy * sy;
    const wvy = state.vx * sy + state.vy * cy;
    const wvLen = Math.hypot(wvx, wvy);
    const lookMax = vh * CONFIG.cameraLookAheadMaxScreen;
    const lookFactor = Math.min(1, speed / 30);
    const camTargetX = wvLen > 0.5 ? (wvx / wvLen) * lookMax * lookFactor : 0;
    const camTargetY = wvLen > 0.5 ? (wvy / wvLen) * lookMax * lookFactor : 0;
    const lerp = 1 - Math.exp(-CONFIG.cameraLerp * rawDt);
    visual.camAheadX += (camTargetX - visual.camAheadX) * lerp;
    visual.camAheadY += (camTargetY - visual.camAheadY) * lerp;

    const totalShake = Math.min(1.2, speed * CONFIG.baseShakeScale) + visual.shakeImpulse * 8;
    const shakeX = (Math.random() - 0.5) * totalShake;
    const shakeY = (Math.random() - 0.5) * totalShake;

    this.camX = vw / 2 - state.x * s - visual.camAheadX + shakeX;
    this.camY = vh / 2 - state.y * s - visual.camAheadY + shakeY;

    // ─── 배경: 잔디 텍스처 (월드 고정 스크롤) ───
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.grass) {
      ctx.save();
      ctx.translate(this.camX, this.camY);
      ctx.fillStyle = this.grass;
      ctx.fillRect(-this.camX, -this.camY, vw, vh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#0e130e';
      ctx.fillRect(0, 0, vw, vh);
    }

    this.drawGrid(s, vw, vh);
    this.drawTrack(sim, s, vw, vh);
    this.drawStartLine(s);
    this.drawSkids(sim, s, vw, vh);
    this.drawSmoke(sim, s, vw, vh);
    this.drawCar(sim, s);

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 차량 스크린 위치 publish (HUD 근접 페이드용)
    sim.carNx = (state.x * s + this.camX) / vw;
    sim.carNy = (state.y * s + this.camY) / vh;
  }

  // 텔레메트리 그리드 — 50m 간격
  private drawGrid(s: number, vw: number, vh: number): void {
    const { ctx } = this;
    const step = GRID_SPACING * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = this.camX % step; x < vw; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, vh);
    }
    for (let y = this.camY % step; y < vh; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(vw, y);
    }
    ctx.stroke();
  }

  // 트랙 표면 — 보이는 영역만 source rect로 잘라 그림
  private drawTrack(sim: Simulation, s: number, vw: number, vh: number): void {
    const { ctx } = this;
    const track = sim.track;
    const src = track.surface ?? track.img;
    if (!src) return;
    const mPerPx = track.metersPerImgPx;
    const srcW = track.surface ? track.surface.width : track.img!.naturalWidth;
    const srcH = track.surface ? track.surface.height : track.img!.naturalHeight;

    const worldX0 = (0 - this.camX) / s, worldY0 = (0 - this.camY) / s;
    const worldX1 = (vw - this.camX) / s, worldY1 = (vh - this.camY) / s;
    let sx = (worldX0 - TRACK_META.originXm) / mPerPx;
    let sy = (worldY0 - TRACK_META.originYm) / mPerPx;
    let ex = (worldX1 - TRACK_META.originXm) / mPerPx;
    let ey = (worldY1 - TRACK_META.originYm) / mPerPx;
    sx = Math.max(0, Math.floor(sx)); sy = Math.max(0, Math.floor(sy));
    ex = Math.min(srcW, Math.ceil(ex)); ey = Math.min(srcH, Math.ceil(ey));
    if (ex <= sx || ey <= sy) return;

    const dx = (TRACK_META.originXm + sx * mPerPx) * s + this.camX;
    const dy = (TRACK_META.originYm + sy * mPerPx) * s + this.camY;
    const dw = (ex - sx) * mPerPx * s;
    const dh = (ey - sy) * mPerPx * s;

    ctx.imageSmoothingEnabled = true;
    if (!track.surface && track.img) {
      ctx.save();
      ctx.filter = 'invert(1) brightness(0.7)';
      ctx.drawImage(src, sx, sy, ex - sx, ey - sy, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(src, sx, sy, ex - sx, ey - sy, dx, dy, dw, dh);
    }
  }

  private drawStartLine(s: number): void {
    const { ctx } = this;
    const x0 = (START_LINE.cx - START_LINE.halfWidth) * s + this.camX;
    const y0 = START_LINE.cy * s + this.camY;
    const w = START_LINE.halfWidth * 2 * s;
    const h = 1.2 * s;
    if (y0 + h < 0 || y0 > this.canvas.height || x0 + w < 0 || x0 > this.canvas.width) return;
    const cell = h / 2;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i * cell < w; i++) {
        ctx.fillStyle = (i + row) % 2 === 0 ? 'rgba(245,245,245,0.9)' : 'rgba(20,20,20,0.9)';
        ctx.fillRect(x0 + i * cell, y0 + row * cell, Math.min(cell, w - i * cell), cell);
      }
    }
  }

  private drawSkids(sim: Simulation, s: number, vw: number, vh: number): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineWidth = 13 * this.zoom;
    for (const seg of sim.skidSegments) {
      const age = sim.simTime - seg.t;
      const a = seg.a * Math.max(0, 1 - age / CONFIG.skidLifeSec);
      if (a < 0.02) continue;
      const sx1 = seg.x1 * s + this.camX, sy1 = seg.y1 * s + this.camY;
      const sx2 = seg.x2 * s + this.camX, sy2 = seg.y2 * s + this.camY;
      if ((sx1 < -20 && sx2 < -20) || (sx1 > vw + 20 && sx2 > vw + 20)) continue;
      if ((sy1 < -20 && sy2 < -20) || (sy1 > vh + 20 && sy2 > vh + 20)) continue;
      ctx.strokeStyle = `rgba(12,12,12,${a})`;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }
  }

  private drawSmoke(sim: Simulation, s: number, vw: number, vh: number): void {
    const { ctx } = this;
    for (const p of sim.smokeParticles) {
      const sx = p.x * s + this.camX;
      const sy = p.y * s + this.camY;
      const sr = p.r * s;
      if (sx + sr < 0 || sx - sr > vw || sy + sr < 0 || sy - sr > vh) continue;
      const g = 200 + Math.floor(p.life * 40);
      ctx.fillStyle = `rgba(${g},${g},${g},${p.life * 0.55})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCar(sim: Simulation, s: number): void {
    const { ctx } = this;
    const { state, visual, inputs } = sim;
    const z = this.zoom;

    ctx.save();
    ctx.translate(state.x * s + this.camX, state.y * s + this.camY);
    ctx.rotate(state.yaw);

    // 그림자 (롤/피치에 따라 오프셋)
    ctx.save();
    ctx.translate(-visual.pitch * 16 * z, visual.roll * 18 * z);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, -CAR_LEN / 2 * s - 2, -CAR_WID / 2 * s - 2, CAR_LEN * s + 4, CAR_WID * s + 4, 9 * z);
    ctx.fill();
    ctx.restore();

    // 휠 — 전륜은 조향각 반영
    ctx.fillStyle = '#0c0d10';
    const wheelXs = [SPEC.lf, -SPEC.lr];
    const halfTrack = SPEC.track / 2;
    for (const wx of wheelXs) {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(wx * s, side * halfTrack * s);
        if (wx > 0) ctx.rotate(state.steer);
        roundRect(ctx, -WHEEL_LEN / 2 * s, -WHEEL_WID / 2 * s, WHEEL_LEN * s, WHEEL_WID * s, 3 * z);
        ctx.fill();
        ctx.restore();
      }
    }

    // 차체 — 롤에 따라 살짝 횡 시프트
    ctx.save();
    ctx.translate(0, visual.roll * 8 * z);
    const bodyGrad = ctx.createLinearGradient(0, -CAR_WID / 2 * s, 0, CAR_WID / 2 * s);
    bodyGrad.addColorStop(0, '#e04340');
    bodyGrad.addColorStop(0.5, '#c8302e');
    bodyGrad.addColorStop(1, '#8e1f1e');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, -CAR_LEN / 2 * s, -CAR_WID / 2 * s, CAR_LEN * s, CAR_WID * s, 8 * z);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 캐빈
    ctx.fillStyle = '#181c24';
    roundRect(ctx, -CAR_LEN * 0.28 * s, -CAR_WID * 0.36 * s, CAR_LEN * 0.42 * s, CAR_WID * 0.72 * s, 6 * z);
    ctx.fill();

    // 본넷 라인
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, CAR_LEN * 0.2 * s, -CAR_WID * 0.3 * s, CAR_LEN * 0.24 * s, CAR_WID * 0.6 * s, 4 * z);
    ctx.fill();

    // 브레이크 라이트
    const brakeLevel = Math.max(inputs.brake, inputs.hand ? 1 : 0);
    if (brakeLevel > 0.05) {
      ctx.shadowColor = 'rgba(255,40,30,0.95)';
      ctx.shadowBlur = (8 + brakeLevel * 16) * z;
      ctx.fillStyle = `rgba(255,46,36,${0.5 + brakeLevel * 0.5})`;
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(120,20,18,0.8)';
    }
    for (const side of [-1, 1]) {
      roundRect(ctx, -CAR_LEN / 2 * s + 1, side * CAR_WID * 0.32 * s - 2.5 * z, 4 * z, 5 * z, 2 * z);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
