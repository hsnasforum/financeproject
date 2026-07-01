# 2026-06-28 P2-04 canonical contract plan

## 변경 파일
- `work/6/28/2026-06-28-p2-04-canonical-contract-plan.md`

## 사용 skill
- `planning-gate-selector`: P2-04 범위에 맞는 최소 검증 세트와 추가 권장 검증을 고르는 데 사용했습니다.
- `work-log-closeout`: `/work` 계획 노트 형식과 필수 기록 항목을 맞추는 데 사용했습니다.

## 변경 이유
- 통합 Markdown P2-04 범위를 구현 전에 3~5단계로 분해하고, 메인 작업과 병렬 조사/검증 범위를 분리해 다음 작업자가 안전하게 이어받도록 하기 위함입니다.
- 현재 production report 경로가 `vm.raw.runJson` 재해석과 `@/lib/planner/*` action link 상수에 직접 의존하고 있어 canonical contract 고정과 legacy planner 격리가 동시에 필요합니다.
- 다른 작업자가 동시에 코드를 만질 수 있으므로 이번 라운드는 계획과 영향 범위 정리만 수행하고 기존 변경은 되돌리지 않았습니다.

## 직접 변경
- 코드 파일은 수정하지 않았고, P2-04 계획/영향 범위/검증 세트만 문서화했습니다.
- 현재 핵심 충돌 지점을 `src/app/planning/reports/_components/reportDashboard/shared.ts`, `src/app/planning/reports/_components/ReportRecommendationsSection.tsx`, `src/app/planning/reports/_lib/reportViewModel.ts`, `src/lib/planning/v2/insights/interpretationVm.ts`, `src/app/api/planner/compute/route.ts`, `src/lib/planner/compute.ts`로 좁혔습니다.
- canonical report 경로는 `run.outputs.engine + outputs.resultDto -> reportInputContract -> ReportVM -> interpretation VM -> report UI`로 고정하고, raw/runJson은 `ReportAdvancedRaw` 같은 debug 전용 경로로 한정하는 방향을 기록했습니다.
- legacy planner는 `/api/planner/compute`와 `src/lib/planner/*`를 compatibility boundary로 남기되 deprecation contract, telemetry, owner, sunset, fixture 위치를 route 수준에서 명시하는 방향을 기록했습니다.

## 검증
- 실행한 검증: `git diff --check -- work/6/28/2026-06-28-p2-04-canonical-contract-plan.md`
- 미실행 검증: `corepack pnpm planning:v2:report:test`
- 미실행 검증: `corepack pnpm planning:v2:guide:test`
- 미실행 검증: `corepack pnpm planning:v2:ssot:guard`
- 미실행 검증: `corepack pnpm planning:v2:complete`
- 미실행 검증: `corepack pnpm lint`
- 미실행 검증: `corepack pnpm typecheck`
- 추가 권장 미실행 검증: `corepack pnpm planner:deprecated:guard`

## 남은 리스크
- production report UI의 stage/tone/CTA가 현재 raw run 재해석과 수동 임계값에 기대고 있어, canonical interpretation 결과를 중간 계약으로 승격하지 않으면 P2-04 수용 기준이 부분 충족에 그칠 수 있습니다.
- `src/lib/planner/compute.ts`의 action link 상수는 legacy API 계산 규칙과 함께 묶여 있어, catalog만 분리할 때 import 경계와 동작 회귀를 같이 검증해야 합니다.
- `/api/planner/compute`는 same-origin + current-user scope는 이미 있으나 deprecation telemetry/owner/sunset/fixture contract는 코드와 문서에서 아직 한 번에 보이지 않습니다.
- 다음 라운드 우선순위: 1) canonical interpretation contract 고정 2) report UI raw 의존 제거 3) action catalog 분리 4) legacy planner compatibility contract/telemetry 추가 5) 검증 게이트 실행
