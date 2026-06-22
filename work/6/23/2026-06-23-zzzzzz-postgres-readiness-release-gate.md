# 2026-06-23 PostgreSQL readiness release gate 연결

## 변경 파일
- `.gitignore`
- `package.json`
- `scripts/release_verify.mjs`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `docs/release.md`
- `docs/release-checklist.md`
- `docs/maintenance.md`

## 사용 skill
- `finance-skill-routing`: 이번 Finance Project 라운드의 기본/조건부 skill 선택.
- `planning-gate-selector`: release script, DB readiness, route/auth 확인 범위에 맞는 검증 선택.
- `route-ssot-check`: routeAuth 표준화 후보가 실제 route/catalog 변경인지 확인.
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크 기록.
- `gpt-5.3-codex-spark + xhigh`: `src/app/api/**/route.ts`의 `withCurrentPlanningUser` 직접 사용 후보 정적 조사.

## 변경 이유
최신 우선순위에는 Planning API route의 `withCurrentPlanningUser` 직접 사용 5건 정리가 남아 있었지만, 현재 코드와 coverage 테스트 기준으로 `src/app/api/**/route.ts`의 직접 사용 후보는 0건입니다. 따라서 같은 목표의 다음 단계인 PostgreSQL migration readiness를 release verification 흐름에 고정했습니다.

기존 `planning:postgres:readiness` script는 존재했지만 `release:verify`에 연결되어 있지 않았고, 기본 실행은 `--out-dir` 없이 export 단계를 건너뛰었습니다. 이번 라운드는 스키마 승격 전 게이트가 manifest → export → dry-run apply plan → checksum compare 증거를 만들도록 정리했습니다.

## 핵심 변경
- `release:verify` optional gate에 `planning:postgres:readiness`를 추가했습니다.
- `planning:postgres:readiness` package script가 `tmp/planning-postgres-readiness`에 export bundle과 apply-plan을 남기도록 바꿨습니다.
- `tmp/planning-postgres-readiness/`를 `.gitignore`에 추가해 readiness evidence가 dirty worktree를 만들지 않게 했습니다.
- PostgreSQL readiness contract test가 package script와 release gate 연결을 함께 감시하도록 보강했습니다.
- release/maintenance 문서에 PostgreSQL readiness gate와 evidence 경로를 반영했습니다.

## 검증
- `node --check scripts/release_verify.mjs && node --check scripts/planning_postgres_readiness.mjs`
- `corepack pnpm test tests/planning/auth/postgresReadinessScript.test.ts tests/planning/auth/postgresSchemaContract.test.ts tests/planning/auth/postgresMapperContract.test.ts`
- `corepack pnpm planning:postgres:readiness`
- `corepack pnpm planning:auth:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm sec:check`
- `corepack pnpm planning:ssot:check`
- `git diff --check`
- `corepack pnpm release:verify`
- `corepack pnpm build`

## 남은 리스크
- PostgreSQL confirmed apply는 아직 의도적으로 `postgres_apply_not_implemented` 상태로 막혀 있습니다.
- 실제 PostgreSQL disposable target에 대한 `--check-db-connection`은 이번 라운드에서 실행하지 않았습니다.
- `release:verify` 실행 중 Playwright webserver polling 로그와 기존 fallback stderr가 출력됐지만 최종 결과는 PASS입니다.

## 다음 라운드 우선순위
1. `.data/planning/users/{userId}` namespace와 DB `userId` 경계를 repository/service 계층에서 더 줄입니다.
2. PostgreSQL confirmed apply 구현 전, disposable DB connection smoke와 apply 전용 설계 문서를 별도 PR로 분리합니다.
3. browser storage 44개 파일을 영구 설정, 임시 draft, dev/ops unlock, legacy fallback으로 분류합니다.
