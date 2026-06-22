# 2026-06-22 Ops Metrics Route Service Boundary

## 변경 파일
- `src/app/api/ops/metrics/route.ts`
- `src/app/api/ops/metrics/events/route.ts`
- `src/app/api/ops/metrics/summary/route.ts`
- `src/lib/ops/metrics/metricsRouteService.ts`
- `tests/planning/ops/ops-metrics-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-zzzz-ops-metrics-route-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 적용할 Finance Project skill 범위 확인
- `planning-gate-selector`: route/service boundary 변경에 필요한 검증 세트 선정
- `work-log-closeout`: 종료 기록 형식과 필수 항목 확인

## 변경 이유
- `/api/ops/metrics`, `/api/ops/metrics/events`, `/api/ops/metrics/summary`가 route 내부에서 metrics store/log, ops policy, planning fallback summary를 직접 읽고 있어 route handler 책임이 커져 있었습니다.
- 운영형 SaaS 완성도 라운드 기준으로 route는 guard, 입력 파싱, 응답 매핑만 담당하고 저장소/정책/요약 조합은 service 계층에 묶는 편이 이후 user scope와 DB 전환 검증에 안전합니다.

## 핵심 변경
- `metricsRouteService`를 추가해 metrics log page, metrics event page, summary page 읽기와 type/range/limit parsing을 모았습니다.
- 세 route는 기존 dev/local/same-origin/CSRF/user guard와 public response shape를 유지하면서 service 호출로 전환했습니다.
- boundary 회귀 테스트를 추가해 metrics route가 `metricsStore`, `metricsLog`, `opsPolicy`, planning fallback/run store helper를 직접 import하거나 호출하지 못하게 고정했습니다.
- manager 분해 결과 backup route 재스캔보다 남은 ops route 직접 접근 정리가 우선이라고 판단했습니다.
- Spark subagent(`gpt-5.3-codex-spark`, `xhigh`)로 정적 후보를 병렬 조사했고, 다음 우선 후보는 `ops/actions/run`, `ops/support/export.zip`, `ops/assumptions/refresh`, `ops/feedback/planning`, `ops/planning/doctor`입니다.

## 검증
- PASS `./node_modules/.bin/vitest run tests/planning/ops/ops-metrics-route-service-boundary.test.ts tests/planning/ops/metrics-api-routes.test.ts tests/planning/ops/metricsStore.test.ts tests/planning/ops/metricsLog.test.ts`
- PASS `git diff --check`
- PASS `corepack pnpm sec:check`
- PASS `corepack pnpm lint` after removing an unused route helper
- FAIL initial concurrent `corepack pnpm typecheck`: `.next/types` generated file race while `pnpm build` was running
- PASS `corepack pnpm typecheck` rerun by itself
- PASS `corepack pnpm build`
- PASS `corepack pnpm test` (710 files, 2,278 tests)
- PASS `corepack pnpm planning:ssot:check`
- PASS `corepack pnpm verify` (regenerated report docs were restored because they were outside this PR scope)
- PASS `git diff --check --cached`
- PASS `corepack pnpm multi-agent:guard`

## 남은 리스크
- 이번 PR은 service boundary 정리이며 metrics 응답 계약 자체를 바꾸지 않습니다.
- `ops/actions/run`과 `ops/support/export.zip`에는 아직 audit/security/metrics/planning 저장소 직접 접근이 남아 있어 다음 라운드에서 분리해야 합니다.

## 다음 라운드
- `ops/actions/run` route의 audit/security/metrics/planning 직접 접근을 action runner service로 묶고, run progress/journal 부작용을 회귀 테스트로 고정합니다.
