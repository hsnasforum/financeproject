# 2026-06-22 Ops Assumptions Sync Service Boundary

## 변경 파일
- `src/app/api/ops/assumptions/sync/route.ts`
- `src/lib/ops/assumptions/assumptionsSyncRouteService.ts`
- `tests/planning-assumptions-ops-route.test.ts`
- `tests/planning/ops/ops-assumptions-sync-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-zzzzzzzzz-ops-assumptions-sync-service-boundary.md`

## 변경 이유
- `/api/ops/assumptions/sync` route handler가 assumptions snapshot 생성, audit 기록, 오류 redaction을 직접 수행하던 경계를 service 계층으로 분리했습니다.
- route handler는 dev/local/CSRF guard, current planning user 확인, service 결과의 HTTP 응답 매핑만 담당하도록 좁혔습니다.
- 성공 payload의 기존 `ok`, `snapshotSummary`, `message` shape는 유지하고, ownership 추적용 `meta.userId/authSource`를 추가했습니다.
- sync 실패 응답과 audit detail 모두 secret-like 값을 노출하지 않도록 redaction 회귀 테스트를 추가했습니다.

## 사용 skill
- `finance-skill-routing`: Finance Project 기본/조건부 skill 선택 기준 확인.
- `planning-gate-selector`: route, auth, ops 변경에 필요한 최소 검증 세트 선택.
- `dart-data-source-hardening`: assumptions/ops 데이터 freshness 경계에서 fallback, freshness, redaction 영향 확인.
- `work-log-closeout`: 종료 기록 형식과 남길 항목 확인.

## Multi-agent 기록
- `manager`: 현재 라운드를 service-boundary 후보 선정, Spark 정적 조사, 구현, 검증/merge 단계로 분해했습니다.
- `gpt-5.3-codex-spark`: `/api/ops/assumptions/sync`의 기존 public contract, service로 이동할 책임, route에 남겨야 할 guard, 금지 import/호출 패턴을 정리했습니다.

## 검증 결과
- PASS: `corepack pnpm vitest run tests/planning-assumptions-ops-route.test.ts tests/planning/ops/ops-assumptions-sync-route-service-boundary.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/middleware-security.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:ssot:check`
- PASS: `corepack pnpm test` 최종 재실행 기준 716 files / 2291 tests.
- PASS: `corepack pnpm verify` 716 files / 2291 tests.

## 검증 중 관찰
- `corepack pnpm test` 초반 2회는 기존 suite의 비결정적 실패로 멈췄습니다.
- 1회차: `tests/planning/ops/backup-api.test.ts` delta backup 기대값 불일치. 단독 재실행 PASS.
- 2회차: `tests/planning/auth/postgresReadinessScript.test.ts` 15초 timeout. 단독 재실행 PASS.
- 이후 full `corepack pnpm test`와 `corepack pnpm verify`가 모두 PASS했습니다.
- `corepack pnpm verify`가 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`를 재생성했으나 이번 PR 범위가 아니므로 되돌렸습니다.

## 남은 리스크
- `/api/ops/assumptions/sync`는 assumptions snapshot sync contract를 정리했지만, UI에서 더 직접적으로 사용하는 `/api/ops/assumptions/latest`는 아직 route-level 로직이 남아 있습니다.
- 데이터 freshness 자체는 이번 라운드에서 live refresh하지 않았습니다. `verify` 기준 freshness report는 기존과 같이 stale snapshot 8건을 보고했습니다.

## 다음 라운드
- manager 권고대로 `/api/ops/assumptions/latest`를 우선 후보로 보고 service boundary와 current-user 응답 meta를 맞춥니다.
