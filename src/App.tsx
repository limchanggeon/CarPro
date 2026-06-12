import { useEffect, useRef } from 'react';
import { getSimulation } from './engine/simulation';
import { useStore } from './store';
import { Hud } from './ui/Hud';
import { Dashboard } from './ui/Dashboard';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedFx = useStore((s) => Math.round(s.telemetry.speedFx * 100) / 100);

  useEffect(() => {
    const sim = getSimulation();
    if (canvasRef.current) sim.attach(canvasRef.current);
    sim.start();
    void sim.loadTrack(`${import.meta.env.BASE_URL}map.png`);
    return () => sim.stop();
  }, []);

  return (
    <div id="app">
      <div id="viewport">
        <canvas ref={canvasRef} id="worldCanvas" />
        <div id="vignette" style={{ opacity: 0.25 + speedFx * 0.45 }} />
        <Hud />
      </div>
      <Dashboard />
    </div>
  );
}
