# 2026-03-12 planning report bootstrap and legacy redirect hardening closeout

## 변경 파일
- `src/app/planning/reports/page.tsx`
- `src/app/planning/reports/prototype/page.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `middleware.ts`
- `tests/planning-reports-page-fallback.test.tsx`
- `tests/middleware-security.test.ts`
- `work/3/12/2026-03-12-planning-report-bootstrap-and-legacy-redirect-hardening-closeout.md`

## 사용 skill
- `planning-gate-selector`: report page, middleware, release gate 영향 범위에 맞는 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 라운드의 실제 수정, 실행한 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 최신 closeout 이후 실제 release blocker는 `planning:v2:compat`와 `planning:v2:regress`가 report bootstrap과 legacy redirect 경계에서 간헐적으로 깨지는 점이었다.
- `/planning/reports`와 `/planning/reports/prototype`는 요청된 실행 기록을 읽는 첫 진입에서 손상된 JSON이나 부분 저장 상태를 만나면 500으로 바로 죽을 수 있었다.
- `/planner/*` 레거시 redirect가 middleware와 app route 양쪽에 중복돼 dev e2e에서 front-door 500과 redirect drift를 만들 수 있었다.
- `report-advanced-toggle`은 hydration 직후에만 클릭 가능해야 하는데, ready 신호를 너무 일찍 주면 full e2e에서 `data-ready=true`인데도 panel이 열리지 않는 false positive가 생겼다.

## 핵심 변경
- `src/app/planning/reports/page.tsx`에서 requested run context 해석을 `try/catch`로 감싸고, 실패 시 서버 500 대신 안전한 안내 문구와 재로딩 흐름으로 fallback 하도록 고쳤다.
- `src/app/planning/reports/prototype/page.tsx`에도 같은 fallback을 맞춰 prototype 경로와 본 경로의 boot contract를 일치시켰다.
- `middleware.ts`에서 `/planner/*` legacy redirect를 제거하고, redirect 소유권을 `src/app/planner/page.tsx`, `src/app/planner/[...slug]/page.tsx` 쪽 app route로만 남겨 중복 경로를 없앴다.
- `src/components/PlanningReportsDashboardClient.tsx`의 advanced toggle은 hydration 이후 `useEffect`로 `interactiveReady`를 켜도록 유지해, 클릭 가능 상태와 e2e 셀렉터 계약이 다시 일치하도록 고쳤다.
- `tests/planning-reports-page-fallback.test.tsx`, `tests/middleware-security.test.ts`에 parse failure fallback과 legacy planner pass-through 회귀 검증을 추가했다.

## 검증
- `pnpm exec eslint src/components/PlanningReportsDashboardClient.tsx`
- `pnpm exec eslint src/components/PlanningReportsDashboardClient.tsx src/app/planning/reports/page.tsx src/app/planning/reports/prototype/page.tsx tests/planning-reports-page-fallback.test.tsx`
- `pnpm test tests/planning-reports-page-fallback.test.tsx`
- `pnpm exec eslint middleware.ts tests/middleware-security.test.ts src/app/planner/[...slug]/page.tsx src/app/planner/page.tsx src/lib/planning/legacyPlannerRedirect.ts`
- `pnpm test tests/middleware-security.test.ts tests/planner-page-redirect.test.ts tests/planning-reports-page-fallback.test.tsx`
- `pnpm planning:v2:compat`
- `pnpm planning:v2:complete`
- `pnpm planning:v2:regress`
- `pnpm release:verify`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm multi-agent:guard`

## 남은 리스크
- blocker 없음.
- active dev runtime이 살아 있는 상태에서 single-owner로 최종 게이트를 통과시켰다. 다음 라운드도 shared `.next*`와 runtime 충돌을 피하려면 같은 원칙을 유지하는 편이 안전하다.
- 큰 dirty worktree는 그대로라, 후속 수정도 기능축별 작은 batch 유지가 필요하다.

## 다음 라운드 우선순위
- release/report와 무관한 다른 dirty 영역은 이번 변경과 섞지 말고 별도 batch로 분리
- shared runtime이 있는 상태에서 build trace warning이 다시 보이면 next build wrapper 쪽 원인만 따로 재현
- 다음 최종 게이트도 single-owner로 `release:verify -> build` 순서를 유지
