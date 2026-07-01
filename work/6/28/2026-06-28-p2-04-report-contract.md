# 2026-06-28 P2-04 report contract canonicalization

## 사용 skill
- `planning-gate-selector`: P2-04 범위의 필수/권장 검증 세트 선정에 사용했습니다.
- `work-log-closeout`: 변경 파일, 검증, 잔여 리스크를 `/work` 형식으로 정리하는 데 사용했습니다.

## 변경 이유
- 통합 Markdown P2-04 기준에 따라 production report UI가 `run.outputs.*` 또는 `vm.raw.runJson`을 재해석하지 않고 `ReportVM.interpretation` canonical contract만 보도록 고정하기 위함입니다.
- report/action link가 legacy `@/lib/planner/*` 상수에 의존하지 않도록 중립 planning catalog로 분리하기 위함입니다.
- `/api/planner/compute`는 즉시 제거하지 않고 compatibility boundary로 남기되 owner/status/sunset/telemetry contract를 명시하기 위함입니다.
- `planning:v2:ssot:guard`가 잡은 warning copy/source 위반을 catalog 경유로 정리해 report/guide 해석 소스를 단일화하기 위함입니다.

## 변경 파일
- `src/app/planning/reports/_lib/reportViewModel.ts`
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `src/app/planning/reports/_components/reportDashboard/shared.ts`
- `src/app/planning/reports/_components/ReportRecommendationsSection.tsx`
- `src/app/planning/reports/_components/ReportAdvancedRaw.tsx`
- `src/components/PlanningReportsPrototypeClient.tsx`
- `src/app/api/planner/compute/route.ts`
- `src/lib/planner/compute.ts`
- `src/lib/planning/catalog/index.ts`
- `src/lib/planning/catalog/plannerActionLinks.ts`
- `src/lib/planning/v2/insights/interpret.ts`
- `src/app/planning/_lib/workspaceResultInsights.ts`
- `src/app/planning/_lib/workspaceRunResult.ts`
- `src/app/planning/reports/_lib/dashboardWarnings.ts`
- `tests/planning/report-canonical-contract.test.ts`
- `tests/planner-compute-route-auth.test.ts`
- `docs/planning-v2-architecture.md`
- `docs/planner-deprecated-cleanup.md`

## 핵심 변경
- `ReportVM.interpretation`에 stage, severity, verdict, reasonCodes, recommendedActions를 추가하고 report VM 생성 시 `buildInterpretationVM` 결과를 canonical contract로 노출했습니다.
- production report dashboard와 추천 CTA가 `vm.raw.runJson` 대신 `vm.interpretation`으로 tone/stage를 결정하도록 변경했습니다.
- `ReportVM.raw`에서 `runJson`/`resultDto` fallback 노출을 제거하고 markdown/명시적 debug preview만 허용했습니다.
- legacy planner action link 상수를 `src/lib/planning/catalog/plannerActionLinks.ts`로 이동하고 report 경로의 `@/lib/planner/*` import를 제거했습니다.
- `/api/planner/compute` 성공 응답에 `meta.legacyApi`를 추가하고 `legacy_planner_compute_called` audit telemetry를 best-effort로 기록합니다.
- warning fallback/source 직접 참조를 planning catalog 경유로 바꿔 SSOT guard를 통과시켰습니다.

## 수정 전 실패 증거
- `corepack pnpm test tests/planning/report-canonical-contract.test.ts`
  - 실패: `vm.interpretation` 미노출, dashboard가 raw stage/tone 재해석, report 코드의 legacy/raw 정적 스캔 위반.
- `corepack pnpm test tests/planner-compute-route-auth.test.ts`
  - 실패: `/api/planner/compute` 성공 응답에 `meta.legacyApi`가 없음.
- `corepack pnpm planning:v2:ssot:guard`
  - 실패: hardcoded warning copy 1건, warning source outside catalog 2건.

## 검증
- `corepack pnpm test tests/planning/report-canonical-contract.test.ts tests/planner-compute-route-auth.test.ts` PASS, 2 files / 7 tests.
- `corepack pnpm planning:v2:report:test` PASS, 1 file / 3 tests.
- `corepack pnpm planning:v2:guide:test` PASS, 1 file / 8 tests.
- `corepack pnpm planning:v2:ssot:guard` PASS.
- `corepack pnpm planner:deprecated:guard` PASS.
- `corepack pnpm planning:v2:complete` PASS, fast e2e 6 tests 포함.
- `corepack pnpm planning:v2:regress` PASS, regression 9 cases + full e2e 8 tests.
- `corepack pnpm lint` PASS.
- `corepack pnpm typecheck` PASS.
- `git diff --check` PASS.

## 운영/호환성
- 저장 포맷 migration은 없습니다.
- `ReportVM.raw.runJson`과 `raw.resultDto` production fallback은 제거되어, raw exploration은 markdown 또는 명시적 `runJsonPreview` 계약으로만 확장해야 합니다.
- `/api/planner/compute`는 기존 계산 응답을 유지하되 `meta.legacyApi`와 audit telemetry가 추가됩니다.
- legacy compute sunset은 telemetry inventory 이후 별도 PR에서 확정합니다.

## 남은 리스크
- `ReportAdvancedRaw`의 full JSON 로드는 명시적 preview 계약이 연결된 debug/model 경로에서만 다시 열어야 합니다.
- `/api/planner/compute` 외부 호출자 inventory가 아직 없으므로 sunset 날짜는 `TBD-after-telemetry-inventory`로 유지했습니다.
- warning copy가 catalog plainDescription으로 통일되면서 일부 summary-only health 문구의 세부 days 표현은 data 필드로만 남습니다.

## 다음 라운드 우선순위
- P2-05에서 `scripts/quality_gates.mjs` registry를 추가해 CI, release, local runner의 gate 정의를 한 곳으로 모읍니다.
- auth route coverage의 고정 route count와 proxy 예외 목록을 discovery 기반 계약으로 바꿉니다.
- `release:verify`, `planning:v2:complete`, `planning:auth:check`가 registry를 통해 같은 gate 집합을 보도록 검증합니다.
