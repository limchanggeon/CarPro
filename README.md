# CarPro — GR86 SIM v4

> 토요타 GR86을 기반으로 한 **웹 레이싱 시뮬레이터**
> v4부터 **React + TypeScript + Vite** 아키텍처로 전면 재설계 — 물리 엔진은 타입 안전한 독립 모듈, 렌더링은 단일 캔버스 파이프라인, HUD는 React 컴포넌트

![Track Map](map.png)

## 소개

CarPro는 **인제 스피디움** 서킷에서 토요타 GR86을 주행하는 2D 탑다운 레이싱 시뮬레이터입니다.

- **Pacejka Magic Formula 타이어 모델** (복합 슬립, 하중 민감도, 온도/마모 모델링)
- **GR86 FA24 엔진 토크 커브** 재현 (최대 토크 250 Nm @ 3700 RPM, 4000 RPM 토크 딥 포함)
- **6단 수동 변속기** + 클러치(클러치 덤프 각운동량 보존), 실차 기어비/종감속비(4.1)
- **브레이크 페이드** (m·c 열용량 모델, 동적 EBD 전후 배분)
- **운전 보조 시스템**: ABS / TC(4단계) / ESC (요레이트 피드백)
- **랩 타이머**: 방향성 라인 통과 판정, 베스트/라스트/델타 + 랩 히스토리
- **절차적 사운드 합성**: 오실레이터 6개로 4기통 엔진음 + 스킬음 + 풍절음 + 디셀 팝
- **비주얼 이펙트**: 스키드 마크, 타이어 스모크, 카메라 룩어헤드/셰이크, 브레이크등

### v4 신규 기능

- 🔴 **라이브 텔레메트리 그래프** — 속도/스로틀/브레이크 트레이스 실시간 표시
- 🏁 **랩 히스토리 패널** — 최근 5랩 기록, 베스트 랩 하이라이트
- 🎮 **게임패드 지원** — 스틱 조향, 아날로그 트리거 가감속, 숄더 버튼 시프트
- 🖱️ **클릭 가능한 보조장치 토글** — ABS/TC/ESC 칩 클릭으로 on/off

## 실행 방법

```bash
npm install
npm run dev        # 개발 서버 → http://localhost:5173
npm run build      # 타입체크 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 미리보기
```

> 오디오는 브라우저 정책상 첫 키 입력/클릭 후 활성화됩니다.

### 레거시 버전 (v3, 단일 HTML 파일)

빌드 없이 실행되는 이전 버전은 [legacy/main.html](legacy/main.html)에 보존되어 있습니다.

```bash
cd legacy
python3 -m http.server 8000
# http://localhost:8000/main.html
```

## 조작법

| 입력 | 기능 |
| --- | --- |
| `W` / `S` | 가속 / 브레이크 |
| `A` / `D` | 조향 |
| `Space` | 핸드브레이크 |
| `[` / `]` | 기어 다운 / 업 |
| `1` / `2` / `3` | ABS / TC / ESC 토글 |
| `4` | TC 레벨 변경 (off → mild → med → strict) |
| `L` | 랩 타이머 HUD 토글 |
| `C` | 스키드 마크 지우기 |
| `R` | 스타트 지점으로 리셋 |
| `H` | 도움말 표시 |
| 🎮 게임패드 | 좌스틱 조향 · RT/LT 가감속 · RB/LB 시프트 · A 핸드브레이크 |

하단 대시보드에서 **타이어 마찰계수(μ)**, **최대 조향각**, **볼륨**을 실시간 조절할 수 있습니다.

## 아키텍처

```
carpro/
├── src/
│   ├── engine/              # 프레임워크 독립 시뮬레이션 엔진 (순수 TS)
│   │   ├── constants.ts     #   차량 제원(SPEC) / 시뮬레이션 설정 / 트랙 메타
│   │   ├── physics.ts       #   Pacejka 결합슬립, 파워트레인, 열역학, ABS/TC/ESC
│   │   ├── track.ts         #   map.png 픽셀 마스크 (플러드필+팽창) + 아스팔트 렌더
│   │   ├── audio.ts         #   Web Audio 절차적 사운드 합성
│   │   └── simulation.ts    #   게임 루프, 입력(키보드/게임패드), 랩 타이밍, 파티클
│   ├── render/
│   │   └── renderer.ts      # 단일 캔버스 렌더 파이프라인 (트랙/차량/스키드/카메라)
│   ├── ui/                  # React HUD 컴포넌트
│   │   ├── Hud.tsx, SpeedGear.tsx, GMeter.tsx, LapTimer.tsx,
│   │   ├── Minimap.tsx, SimPanel.tsx, TelemetryGraph.tsx, Dashboard.tsx
│   ├── store.ts             # zustand — 엔진이 publish하는 텔레메트리 / 설정
│   ├── App.tsx / main.tsx
│   └── styles.css           # 다크 글래스모피즘 HUD
├── public/map.png           # 인제 스피디움 트랙 맵
├── legacy/                  # v3 단일 파일 버전 (그대로 플레이 가능)
│   ├── main.html
│   └── map.png
└── index.html / vite.config.ts / tsconfig.json
```

### 설계 원칙

- `engine/`은 React를 모름 — 물리·트랙·오디오는 순수 TS 모듈이라 단위 테스트/재사용 가능
- 물리 루프(60 FPS × 8 substeps)는 rAF에서 직접 돌고, 매 프레임 **텔레메트리 스냅샷**을 zustand에 publish
- React HUD는 세분화된 selector로 구독 → 값이 바뀐 컴포넌트만 리렌더
- 텔레메트리 그래프 같은 고빈도 시각화는 React 렌더 사이클 밖에서 자체 rAF + 캔버스로 처리
- v3의 DOM transform 렌더링을 **단일 캔버스 드로잉**으로 교체 (가시 영역만 source-rect 클리핑)

## 물리 엔진 하이라이트

| 항목 | 구현 내용 |
| --- | --- |
| 타이어 | Pacejka MF σ-결합슬립, 하중 1.5배 증가 시 그립 약 7~8% 감소 |
| 타이어 온도 | 최적 85°C, 비대칭 가우시안 (저온 완만 / 과열 급락) + 마모 그립 저하 |
| 브레이크 | 500~700°C 소프트 니 이후 급격한 페이드, 하중 이동 추종 EBD |
| 차량 동역학 | 전후 53:47, 관성 모멘트, 에어로 양력/항력, 코리올리 항 포함 |
| 수치 적분 | 프레임당 8 서브스텝, 저속 발진 no-slip 스냅 가드 |

## 기술 스택

- **React 18 + TypeScript + Vite** — UI/빌드
- **zustand** — 엔진↔UI 텔레메트리 브리지
- **Canvas 2D API** — 월드 렌더링
- **Web Audio API** — 절차적 사운드 합성

## 라이선스

학습 및 포트폴리오 목적의 프로젝트입니다.
