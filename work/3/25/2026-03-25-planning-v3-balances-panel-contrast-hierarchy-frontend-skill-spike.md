# 2026-03-25 planning-v3 balances panel-contrast hierarchy frontend-skill spike

## 변경 파일
- `src/app/planning/v3/balances/_components/BalancesClient.tsx`

## 사용 skill
- `frontend-skill`: app UI 기준으로 card 수를 늘리지 않고 summary/workspace/support hierarchy를 surface tone, spacing, restrained motion으로 다시 세우기 위해 사용.
- `planning-gate-selector`: route/data 계약을 건드리지 않는 balances 화면 UI spike에 맞는 최소 검증 세트를 고르기 위해 사용.
- `route-ssot-check`: `/planning/v3/balances`, `/planning/v3/accounts`, `/planning/v3/transactions/batches` 실존 경로와 `docs/current-screens.md` 기준을 다시 확인하고 `href` 변경이 없는지 고정하기 위해 사용.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실행 검증, 미실행 검증, 남은 리스크를 `/work` 형식으로 남기기 위해 사용.

## 변경 이유
- 현재 배경과 주요 패널 톤이 비슷해서 summary, 입력, 상태, 보조 패널 경계가 한눈에 잘 안 읽힌다.
- `/planning/v3/balances` 첫 화면에서 요약 패널과 실제 작업 패널이 같은 흰 톤으로 겹쳐 보여 시선 시작점과 작업 우선순위가 약하다.
- global theme나 shared component를 건드리지 않고 이 화면 한 곳에서만 single-surface UI spike로 hierarchy를 또렷하게 시험할 필요가 있다.

## 핵심 변경
- [변경 전 메모] 수정 대상 파일: `src/app/planning/v3/balances/page.tsx`, `src/app/planning/v3/balances/_components/BalancesClient.tsx`, 필요 시 local child 파일
- [변경 전 메모] 변경 이유: 현재 배경과 주요 패널 톤이 비슷해서 summary, 입력, 상태, 보조 패널 경계가 한눈에 잘 안 읽힌다.
- [변경 전 메모] 실행할 검증 명령: `pnpm test tests/planning-v3-balances.test.ts tests/planning-v3-balances-api.test.ts`, 필요하면 `pnpm test tests/planning-v3-opening-balances-api.test.ts`, `pnpm lint`, `pnpm build`
- visual thesis: 밝은 neutral canvas 위에 요약 band와 작업 workspace를 한 단계씩 분리해 첫 시선이 배치 선택과 잔액 표 시작점으로 곧바로 모이게 만든다.
- content plan: 상단 summary hero, 배치 선택 workspace, warning/support surface, 월별 잔액 table workspace.
- interaction thesis: 초기 진입 시 상단과 본문 section의 짧은 stagger reveal, 주요 workspace hover/focus 시 surface tone 강조, 표 row hover에서 읽기 흐름을 돕는 미세한 강조만 사용한다.
- hero 아래에 `현재 작업 기준` emerald band와 `빠른 상태 요약` neutral band를 추가해 요약 영역 안에서도 핵심 상태와 보조 메타를 분리했다.
- 본문은 `조회 기준 + 월별 잔액 표`의 좌측 main workspace와 `선택 배치 메모 + 경고/체크 포인트` 우측 support surface로 재구성해 첫 화면이 “핵심 작업영역 + 요약/보조 컨텍스트” 구조로 읽히게 바꿨다.
- 표 영역은 별도 white table inset 안으로 넣고, 상위 container는 `bg-slate-50` band로 낮춰 white-on-white 반복을 줄였다. `data-testid="v3-balance-table"`와 기존 `href`는 그대로 유지했다.
- 실제 바뀐 패널 구분 방식: 페이지 배경 `bg-slate-100/80` step 1단, hero 내부 summary band 2종, main white workspace, `bg-slate-50/90` support surface, white inset/table surface, emerald accent 상태/작업 표시 1곳 중심의 5층 구조로 정리했다.
- 다른 화면으로 확장할지 여부: 이번 라운드는 확장하지 않고 `/planning/v3/balances` 한 곳에서만 spike로 유지한다.

## 검증
- `pnpm test tests/planning-v3-balances.test.ts tests/planning-v3-balances-api.test.ts` — 통과
- `pnpm lint` — 통과 (기존 저장소 전반의 `no-unused-vars` 경고 25건 유지, 이번 라운드에서 새 error는 없음)
- `pnpm build` — 통과
- `git diff --check -- src/app/planning/v3/balances/_components/BalancesClient.tsx` — 통과
- [미실행] `pnpm test tests/planning-v3-opening-balances-api.test.ts` — opening balances route나 데이터 계약은 건드리지 않아 이번 UI spike 기본 검증에서 제외했다.
- [미실행] `pnpm e2e:rc` — selector/data-testid, `href`, 실제 user flow hook를 바꾸지 않았고 이번 라운드는 balances 화면의 surface hierarchy 조정에 한정해 제외했다.

## 남은 리스크
- 모바일에서 support surface가 본문 아래로 내려갈 때도 tone 분리는 유지되지만, 실제 디바이스 기준으로 첫 화면 안에서 summary와 workspace가 충분히 빨리 읽히는지는 추가 시각 점검이 필요하다.
- `balancesActionLinkClassName`처럼 이 화면 전용 밝은 액션 스타일을 로컬로 두었기 때문에, 이후 balances 주변 화면도 같은 톤 정리가 필요해지면 local helper를 shared variant로 승격할지 판단이 필요하다.
- route, data, contract, `docs/current-screens.md`는 변경하지 않았다. 이후 `planning/v3/accounts`나 `transactions/batches`에도 같은 hierarchy 패턴을 적용할지는 별도 검토가 필요하다.
