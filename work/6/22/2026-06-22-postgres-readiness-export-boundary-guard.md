# 2026-06-22 Postgres readiness export boundary guard

## 변경 파일
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-postgres-readiness-export-boundary-guard.md`

## 사용 skill
- `finance-skill-routing`: DB readiness 라운드에서 SQLite 원본 보존과 export 경계 검증을 우선순위로 선택했습니다.
- `planning-gate-selector`: readiness script 테스트 변경에 맞춰 targeted vitest, `planning:postgres:readiness`, lint, typecheck, guard, diff check를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 검증 결과, 남은 리스크를 종료 기록으로 남깁니다.

## 변경 이유
- PostgreSQL 전환 준비는 SQLite와 `.data/planning` 원본을 삭제하지 않는 manifest, export, dry-run apply, checksum compare 순서를 지켜야 합니다.
- 기존 테스트는 `--out-dir`가 source data directory 내부인 경우를 막았지만, source data directory를 포함하는 부모 출력 경로도 같은 위험 경계로 고정할 필요가 있습니다.
- export 실패 시점이 파일 쓰기 전이라는 계약을 명시해 원본 데이터와 export artifact 생성을 함께 보호합니다.

## 핵심 변경
- source data directory를 포함하는 `--out-dir`를 거부하는 회귀 테스트를 추가했습니다.
- 실패 뒤 원본 profile JSON이 유지되는지 확인했습니다.
- 실패 뒤 parent output 위치에 `files`와 `manifest.json` artifact가 생기지 않는지 확인했습니다.

## 검증
- PASS: `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts` (1 file, 14 tests)
- PASS: `corepack pnpm planning:postgres:readiness` (`.data/planning` 22 files, SQLite 14 models, PostgreSQL 28 models, schema SQL dry-run/checksum PASS)
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `git diff --check`

## 남은 리스크
- 실제 confirmed apply는 아직 구현 전이며 현재는 dry-run readiness 계약만 검증합니다.
- 현재 `.data/planning` dry-run은 target operations 0건이므로 live data targeted apply 검증은 후속 fixture 또는 실제 apply phase에서 보강해야 합니다.

## 다음 라운드
- `.data/planning/users/{userId}` repository ownership boundary를 route/service/repository 계층에서 더 좁힙니다.
- DB readiness apply artifact와 source namespace 경계를 추가 fixture로 확장합니다.
