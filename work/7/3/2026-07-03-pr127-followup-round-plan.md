# 2026-07-03 PR #127 후속 라운드 계획 정리

## 변경 파일
- `work/7/3/2026-07-03-pr127-followup-round-plan.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`와 이번 분석 전용 라운드 범위를 기준으로 필요한 skill 조합을 최소로 정했습니다.
- `planning-gate-selector`: `#116 runStore read/fallback 관측성` 후보의 검증 세트와 최종 게이트 소유권 원칙을 정리했습니다.

## 이번 라운드 목적
- PR #127 이후 남은 구조 개선 후보 중 다음 작업을 `#116 runStore read/fallback 관측성 + diagnostics helper 분리`로 고정 가능한지 재확인합니다.
- 구현 전 public API, 응답 shape, run 저장 포맷, fallback metrics, migration persistence 원칙을 건드리지 않는 최소 범위를 정리합니다.

## 재확인한 사실
- 메인 구현 브랜치는 `codex/116-read-observability`이며, `origin/codex/116-run-trash-boundary`에서 분기했습니다.
- PR #139는 `open`, `mergeable=true`, CI/E2E Smoke PASS이고 추가 review thread가 없습니다.
- Issue #116은 `open`이고, 기존 후속 PR #135는 run trash/delete/restore 파일 조작 책임만 분리한 상태입니다.
- 최신 `/work`는 `work/7/3/2026-07-03-zzzz-create-run-failure-side-effects.md`이며 다음 우선순위로 `#116`이 기록돼 있습니다.
- 후보 함수는 `src/lib/planning/store/runStore.ts`의 `readRunMetaByPathDetailed`, `diagnoseRunRead`에 모여 있습니다.
- 관련 테스트는 `tests/planning-store.test.ts`, fallback 관측성 요약은 `tests/planning/ops/metrics-api-routes.test.ts`가 기본 축입니다.
- 공식 사용자 경로는 `docs/current-screens.md` 기준으로 `/planning`, `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`, `/planning/reports/[id]`입니다.

## 유지 원칙
- public URL 추가/변경 없음.
- API 응답 shape 변경 없음.
- run JSON 저장 포맷, vault 경로, migration persistence 조건 변경 없음.
- fallback metric key (`legacyReportContractFallbackCount`, `legacyRunEngineMigrationCount`)와 sourceKey 의미 유지.
- Prisma/DB schema 변경 없음.
- cache/revalidation 변경 없음.

## 권장 다음 범위
- `readRunMetaByPathDetailed` 내부의 fallback metric 기록과 canonicalization 실패 reason 조립을 helper로 분리
- `diagnoseRunRead`의 attempt 수집/최종 status 판정을 diagnostics helper로 분리
- partition hint/scan/legacy fallback 순서와 `RunReadDiagnostic` shape은 유지

## 검증 계획
- 구현 전 재확인 기준:
  - `tests/planning-store.test.ts`
  - `tests/planning/ops/metrics-api-routes.test.ts`
- 구현 후 최소 검증 후보:
  - `pnpm test tests/planning-store.test.ts tests/planning/ops/metrics-api-routes.test.ts`
  - `pnpm test`
  - `pnpm planning:v2:complete`
  - `pnpm planning:v2:compat`
- 최종 `pnpm build`, `pnpm e2e:rc`, production smoke는 이번 후보가 사용자 경로/route/build까지 번지지 않는 한 기본 미대상으로 두되, 실제 변경 범위가 넓어지면 메인 에이전트 단독으로만 실행합니다.

## 실행한 검증
- `git status --short --branch`
- 관련 코드/테스트/문서 조회:
  - `src/lib/planning/store/runStore.ts`
  - `tests/planning-store.test.ts`
  - `tests/planning/ops/metrics-api-routes.test.ts`
  - `docs/current-screens.md`

## 미실행 검증
- `pnpm test`
- `pnpm planning:v2:complete`
- `pnpm planning:v2:compat`
- `pnpm build`
- `pnpm e2e:rc`

## 남은 리스크
- `diagnoseRunRead`는 exported contract라 helper 분리 중 attempt 순서나 최종 status 규칙이 바뀌면 회귀가 날 수 있습니다.
- `readRunMetaByPathDetailed`는 canonicalization 과정에서 fallback metrics와 persistence 조건을 함께 다루므로 helper 분리 중 write 여부가 섞이면 저장 포맷 변경 리스크가 생깁니다.
- ops metrics 요약은 source/sourceKey 관측성에 기대므로 이름 정리 수준처럼 보여도 summary 테스트가 깨질 수 있습니다.

## 다음 라운드 우선순위
- 1순위: `runStore` read/fallback 관측성 helper 분리
- 2순위: `diagnoseRunRead` diagnostics helper 분리와 테스트 보강
- 3순위: 필요 시 ops metrics summary 회귀 방지 assertion 보강
