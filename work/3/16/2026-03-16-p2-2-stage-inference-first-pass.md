# 2026-03-16 P2-2 stage inference first pass

## 이번 배치 대상 항목 ID
- `P2-2`

## 변경 파일
- `src/lib/recommend/types.ts`
- `src/lib/schemas/recommendProfile.ts`
- `src/app/api/recommend/route.ts`
- `src/lib/recommend/savedRunsStore.ts`
- `tests/schemas-recommend-profile.test.ts`
- `tests/recommend-api.test.ts`
- `tests/saved-runs-store.test.ts`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-2-stage-inference-first-pass.md`

## 사용 skill
- `planning-gate-selector`: recommend contract 1차 도입에 맞는 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크, 다음 우선순위를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P2-1`에서 문서로 고정한 canonical contract를 바탕으로 recommend가 `planning.runId`와 `planning.summary.stage`를 실제로 읽을 수 있는 첫 배치를 열기 위해서입니다.
- 기존 `planningContext` 4개 입력은 legacy bridge로 유지하되, `planningLinkage.stageInference = "disabled"` 상태를 최소 범위에서 해제할 필요가 있었습니다.

## 핵심 변경
- `UserRecommendProfile`과 parser/store에 optional `planning` handoff를 추가해 `runId`, `summary.stage`, optional `summary.overallStatus`를 받을 수 있게 맞췄습니다.
- `/api/recommend`는 `planning.summary.stage`가 있으면 이를 우선 사용하고, 없을 때만 legacy `planningContext` 4개 숫자로 stage를 추론하도록 바꿨습니다.
- response `meta.planningLinkage`는 `readiness`, `metricsCount`, `stageInference`, `inferenceSource`를 함께 내려 planning summary 기반 활성 상태를 표현하도록 바꿨습니다.
- recommend saved run/profile normalize 경로가 새 `planning` 필드를 받아도 깨지지 않게 맞췄고, 관련 schema/API/store 테스트를 보강했습니다.

## 검증
- `pnpm test`
  - 실패. 기존 baseline 실패가 함께 재현됐습니다.
  - 이번 배치와 직접 관련 없는 실패 예:
    - `tests/dart-search-client.test.tsx`
    - `tests/planning-v3-news-alerts-ui.test.tsx`
    - `tests/planning-v3-news-settings-ui.test.tsx`
    - `tests/planning-v2/reportInterpretationAdapter.test.ts`
    - `tests/planning-v2-api/reports-export-html-route.test.ts`
    - `tests/planning/components/interpretationGuide.test.tsx`
    - `tests/planning/reports/reportDashboardOverrides.test.tsx`
    - `tests/planning/ui/homeQuickRulesStatus.test.tsx`
    - `tests/planning/v2/insights/interpretationVm.test.ts`
- `pnpm exec vitest run tests/schemas-recommend-profile.test.ts tests/recommend-api.test.ts tests/saved-runs-store.test.ts`
  - 통과. 변경 범위에 직접 닿는 recommend schema/API/store 테스트 14개가 모두 통과했습니다.
- `pnpm build`
  - 통과. standalone traced file copy warning이 있었지만 exit code는 `0`이었습니다.
- `pnpm planning:v2:compat`
  - 실패. recommend contract 범위가 아니라 기존 `tests/e2e/planning-v2-fast.spec.ts` 2건에서 막혔습니다.
  - 재현된 실패:
    - `report-advanced-raw` selector 미노출
    - `run-button` accessible name 기대 `실행` vs 실제 `플래닝 실행`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/lib/recommend/types.ts src/lib/schemas/recommendProfile.ts src/app/api/recommend/route.ts src/lib/recommend/savedRunsStore.ts tests/schemas-recommend-profile.test.ts tests/recommend-api.test.ts tests/saved-runs-store.test.ts work/3/16/2026-03-16-p2-2-stage-inference-first-pass.md`

## 남은 리스크
- producer UI가 아직 `planning.runId`와 planning summary를 실제로 보내지 않으므로, 이번 라운드는 consumer contract만 먼저 연 상태입니다.
- `planning:v2:compat`는 기존 planning v2 fast e2e 2건 때문에 막혀 있어, `P2-2` closeout gate로 쓰기에는 아직 범위가 넓습니다.
- `planning.summary`는 현재 stage/overallStatus까지만 받으므로, `P2-3`에서 action preset을 붙일 때 summary/action DTO를 더 넓혀야 합니다.

## 다음 우선순위
- `P2-2` 후속: producer가 `planning.runId`와 `planning.summary.stage`를 실제 `/recommend` request에 싣는 가장 작은 handoff 경로를 1건 열기
- `P2-3`: `PlanningActionDto` 기준 CTA preset과 recommend preset mapping 초안 정리
