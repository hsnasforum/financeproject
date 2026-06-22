# 2026-06-22 Ops Assumptions Latest Service Boundary

## 변경 파일
- `src/app/api/ops/assumptions/latest/route.ts`
- `src/lib/ops/assumptions/assumptionsLatestRouteService.ts`
- `tests/planning-assumptions-ops-route.test.ts`
- `tests/planning/ops/ops-assumptions-latest-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-zzzzzzzzzz-ops-assumptions-latest-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준 다음 후보와 Finance Project skill 조합 확인.
- `planning-gate-selector`: ops API route, auth/user scope, build 영향에 맞춘 검증 세트 선정.
- `dart-data-source-hardening`: assumptions latest의 freshness/stale 상태와 오류 redaction 영향 확인.
- `work-log-closeout`: 종료 기록 섹션과 실제 실행 명령 기록 기준 확인.
- AGENTS.md의 manager-first/Spark 조건부 지침에 따라 manager 분해 후 Spark explorer(`gpt-5.3-codex-spark`, `xhigh`)로 route contract와 forbidden pattern을 정적 확인.

## 변경 이유
- `/api/ops/assumptions/latest` route가 latest snapshot storage 조회와 snapshotId 계산을 직접 수행하고 있었습니다.
- 해당 route는 `requirePlanningRouteUser`를 거치지 않아 sync/refresh와 달리 current planning user meta가 성공 응답에 붙지 않았습니다.
- UI가 읽는 기존 `ok`, `snapshot`, `snapshotId` shape는 유지하면서 route 책임을 guard/auth/응답 매핑으로 좁히기 위해 service boundary가 필요했습니다.

## 핵심 변경
- `assumptionsLatestRouteService`를 추가해 latest snapshot 조회, snapshotId 계산, storage 오류 redaction을 route 밖으로 이동했습니다.
- latest route는 `onlyDev`, local/same-origin/dev unlock/CSRF guard, `requirePlanningRouteUser`, service 결과의 HTTP 응답 매핑만 담당하게 정리했습니다.
- 성공 응답의 기존 `ok/snapshot/snapshotId` shape는 유지하고 `meta.userId/authSource`를 추가했습니다.
- `PLANNING_AUTH_REQUIRED=1`에서 인증 신호 없는 latest 조회는 storage 접근 전에 `401 UNAUTHENTICATED`로 차단됩니다.
- route가 assumptions storage와 redaction helper에 직접 접근하지 못하게 boundary 테스트를 추가했습니다.

## 검증
- PASS: `corepack pnpm vitest run tests/planning-assumptions-ops-route.test.ts tests/planning/ops/ops-assumptions-latest-route-service-boundary.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/middleware-security.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm sec:check`
- PASS: `corepack pnpm planning:ssot:check`
- 1차 `corepack pnpm test`: FAIL. 기존 suite의 비결정 실패로 `tests/planning/auth/postgresReadinessScript.test.ts` timeout 1건, `tests/planning/ops/backup-api.test.ts` rollback delta assertion 1건 발생.
- PASS: `corepack pnpm vitest run tests/planning/auth/postgresReadinessScript.test.ts`
- PASS: `corepack pnpm vitest run tests/planning/ops/backup-api.test.ts`
- PASS: `corepack pnpm test` 재실행 기준 717 files / 2295 tests.
- PASS: `corepack pnpm verify` 717 files / 2295 tests.
- 정리: `corepack pnpm verify`가 생성한 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`는 이번 PR 범위가 아니어서 원상 복구했습니다.

## 남은 리스크
- UI/e2e는 실행하지 않았습니다. `/ops/assumptions`와 `/ops/assumptions/history`가 읽는 `snapshot`과 `snapshotId` 필드는 유지하고 `meta`만 추가했습니다.
- latest snapshot 저장소 자체는 shared assumptions 파일 구조를 유지했습니다. 이번 변경은 사용자별 snapshot 분리가 아니라 routeAuth/meta 표준화와 service boundary 정리입니다.
- `corepack pnpm verify` 기준 freshness snapshot 8개는 여전히 stale입니다. 이번 변경은 live refresh 증거 생성 범위가 아닙니다.

## 다음 라운드
- 우선 후보: `/api/ops/assumptions/history`, `/api/ops/assumptions/history/[id]`, `/api/ops/assumptions/set-latest` 계열의 직접 storage 접근을 service 계층으로 분리하고 current-user meta를 맞춥니다.
