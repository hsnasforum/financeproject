# 2026-06-22 Ops Support Export Service Boundary

## 변경 파일
- `src/app/api/ops/support/export.zip/route.ts`
- `src/lib/ops/support/supportExportRouteService.ts`
- `tests/planning/ops/support-export-route.test.ts`
- `tests/planning/ops/ops-support-export-route-service-boundary.test.ts`
- `work/6/22/2026-06-22-zzzzzzz-ops-support-export-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준 다음 후보와 최소 skill 조합 확인
- `planning-gate-selector`: ops API route, auth/user scope, build 영향에 맞춘 검증 세트 선정
- `work-log-closeout`: 종료 기록 섹션과 실제 실행 명령 기록 기준 확인

## 변경 이유
- `/api/ops/support/export.zip` route가 doctor payload 수집, app info 조회, support bundle 생성, audit/metric 기록까지 직접 수행하고 있었습니다.
- support bundle은 운영 진단 zip이라 사용자 소유권 경계를 명확히 해야 하며, route는 guard/auth/응답 매핑만 담당하는 것이 기존 ops route service boundary 흐름과 맞습니다.

## 핵심 변경
- `supportExportRouteService`를 추가해 `runOpsDoctor`, `getAppInfo`, `buildSupportBundle`, support export audit/metric 기록을 route 밖으로 이동했습니다.
- support export route는 dev guard, CSRF, `requirePlanningRouteUser`, zip `NextResponse` 매핑만 담당하게 정리했습니다.
- 기존 route-to-route `doctorGET` 호출을 제거하고 service에서 `runOpsDoctor()` 결과를 기존 doctor payload shape로 조립합니다.
- support bundle 생성 시 `planningUser`와 `planningNamespaceEnabled`를 넘겨 namespace 활성 시 current-user audit summary만 포함되도록 했습니다.
- route가 audit store, ops audit/metric, support bundle, app info, doctor route에 직접 접근하지 못하게 boundary 테스트를 추가했습니다.
- AGENTS.md의 manager-first/Spark 조건부 지침에 따라 manager 분해 후 Spark explorer(`gpt-5.3-codex-spark`, `xhigh`)로 금지 패턴과 테스트 후보를 정적 확인했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/support-export-route.test.ts tests/planning/ops/ops-support-export-route-service-boundary.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm sec:check`
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/middleware-security.test.ts`
- PASS: `./node_modules/.bin/vitest run tests/planning/ops/ops-doctor-route-service-boundary.test.ts tests/planning/ops/ops-doctor-action-result.test.ts`
- PASS: `corepack pnpm test` (713 files, 2,283 tests)
- PASS: `corepack pnpm verify` (713 files, 2,283 tests)
- PASS: `corepack pnpm planning:ssot:check`
- 정리: `pnpm verify`가 생성한 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`는 이번 PR 범위가 아니어서 원상 복구했습니다.

## 남은 리스크
- support export service 자체 단위 테스트는 추가하지 않았습니다. route contract 테스트가 zip contents, auth required, namespace audit filtering을 함께 검증합니다.
- UI/e2e는 실행하지 않았습니다. `/ops/support` 경로와 download API shape는 유지했고 route 내부 책임 분리 및 auth scope 보강만 포함했습니다.
- 다음 직접 접근 후보는 `ops/assumptions/refresh`, `ops/feedback/planning`, `ops/planning/doctor`입니다.

## 다음 라운드
- 우선 후보: `src/app/api/ops/assumptions/refresh/route.ts`의 refresh orchestration, metrics/audit 기록, 직접 storage/provider 접근을 service 계층으로 분리하고 boundary 테스트를 추가합니다.
