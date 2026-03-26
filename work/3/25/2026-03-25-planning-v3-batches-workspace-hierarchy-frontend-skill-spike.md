# 2026-03-25 planning-v3 batches workspace-hierarchy frontend-skill spike

## 변경 파일
- `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`

## 사용 skill
- `frontend-skill`: app UI 기준으로 list pane, action strip, summary-support pane를 카드 수 증가 없이 surface tone, spacing, restrained motion으로 다시 세우기 위해 사용.
- `planning-gate-selector`: batch center 화면 UI spike에 맞는 최소 검증 세트를 고르기 위해 사용.
- `route-ssot-check`: `/planning/v3/batches`, `/planning/v3/batches/[id]`, 연결 링크 경로들의 실존 여부와 `docs/current-screens.md` 기준을 다시 확인하고 `href` 변경이 없는지 고정하기 위해 사용.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실행 검증, 미실행 검증, 남은 리스크를 `/work` 형식으로 남기기 위해 사용.

## 변경 이유
- 현재 배경과 패널 톤이 비슷해서 배치 목록, 핵심 작업영역, 요약/보조 정보의 우선순위가 한눈에 잘 안 읽힌다.
- `/planning/v3/batches` 첫 화면이 “리스트 모음”처럼 보여 primary workspace와 우측 summary-support pane의 역할 구분이 약하다.
- global theme나 shared component를 건드리지 않고 이 화면 한 곳에서만 single-surface UI spike로 hierarchy를 또렷하게 시험할 필요가 있다.

## 핵심 변경
- [변경 전 메모] 수정 대상 파일: `src/app/planning/v3/batches/page.tsx`, `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`, 필요하면 이 화면 전용 local child 파일
- [변경 전 메모] 변경 이유: 현재 배경과 패널 톤이 비슷해서 배치 목록, 핵심 작업영역, 요약/보조 정보의 우선순위가 한눈에 잘 안 읽힌다.
- [변경 전 메모] 실행할 검증 명령: `pnpm test tests/planning-v3-batch-center-ui.test.tsx tests/planning-v3-batch-center-api.test.ts tests/planning-v3-batches-api.test.ts`, `pnpm lint`, `pnpm build`
- visual thesis: 밝은 neutral canvas 위에 목록 workspace와 우측 summary-support pane를 단계적으로 분리해 첫 시선이 배치 목록과 주요 액션 행으로 곧바로 모이게 만든다.
- content plan: 상단 작업 요약/링크 영역, 배치 목록 workspace, 우측 선택 가이드/상태 summary pane, 하단 support note surface.
- interaction thesis: 초기 진입 시 상단과 본문 pane의 짧은 stagger reveal, active row와 pane hover에서 미세한 hierarchy 강조, 액션 strip 주변의 restrained emphasis만 사용한다.
- 상단을 단순 카드에서 작업 요약 surface로 바꾸고, 링크 묶음과 `현재 시작점` emerald band를 나눠 첫 화면에서 list workspace의 진입 맥락이 바로 읽히게 조정했다.
- 본문은 좌측 `배치 목록 workspace`와 우측 `현재 목록 요약 / 지원 메모` pane으로 나누고, 목록 상단 action strip과 표 inset을 따로 낮춰 white-on-white 반복을 줄였다.
- 목록 표는 기존 `data-testid="v3-batches-list"`와 액션 계약을 유지하면서, 최근 배치 행만 단일 accent로 가볍게 강조해 시선 시작점을 만들었다.
- 실제 바뀐 workspace/panel 구분 방식: 페이지 배경 `bg-slate-100/80` step 1단, 상단 white workspace + emerald start band, 좌측 main list pane, `bg-slate-50/90` 우측 summary/support pane, white table inset과 white note inset으로 5층 구조를 만들었다.
- `/planning/v3/batches/[id]`까지 확장할지 여부: 이번 라운드는 확장하지 않고 `/planning/v3/batches` 한 곳에서만 spike로 유지한다.

## 검증
- `git diff --check -- src/app/planning/v3/batches/_components/BatchesCenterClient.tsx` — 통과
- `pnpm test tests/planning-v3-batch-center-ui.test.tsx tests/planning-v3-batch-center-api.test.ts tests/planning-v3-batches-api.test.ts` — 통과
- `pnpm lint` — 통과 (기존 저장소 전반의 `no-unused-vars` 경고 25건 유지, 이번 라운드에서 새 error는 없음)
- `pnpm build` — 통과
- [미실행] `pnpm e2e:rc` — 기존 selector/data-testid, `href`, 실제 user flow hook를 바꾸지 않았고 이번 라운드는 batch center 화면의 surface hierarchy 조정에 한정해 제외했다.

## 남은 리스크
- 최근 배치를 첫 행 accent로 강조하는 방식은 정렬 결과가 바뀌는 데이터에서만 의미가 분명하다. 사용자가 다른 정렬 의미를 기대한다면 active-row 개념을 별도로 도입할지 검토가 필요하다.
- 모바일에서 우측 summary/support pane가 목록 아래로 내려갈 때도 tone 분리는 유지되지만, 실제 디바이스에서 first viewport 안에 list workspace 우선순위가 충분히 선명한지는 추가 시각 점검이 필요하다.
- route, data, contract, `docs/current-screens.md`는 변경하지 않았다. 이후 `/planning/v3/batches/[id]`까지 같은 hierarchy 패턴을 확장할지는 별도 라운드에서 판단해야 한다.
