# 2026-06-22 ops operator metrics owner meta plan

## 변경 대상 후보
- `src/lib/ops/metricsLog.ts`
- `src/lib/ops/actions/actionLog.ts`
- `src/lib/planning/server/ops/doctorRouteService.ts`
- `src/app/api/ops/actions/run/route.ts`
- `tests/planning/ops/actions-run-route.test.ts`
- `tests/planning/ops/ops-doctor-action-result.test.ts`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 턴을 분석 전용 분해 라운드로 분류했습니다.
- `planning-gate-selector`: ops API route와 로그 저장 경로 변경 가능성에 맞는 최소 검증 세트를 추렸습니다.

## 직전 라운드 검증 이어받기
- PASS: `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/ops/actions-preview-route.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/ops-action-result-status.test.ts`
- PASS: `corepack pnpm planning:auth:check`
- PASS: `corepack pnpm planning:current-screens:guard`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- 미실행: `corepack pnpm e2e:rc`

## 이번 라운드 정리
- `appendOpsActionLog`는 namespace scope meta를 자동 병합하므로 사용자 소유권 메타 보존 위험이 상대적으로 낮습니다.
- `appendOpsMetricEvent`는 `MIGRATION_ACTION` allowlist가 좁아서 `planningUserId`, `authSource`, `planningNamespaceEnabled`가 실제 파일에 누락될 가능성이 있습니다.
- `doctorRouteService`와 `/api/ops/actions/run`는 둘 다 `MIGRATION_ACTION`으로 metrics를 기록하므로 이번 작은 단위는 metrics allowlist와 해당 호출부 검증을 우선 확인하는 것이 맞습니다.

## 남은 리스크
- metrics 파일 보존 메타를 넓히면 민감값이 과하게 남지 않는지 재확인이 필요합니다.
- `actionLog`는 현재 자동 병합에 의존하므로 caller meta와 병합 순서가 바뀌는 후속 수정이 들어오면 다시 검토가 필요합니다.

## 다음 라운드 우선순위
1. `MIGRATION_ACTION` metrics meta 허용 키를 사용자 소유권 기준으로 확정합니다.
2. doctor/action route의 metrics 기록 테스트를 추가해 파일 persisted meta를 직접 검증합니다.
3. 필요하면 action log도 동일 사용자 메타가 실제 파일에 남는지 회귀 테스트를 보강합니다.
