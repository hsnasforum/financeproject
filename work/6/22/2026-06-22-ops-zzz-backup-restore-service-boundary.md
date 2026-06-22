# 2026-06-22 Ops Backup Restore Service Boundary

## 변경 파일
- `src/app/api/ops/backup/restore/route.ts`
- `src/lib/ops/backup/backupRestoreRouteService.ts`
- `tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts`
- `tests/planning/auth/postgresReadinessScript.test.ts`
- `work/6/22/2026-06-22-ops-zzz-backup-restore-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 Finance Project 로컬 skill 선택.
- `planning-gate-selector`: ops backup restore route/service 변경에 맞는 검증 게이트 선정.
- `work-log-closeout`: `/work` 종료 기록 형식과 남길 항목 확인.

## 변경 이유
- `/api/ops/backup/restore` route에 업로드 검증, preview token 검증, archive decrypt/restore, audit, ops audit, metric 기록이 직접 섞여 있어 route 책임이 커져 있었습니다.
- backup export/preview와 같은 방식으로 route는 guard, 인증, 응답 매핑만 담당하고 restore 세부 동작은 service 계층으로 옮겨 다음 라운드의 ops route boundary 정리에 맞춥니다.

## 핵심 변경
- `backupRestoreRouteService`를 추가해 vault CSRF, 파일 크기 검증, preview token 소비, decrypt/restore, 성공/실패 audit 및 metric 기록, restore error mapping을 한 곳에 모았습니다.
- restore route는 `onlyDev`, local/same-origin guard, planning current-user auth, 입력/응답 매핑만 남기고 backup 내부 파일/토큰/암호화/audit 모듈 직접 import를 제거했습니다.
- route boundary 회귀 테스트를 추가해 backup restore route에 upload/archive/token/audit/metric/opsPolicy/vaultCsrf 직접 접근이 다시 들어오지 않게 했습니다.
- `postgresReadinessScript.test.ts`는 전체 `vitest run` 병렬 환경에서 실제 스크립트 검증이 5초를 넘는 기존 실패 모드가 있어 해당 파일에만 `testTimeout: 30_000`을 적용했습니다.
- manager 분해 결과 Spark/explorer 서브 에이전트는 이번 좁은 route boundary 라운드에는 불필요하다고 판단했습니다.

## 검증
- PASS `./node_modules/.bin/vitest run tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts`
- PASS `./node_modules/.bin/vitest run tests/planning/ops/backup-api.test.ts`
- PASS restore route forbidden direct-import/function scan
- PASS `git diff --check`
- PASS `corepack pnpm sec:check`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm typecheck`
- PASS `corepack pnpm planning:ssot:check`
- PASS `corepack pnpm build`
- 초기 `corepack pnpm test`는 `tests/planning/auth/postgresReadinessScript.test.ts` 8건이 기본 5초 timeout으로 실패했습니다.
- PASS `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts --testTimeout=30000`
- PASS `./node_modules/.bin/vitest run tests/planning/auth/postgresReadinessScript.test.ts`
- PASS `corepack pnpm test` after file-local timeout: 709 files, 2,277 tests.
- PASS `corepack pnpm verify`
- PASS `git diff --check --cached`
- PASS `corepack pnpm multi-agent:guard`

## 남은 리스크
- `corepack pnpm verify`는 `docs/schema-drift-report.md`, `docs/data-freshness-report.md`, `docs/dart-rules-quality-report.md`를 시간 기반으로 재생성합니다. 이번 PR 범위가 아니어서 생성 산출물은 staging 전에 복구했습니다.
- `docs/data-freshness-report.md` 기준 freshness snapshot 8개 stale 상태는 이번 route boundary 변경 범위 밖입니다.
- restore route의 public 응답 shape와 preview-required 메시지는 기존 backup API 회귀 테스트로 확인했지만, 실제 대용량 운영 backup 파일의 live restore smoke는 별도 라운드에서 다루는 편이 안전합니다.

## 다음 라운드
- export/preview/restore route가 service boundary로 분리되었으므로 ops backup route 묶음 전체에 대한 boundary scan을 추가하거나, 남은 ops route의 파일/DB 직접 접근 분류를 이어갑니다.
