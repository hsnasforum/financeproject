# 2026-03-12 release gate e2e isolation closeout

## 변경 파일
- `scripts/planning_v2_e2e_isolation.mjs`
- `scripts/planning_v2_complete.mjs`
- `scripts/planning_v2_compat.mjs`
- `scripts/planning_v2_regression.mjs`
- `docs/release.md`
- `docs/maintenance.md`

## 사용 skill
- `planning-gate-selector`: release/build/e2e/prod smoke까지 어떤 게이트를 다시 돌려야 하는지 범위를 고정하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목을 맞추는 데 사용.

## 변경 이유
- `release:verify` 재실행에서 두 가지 공유 환경 리스크가 실제로 재현됐다.
- `planning:v2:complete`/`planning:v2:compat` fast e2e는 shared `3126`/기존 `.next-e2e-*` 재사용 영향으로 `/planning/reports` hydration false negative가 났다.
- `planning:v2:regress` full e2e는 shared `.data/planning-e2e` 경로에서 `POST /api/planning/v2/runs` 중 `Unexpected end of JSON input` 500이 났다.

## 핵심 변경
- 공용 helper `scripts/planning_v2_e2e_isolation.mjs`를 추가해 planning e2e gate가 전용 포트, 고유 dist dir, 필요 시 임시 planning data dir를 쓰도록 분리했다.
- `scripts/planning_v2_complete.mjs`가 `planning:v2:e2e:fast` 실행 시 shared dist 재사용 대신 helper를 통해 격리 실행하도록 바꿨다.
- `scripts/planning_v2_compat.mjs`도 acceptance fast e2e를 helper로 감싸 compat fixture sandbox와 분리된 dist/runtime으로 실행하도록 맞췄다.
- `scripts/planning_v2_regression.mjs`는 `PLANNING_BASE_URL` 외부 서버를 쓰지 않는 기본 경로에서 `planning:v2:e2e:full`을 임시 planning data dir + 전용 포트/고유 dist dir로 실행하도록 바꿨다.
- `docs/release.md`, `docs/maintenance.md`에 release gate의 planning e2e 격리 규칙을 반영했다.

## 검증
- `pnpm exec eslint scripts/planning_v2_e2e_isolation.mjs scripts/planning_v2_complete.mjs scripts/planning_v2_compat.mjs scripts/planning_v2_regression.mjs`
- `PORT=3237 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 PLANNING_DATA_DIR=/tmp/... PLANNING_PROFILES_DIR=/tmp/... PLANNING_RUNS_DIR=/tmp/... PLANNING_VAULT_CONFIG_PATH=/tmp/... PLANNING_MIGRATION_STATE_PATH=/tmp/... PLANNING_MIGRATION_SNAPSHOT_DIR=/tmp/... PLANNING_STORAGE_JOURNAL_PATH=/tmp/... node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-v2-full.spec.ts --workers=1`
- `pnpm release:verify`
- `pnpm build`
- `pnpm planning:v2:prod:smoke`
- `pnpm e2e:rc`

## 남은 리스크
- blocker 없음.
- `[미확인]` `pnpm build` 중 `Failed to copy traced files ... .next/dev/build/package.json` 경고가 1회 출력됐다. 같은 턴에 production build 완료와 `pnpm planning:v2:prod:smoke` PASS는 확인했고, 당시 저장소의 `3100` dev runtime이 살아 있었다.
- 다음 build warning 정리 라운드가 필요하면 `next_build_safe`가 active dev runtime과 trace copy warning을 어떻게 다룰지 별도 batch로 분리하는 편이 안전하다.

## 다음 라운드 우선순위
- active `3100` dev runtime이 켜진 상태에서도 `pnpm build` trace copy warning을 재현/차단할지 별도 batch로 정리
- release gate 격리 helper를 `e2e:rc`/기타 장기 dev gate에도 확대할 실익이 있는지 판단
- `next_dev_safe`의 Windows localhost bridge `BIND_FAIL ::1:*` 로그를 warning 수준으로 낮추거나 원인 분리
