// 단일 캔버스 렌더 파이프라인 — 잔디/그리드/트랙/스타트라인/스키드/연기/차량(차종별)

import { CONFIG } from '../engine/constants';
import type { Simulation } from '../engine/simulation';
import type { CarSpec } from '../engine/cars';

const SC = CONFIG.renderScale;
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

    const speed = Math.hypot(state.vx, state.vy);
    const zoomTarget = 1 - CONFIG.zoomOutMax * Math.min(1, speed / CONFIG.zoomOutSpeed);
    this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-2 * rawDt));
    const s = SC * this.zoom;

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
    this.drawStartLine(sim, s);
    this.drawSkids(sim, s, vw, vh);
    this.drawSmoke(sim, s, vw, vh);
    this.drawCar(sim, s);

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    sim.carNx = (state.x * s + this.camX) / vw;
    sim.carNy = (state.y * s + this.camY) / vh;
  }

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

  private drawTrack(sim: Simulation, s: number, vw: number, vh: number): void {
    const { ctx } = this;
    const track = sim.track;
    const def = track.def;
    if (!def) return;
    const src = track.surface ?? track.img;
    if (!src) return;
    const mPerPx = track.metersPerImgPx;
    const srcW = track.surface ? track.surface.width : track.img!.naturalWidth;
    const srcH = track.surface ? track.surface.height : track.img!.naturalHeight;

    const worldX0 = (0 - this.camX) / s, worldY0 = (0 - this.camY) / s;
    const worldX1 = (vw - this.camX) / s, worldY1 = (vh - this.camY) / s;
    let sx = (worldX0 - def.originX) / mPerPx;
    let sy = (worldY0 - def.originY) / mPerPx;
    let ex = (worldX1 - def.originX) / mPerPx;
    let ey = (worldY1 - def.originY) / mPerPx;
    sx = Math.max(0, Math.floor(sx)); sy = Math.max(0, Math.floor(sy));
    ex = Math.min(srcW, Math.ceil(ex)); ey = Math.min(srcH, Math.ceil(ey));
    if (ex <= sx || ey <= sy) return;

    const dx = (def.originX + sx * mPerPx) * s + this.camX;
    const dy = (def.originY + sy * mPerPx) * s + this.camY;
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

  // 스타트/피니시 — 임의 방향 라인 세그먼트에 체커 패턴
  private drawStartLine(sim: Simulation, s: number): void {
    const { ctx } = this;
    const sl = sim.track.startLine ?? sim.trackDef.startLine;
    const x1 = sl.x1 * s + this.camX, y1 = sl.y1 * s + this.camY;
    const x2 = sl.x2 * s + this.camX, y2 = sl.y2 * s + this.camY;
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    if (maxX < 0 || minX > this.canvas.width || maxY < 0 || minY > this.canvas.height) return;

    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const h = 1.2 * s;
    const cell = h / 2;
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(ang);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i * cell < len; i++) {
        ctx.fillStyle = (i + row) % 2 === 0 ? 'rgba(245,245,245,0.9)' : 'rgba(20,20,20,0.9)';
        ctx.fillRect(i * cell, (row - 1) * cell, Math.min(cell, len - i * cell), cell);
      }
    }
    ctx.restore();
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
    const { state, visual, inputs, spec } = sim;
    const z = this.zoom;
    const v = spec.visual;

    ctx.save();
    ctx.translate(state.x * s + this.camX, state.y * s + this.camY);
    ctx.rotate(state.yaw);

    // 그림자
    ctx.save();
    ctx.translate(-visual.pitch * 16 * z, visual.roll * 18 * z);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, -v.len / 2 * s - 2, -v.wid / 2 * s - 2, v.len * s + 4, v.wid * s + 4, 9 * z);
    ctx.fill();
    ctx.restore();

    if (v.kind === 'f1') this.drawF1Body(sim, s);
    else this.drawCarBody(sim, s);

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
    if (v.kind === 'f1') {
      // F1 — 리어윙 중앙 레인라이트
      roundRect(ctx, -v.len / 2 * s + 1, -3 * z, 4 * z, 6 * z, 2 * z);
      ctx.fill();
    } else {
      for (const side of [-1, 1]) {
        roundRect(ctx, -v.len / 2 * s + 1, side * v.wid * 0.32 * s - 2.5 * z, 4 * z, 5 * z, 2 * z);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawWheels(spec: CarSpec, s: number, z: number, steer: number, exposed: boolean): void {
    const { ctx } = this;
    const wheelLen = (exposed ? 0.72 : 0.62) * s;
    const wheelWid = (exposed ? 0.36 : 0.24) * s;
    ctx.fillStyle = '#0c0d10';
    for (const wx of [spec.lf, -spec.lr]) {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(wx * s, side * (spec.track / 2) * s);
        if (wx > 0) ctx.rotate(steer);
        roundRect(ctx, -wheelLen / 2, -wheelWid / 2, wheelLen, wheelWid, 3 * z);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawCarBody(sim: Simulation, s: number): void {
    const { ctx } = this;
    const { state, visual, spec } = sim;
    const v = spec.visual;
    const z = this.zoom;

    this.drawWheels(spec, s, z, state.steer, false);

    ctx.save();
    ctx.translate(0, visual.roll * 8 * z);
    const bodyGrad = ctx.createLinearGradient(0, -v.wid / 2 * s, 0, v.wid / 2 * s);
    bodyGrad.addColorStop(0, v.colorTop);
    bodyGrad.addColorStop(0.5, v.color);
    bodyGrad.addColorStop(1, v.colorBottom);
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, -v.len / 2 * s, -v.wid / 2 * s, v.len * s, v.wid * s, 8 * z);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#181c24';
    roundRect(ctx, -v.len * 0.28 * s, -v.wid * 0.36 * s, v.len * 0.42 * s, v.wid * 0.72 * s, 6 * z);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, v.len * 0.2 * s, -v.wid * 0.3 * s, v.len * 0.24 * s, v.wid * 0.6 * s, 4 * z);
    ctx.fill();
    ctx.restore();
  }

  private drawF1Body(sim: Simulation, s: number): void {
    const { ctx } = this;
    const { state, spec } = sim;
    const v = spec.visual;
    const z = this.zoom;
    const L = v.len * s, W = v.wid * s;

    // 노출 휠 먼저
    this.drawWheels(spec, s, z, state.steer, true);

    // 프론트 윙 (풀 폭)
    ctx.fillStyle = v.color;
    roundRect(ctx, L * 0.40, -W / 2, L * 0.09, W, 2 * z);
    ctx.fill();
    // 리어 윙
    roundRect(ctx, -L * 0.5, -W * 0.38, L * 0.1, W * 0.76, 2 * z);
    ctx.fill();

    // 모노코크 — 노즈로 갈수록 좁아지는 폴리곤
    const bw = W * 0.4;     // 콕핏 폭
    const nw = W * 0.1;     // 노즈 끝 폭
    const grad = ctx.createLinearGradient(0, -bw, 0, bw);
    grad.addColorStop(0, v.colorTop);
    grad.addColorStop(0.5, v.color);
    grad.addColorStop(1, v.colorBottom);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(L * 0.46, -nw / 2);
    ctx.lineTo(L * 0.46, nw / 2);
    ctx.lineTo(L * 0.12, bw / 2);
    ctx.lineTo(-L * 0.42, bw / 2);
    ctx.lineTo(-L * 0.42, -bw / 2);
    ctx.lineTo(L * 0.12, -bw / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 사이드포드
    ctx.fillStyle = v.colorBottom;
    roundRect(ctx, -L * 0.3, -W * 0.34, L * 0.32, W * 0.68, 4 * z);
    ctx.fill();
    ctx.fillStyle = grad;
    roundRect(ctx, -L * 0.3, -bw / 2, L * 0.32, bw, 3 * z);
    ctx.fill();

    // 콕핏 + 헤일로
    ctx.fillStyle = '#10141c';
    roundRect(ctx, -L * 0.1, -bw * 0.35, L * 0.16, bw * 0.7, 3 * z);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,205,215,0.8)';
    ctx.lineWidth = 1.6 * z;
    ctx.beginPath();
    ctx.arc(-L * 0.02, 0, bw * 0.42, 0, Math.PI * 2);
    ctx.stroke();
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
