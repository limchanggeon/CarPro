// 라이브 텔레메트리 트레이스 (속도 / 스로틀 / 브레이크)
// React 렌더 사이클 밖에서 자체 rAF로 캔버스에 그려 60fps 리렌더 비용 제거

import { useEffect, useRef } from 'react';
import { useStore } from '../store';

const W = 230;
const H = 72;
const SAMPLES = 230;

export function TelemetryGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const speed = new Float32Array(SAMPLES);
    const thr = new Float32Array(SAMPLES);
    const brk = new Float32Array(SAMPLES);
    let head = 0;
    let raf = 0;

    const drawTrace = (buf: Float32Array, color: string, scale: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < SAMPLES; i++) {
        const v = buf[(head + i) % SAMPLES];
        const x = (i / (SAMPLES - 1)) * W;
        const y = H - 3 - Math.min(1, v / scale) * (H - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const loop = () => {
      const t = useStore.getState().telemetry;
      speed[head] = t.speedKmh;
      thr[head] = t.throttle;
      brk[head] = t.brake;
      head = (head + 1) % SAMPLES;

      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      for (let gy = 1; gy < 3; gy++) {
        ctx.beginPath();
        ctx.moveTo(0, (H / 3) * gy);
        ctx.lineTo(W, (H / 3) * gy);
        ctx.stroke();
      }
      drawTrace(speed, 'rgba(120,200,255,0.9)', 220);
      drawTrace(thr, 'rgba(80,230,140,0.85)', 1);
      drawTrace(brk, 'rgba(255,80,70,0.85)', 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} width={W} height={H} />;
}
