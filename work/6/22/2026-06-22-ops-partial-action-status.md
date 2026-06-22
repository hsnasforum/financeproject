# 2026-06-22 ops partial action status 정리

## 변경 파일
- `src/lib/ops/actions/types.ts`
- `src/lib/ops/actions/resultStatus.ts`
- `src/lib/ops/actions/actionLog.ts`
- `src/lib/ops/actions/registry.ts`
- `src/app/api/ops/actions/run/route.ts`
- `src/lib/planning/server/ops/doctorRouteService.ts`
- `tests/planning/ops/ops-action-result-status.test.ts`
- `tests/planning/ops/ops-doctor-action-result.test.ts`
- `work/6/22/2026-06-22-ops-partial-contract-round-plan.md`
- `work/6/22/2026-06-22-ops-partial-action-status.md`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기준으로 이번 구현 라운드의 기본 skill 조합을 확인했습니다.
- planning-gate-selector: ops route 뒤 action/log/status 계약 변경에 맞춰 관련 vitest, lint, build 검증을 선정했습니다.
- work-log-closeout: 실제 변경 파일, 검증 결과, 남은 리스크를 표준 `/work` 형식으로 기록했습니다.

## 변경 이유
- migration 실행 결과 `partial`은 pending/deferred가 남은 상태인데, `/api/ops/actions/run`과 `/api/ops/doctor`의 operator metric/action log에서는 `SUCCESS`처럼 보일 수 있었습니다.
- 운영자가 부분 완료 상태를 완전 성공으로 오판하지 않도록 `PARTIAL_SUCCESS` 상태를 공용 action result 계약에 추가했습니다.

## 핵심 변경
- `OpsActionRunStatus`를 추가해 `SUCCESS`, `PARTIAL_SUCCESS`, `FAILED`를 명시했습니다.
- `RUN_MIGRATIONS` 결과가 `partial`이면 `OpsActionRunResult.status`를 `PARTIAL_SUCCESS`로 반환하게 했습니다.
- `/api/ops/actions/run`은 audit event, action log, metric에 `PARTIAL_SUCCESS`를 보존합니다.
- doctor migration action metric도 `partial` 결과를 `PARTIAL_SUCCESS`로 기록합니다.
- action log 파서가 기존 로그와 새 `PARTIAL_SUCCESS` 로그를 모두 읽도록 확장했습니다.

## 검증
- PASS: `corepack pnpm test tests/planning/ops/ops-action-result-status.test.ts tests/planning/ops/ops-doctor-action-result.test.ts tests/planning/ops/ops-actions-planning-maintenance-boundary.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/actions-preview-route.test.ts tests/planning/ops/ops-doctor-route-service-boundary.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- 미실행: `corepack pnpm e2e:rc`는 UI, selector, route path 변경이 없어 이번 라운드에서는 실행하지 않았습니다.

## 남은 리스크
- `partial`은 API 실행 자체가 실패한 것은 아니므로 응답 `ok:true`는 유지했습니다. 운영자 관측면에서는 metric/action log/audit event로 구분합니다.
- `/api/ops/doctor` POST 응답 본문에는 별도 `status` 필드를 추가하지 않았습니다. 필요하면 다음 라운드에서 UI 메시지까지 확장할 수 있습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
