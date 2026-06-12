// 단일 캔버스 렌더 파이프라인 — 트랙 / 스타트라인 / 스키드 / 연기 / 차량 / 카메라
// legacy의 DOM transform 방식을 전부 캔버스 드로잉으로 재설계

import { CONFIG, SPEC, START_LINE, TRACK_META } from '../engine/constants';
import type { Simulation } from '../engine/simulation';

const SC = CONFIG.renderScale;

// 차량 외형 (미터) — GR86 실측 비율
const CAR_LEN = 4.26;
const CAR_WID = 1.78;
const WHEEL_LEN = 0.62;
const WHEEL_WID = 0.24;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private camX = 0;
  private camY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent?.clientWidth || window.innerWidth;
    this.canvas.height = parent?.clientHeight || window.innerHeight;
  };

  render(sim: Simulation, rawDt: number): void {
    const { ctx, canvas } = this;
    const { state, visual } = sim;
    const vw = canvas.width, vh = canvas.height;

    // ─── 카메라: 룩어헤드 + 셰이크 ───
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const wvx = state.vx * cy - state.vy * sy;
    const wvy = state.vx * sy + state.vy * cy;
    const wvLen = Math.hypot(wvx, wvy);
    const speed = Math.hypot(state.vx, state.vy);
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

    this.camX = vw / 2 - state.x * SC - visual.camAheadX + shakeX;
    this.camY = vh / 2 - state.y * SC - visual.camAheadY + shakeY;

    // ─── 배경 (잔디) ───
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#101510';
    ctx.fillRect(0, 0, vw, vh);

    this.drawTrack(sim, vw, vh);
    this.drawStartLine();
    this.drawSkids(sim, vw, vh);
    this.drawSmoke(sim, vw, vh);
    this.drawCar(sim);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // 트랙 표면 — 보이는 영역만 source rect로 잘라 그림
  private drawTrack(sim: Simulation, vw: number, vh: number): void {
    const { ctx } = this;
    const track = sim.track;
    const src = track.surface ?? track.img;
    if (!src) return;
    const mPerPx = track.metersPerImgPx;
    const srcW = track.surface ? track.surface.width : track.img!.naturalWidth;
    const srcH = track.surface ? track.surface.height : track.img!.naturalHeight;

    // 화면에 보이는 월드 범위 (m) → 이미지 px
    const worldX0 = (0 - this.camX) / SC, worldY0 = (0 - this.camY) / SC;
    const worldX1 = (vw - this.camX) / SC, worldY1 = (vh - this.camY) / SC;
    let sx = (worldX0 - TRACK_META.originXm) / mPerPx;
    let sy = (worldY0 - TRACK_META.originYm) / mPerPx;
    let ex = (worldX1 - TRACK_META.originXm) / mPerPx;
    let ey = (worldY1 - TRACK_META.originYm) / mPerPx;
    sx = Math.max(0, Math.floor(sx)); sy = Math.max(0, Math.floor(sy));
    ex = Math.min(srcW, Math.ceil(ex)); ey = Math.min(srcH, Math.ceil(ey));
    if (ex <= sx || ey <= sy) return;

    const dx = (TRACK_META.originXm + sx * mPerPx) * SC + this.camX;
    const dy = (TRACK_META.originYm + sy * mPerPx) * SC + this.camY;
    const dw = (ex - sx) * mPerPx * SC;
    const dh = (ey - sy) * mPerPx * SC;

    ctx.imageSmoothingEnabled = true;
    if (!track.surface && track.img) {
      // 마스크 실패 폴백: 원본 PNG 인버트 표시
      ctx.save();
      ctx.filter = 'invert(1) brightness(0.7)';
      ctx.drawImage(src, sx, sy, ex - sx, ey - sy, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(src, sx, sy, ex - sx, ey - sy, dx, dy, dw, dh);
    }
  }

  private drawStartLine(): void {
    const { ctx } = this;
    const x0 = (START_LINE.cx - START_LINE.halfWidth) * SC + this.camX;
    const y0 = START_LINE.cy * SC + this.camY;
    const w = START_LINE.halfWidth * 2 * SC;
    const h = 1.2 * SC;
    if (y0 + h < 0 || y0 > this.canvas.height || x0 + w < 0 || x0 > this.canvas.width) return;
    // 체커 패턴
    const cell = h / 2;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i * cell < w; i++) {
        ctx.fillStyle = (i + row) % 2 === 0 ? 'rgba(245,245,245,0.9)' : 'rgba(20,20,20,0.9)';
        ctx.fillRect(x0 + i * cell, y0 + row * cell, Math.min(cell, w - i * cell), cell);
      }
    }
  }

  private drawSkids(sim: Simulation, vw: number, vh: number): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineWidth = 13;
    for (const s of sim.skidSegments) {
      const age = sim.simTime - s.t;
      const a = s.a * Math.max(0, 1 - age / CONFIG.skidLifeSec);
      if (a < 0.02) continue;
      const sx1 = s.x1 * SC + this.camX, sy1 = s.y1 * SC + this.camY;
      const sx2 = s.x2 * SC + this.camX, sy2 = s.y2 * SC + this.camY;
      if ((sx1 < -20 && sx2 < -20) || (sx1 > vw + 20 && sx2 > vw + 20)) continue;
      if ((sy1 < -20 && sy2 < -20) || (sy1 > vh + 20 && sy2 > vh + 20)) continue;
      ctx.strokeStyle = `rgba(12,12,12,${a})`;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }
  }

  private drawSmoke(sim: Simulation, vw: number, vh: number): void {
    const { ctx } = this;
    for (const p of sim.smokeParticles) {
      const sx = p.x * SC + this.camX;
      const sy = p.y * SC + this.camY;
      const sr = p.r * SC;
      if (sx + sr < 0 || sx - sr > vw || sy + sr < 0 || sy - sr > vh) continue;
      const g = 200 + Math.floor(p.life * 40);
      ctx.fillStyle = `rgba(${g},${g},${g},${p.life * 0.55})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCar(sim: Simulation): void {
    const { ctx } = this;
    const { state, visual, inputs } = sim;

    ctx.save();
    ctx.translate(state.x * SC + this.camX, state.y * SC + this.camY);
    ctx.rotate(state.yaw);

    // 그림자 (롤/피치에 따라 오프셋)
    ctx.save();
    ctx.translate(-visual.pitch * 16, visual.roll * 18);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, -CAR_LEN / 2 * SC - 2, -CAR_WID / 2 * SC - 2, CAR_LEN * SC + 4, CAR_WID * SC + 4, 9);
    ctx.fill();
    ctx.restore();

    // 휠 (차체 아래) — 전륜은 조향각 반영
    ctx.fillStyle = '#0c0d10';
    const wheelXs = [SPEC.lf, -SPEC.lr];
    const halfTrack = SPEC.track / 2;
    for (const wx of wheelXs) {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(wx * SC, side * halfTrack * SC);
        if (wx > 0) ctx.rotate(state.steer);
        roundRect(ctx, -WHEEL_LEN / 2 * SC, -WHEEL_WID / 2 * SC, WHEEL_LEN * SC, WHEEL_WID * SC, 3);
        ctx.fill();
        ctx.restore();
      }
    }

    // 차체 — 롤에 따라 살짝 횡 시프트
    ctx.save();
    ctx.translate(0, visual.roll * 8);
    const bodyGrad = ctx.createLinearGradient(0, -CAR_WID / 2 * SC, 0, CAR_WID / 2 * SC);
    bodyGrad.addColorStop(0, '#e04340');
    bodyGrad.addColorStop(0.5, '#c8302e');
    bodyGrad.addColorStop(1, '#8e1f1e');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, -CAR_LEN / 2 * SC, -CAR_WID / 2 * SC, CAR_LEN * SC, CAR_WID * SC, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 캐빈 (윈드실드 + 루프)
    ctx.fillStyle = '#181c24';
    roundRect(ctx, -CAR_LEN * 0.28 * SC, -CAR_WID * 0.36 * SC, CAR_LEN * 0.42 * SC, CAR_WID * 0.72 * SC, 6);
    ctx.fill();

    // 본넷 라인
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, CAR_LEN * 0.2 * SC, -CAR_WID * 0.3 * SC, CAR_LEN * 0.24 * SC, CAR_WID * 0.6 * SC, 4);
    ctx.fill();

    // 브레이크 라이트 (후미)
    const brakeLevel = Math.max(inputs.brake, inputs.hand ? 1 : 0);
    if (brakeLevel > 0.05) {
      ctx.shadowColor = 'rgba(255,40,30,0.95)';
      ctx.shadowBlur = 8 + brakeLevel * 16;
      ctx.fillStyle = `rgba(255,46,36,${0.5 + brakeLevel * 0.5})`;
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(120,20,18,0.8)';
    }
    for (const side of [-1, 1]) {
      roundRect(ctx, -CAR_LEN / 2 * SC + 1, side * CAR_WID * 0.32 * SC - 2.5, 4, 5, 2);
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
