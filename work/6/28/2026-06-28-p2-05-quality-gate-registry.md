# 2026-06-28 P2-05 quality gate registry

## 사용 skill
- `planning-gate-selector`: quality gate registry, CI/release runner, auth coverage 변경에 필요한 검증 세트 선정에 사용했습니다.
- `work-log-closeout`: `/work` 종료 기록의 변경 파일, 검증, 잔여 리스크 정리에 사용했습니다.

## 변경 이유
- P2-05 기준에 따라 local/CI/release가 같은 required gate 집합을 쓰도록 gate ID, tier, suite membership을 단일 registry로 모으기 위함입니다.
- `planning:auth:check`의 긴 테스트 파일 문자열과 `release:verify`/`planning:v2:complete`의 하드코딩 배열을 줄이고, 의미 있는 required/optional/advisory 분류를 한 곳에서 확인하기 위함입니다.
- planning route coverage가 fixed count와 고정 proxy 예외 목록 대신 현재 route 파일을 discovery해서 검사하도록 바꾸기 위함입니다.
- 전체 `pnpm test`에서 드러난 낡은 테스트 격리/계약 기대값을 현재 코드 책임에 맞춰 고정하기 위함입니다.

## 변경 파일
- `.github/workflows/ci.yml`
- `docs/maintenance.md`
- `docs/release.md`
- `docs/release-checklist.md`
- `package.json`
- `scripts/quality_gates.mjs`
- `scripts/quality_gates_runner.mjs`
- `scripts/release_verify.mjs`
- `scripts/planning_v2_complete.mjs`
- `tests/quality-gates-registry.test.ts`
- `tests/planning/auth/authConfigContract.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts`
- `tests/planning-v2/reportDashboardWarnings.test.ts`
- `tests/planning-v3-news-api.test.ts`
- `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
- `tests/planning/ui/workspaceRunResult.test.ts`
- `vitest.config.ts`
- `work/6/28/2026-06-28-p2-04-report-contract.md`
- `work/6/28/2026-06-28-p2-05-quality-gate-plan.md`
- `work/6/28/2026-06-28-p2-05-quality-gate-registry.md`

## 핵심 변경
- `scripts/quality_gates.mjs`를 추가해 gate ID, `required`/`optional`/`advisory` tier, release/complete suite membership, auth check test file inventory를 정의했습니다.
- `scripts/quality_gates_runner.mjs`를 추가하고 `planning:auth:check`를 registry runner로 연결했습니다.
- `release:verify`와 `planning:v2:complete`가 hardcoded gate 배열 대신 registry suite를 읽도록 바꿨고, CI는 `release:verify` primary gate와 중복되는 planning guard/regress step을 제거했습니다.
- planning route user-scope coverage는 route count 상수와 proxy 예외 고정 목록 대신 현재 route 파일에서 proxy delegate 패턴을 discovery합니다.
- 전체 test gate에서 산출물 shadow 테스트가 섞이지 않도록 `.dist/**`를 Vitest exclude에 추가했고, 뉴스 refresh mock specifier와 warning catalog 기대값을 현재 canonical source에 맞췄습니다.

## 수정 전 실패 증거
- `corepack pnpm test tests/quality-gates-registry.test.ts`
  - FAIL: `../scripts/quality_gates.mjs` 모듈 부재.
- `corepack pnpm release:verify`
  - 1차 FAIL: `multi-agent:guard`가 `work/6/28/2026-06-28-p2-04-report-contract.md`의 `다음 라운드` 섹션 누락을 감지했습니다.
  - 2차 FAIL: 전체 `pnpm test`에서 `.dist/planning-v2-desktop` shadow test 혼입, news refresh 실제 실행, registry 이동 후 낡은 release 문자열 계약, warning catalog 기대값 불일치가 드러났습니다.
- `corepack pnpm test tests/planning-v3-news-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
  - FAIL: 테스트 mock이 root compatibility specifier를 mock해 route의 `@/lib/.../newsRefresh` import에 적용되지 않았고 실제 refresh가 실행되어 `itemsNew=213`이 반환됐습니다.

## 검증
- `corepack pnpm test tests/quality-gates-registry.test.ts tests/planning/auth/authConfigContract.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS, 3 files / 47 tests.
- `node --check scripts/quality_gates.mjs && node --check scripts/quality_gates_runner.mjs && node --check scripts/release_verify.mjs && node --check scripts/planning_v2_complete.mjs` PASS.
- `git diff --check` PASS.
- `corepack pnpm test tests/planning-v3-news-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v2/reportDashboardWarnings.test.ts tests/planning/auth/postgresReadinessScript.test.ts tests/planning/auth/vitestPlanningAuthFallbackContract.test.ts tests/planning/ui/workspaceRunResult.test.ts tests/quality-gates-registry.test.ts` PASS, 7 files / 49 tests.
- `corepack pnpm planning:auth:check` PASS, 13 files / 74 tests.
- `corepack pnpm planning:user-scope:check` PASS, 12 files / 32 tests.
- `corepack pnpm planning:ssot:check` FAIL: 기존 `src/lib/planning/v3/**` 및 `src/lib/planning/server/**`의 `Math.round`/`Math.floor` baseline 외 위반. P2-05 변경 파일이 원인은 아닙니다.
- `corepack pnpm planning:v2:complete` PASS, fast e2e 6 tests 포함.
- `corepack pnpm lint` PASS.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm planning:v2:regress` PASS, regression 9 cases + full e2e 8 tests.
- `corepack pnpm build` PASS.
- `corepack pnpm release:verify` PASS.
  - 내부 `pnpm test` PASS, 738 files / 2437 tests.
  - 내부 advisory `planning:ssot:check`는 기존 `Math.round`/`Math.floor` baseline 외 위반으로 WARN 처리됐습니다.

## 운영/호환성
- API 응답, 저장 포맷, migration 변경은 없습니다.
- registry는 기존 package script와 runner가 소비하는 orchestration 메타데이터만 추가합니다.
- CI는 `release:verify`를 primary suite로 사용하며, suite 안에 포함된 `planning:v2:guard`와 `planning:v2:regress`를 별도 step에서 중복 실행하지 않습니다.
- `planning:ssot:check`는 현재 release registry에서 advisory로 남아 실패 시 `release:verify`를 막지 않지만, 로컬 직접 실행에서는 실패 상태입니다.

## 남은 리스크
- `planning:ssot:check`의 `Math.round`/`Math.floor` 위반은 별도 정리 PR이 필요합니다.
- quality gate registry는 아직 JS module이므로 더 엄격한 schema validation이나 docs 생성은 후속 개선으로 남았습니다.
- release gate suite membership이 늘어나면 `scripts/quality_gates.mjs`와 관련 계약 테스트를 함께 갱신해야 합니다.

## 다음 라운드 우선순위
- 1. `planning:ssot:check` baseline 외 rounding 위반을 별도 P2 후속 issue로 정리합니다.
- 2. quality gate registry에서 문서/CI 요약을 자동 생성할지 검토합니다.
- 3. release suite 변경 시 `tests/quality-gates-registry.test.ts`를 함께 갱신하는 운영 규칙을 유지합니다.
