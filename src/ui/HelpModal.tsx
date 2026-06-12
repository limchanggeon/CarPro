import { useStore } from '../store';

const KEYS: Array<[string, string]> = [
  ['W / S', '가속 / 브레이크'],
  ['A / D', '조향'],
  ['Space', '핸드브레이크'],
  ['[ / ]', '기어 다운 / 업'],
  ['1 · 2 · 3', 'ABS / TC / ESC 토글'],
  ['4', 'TC 레벨 변경'],
  ['L', '타이밍 위젯 토글'],
  ['C', '스키드 마크 지우기'],
  ['R', '리셋'],
  ['H', '도움말'],
];

export function HelpModal() {
  const show = useStore((s) => s.ui.showHelp);
  const toggle = useStore((s) => s.toggleHelp);
  if (!show) return null;

  return (
    <div id="help-backdrop" onClick={toggle}>
      <div id="help-modal" onClick={(e) => e.stopPropagation()}>
        <h3>GR86 SIM <span>v4</span></h3>
        <div className="hm-grid">
          {KEYS.map(([k, desc]) => (
            <div key={k} className="hm-row">
              <kbd>{k}</kbd><span>{desc}</span>
            </div>
          ))}
        </div>
        <div className="hm-pad">🎮 게임패드 — 좌스틱 조향 · RT/LT 가감속 · RB/LB 시프트 · A 핸드브레이크</div>
        <button onClick={toggle}>DRIVE ▸</button>
      </div>
    </div>
  );
}
