# 2026-06-28 P0-03 restore replace 원자성

## 사용 skill
- `finance-skill-routing`: Finance Project 조건부 skill 선택 확인.
- `planning-gate-selector`: ops backup restore 변경의 최소 검증 세트 확인.
- `work-log-closeout`: 종료 기록 형식과 남은 리스크 정리.

## 기준
- 문서 기준 커밋: `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`
- 라운드 시작 HEAD: `645bf614b835054ebd169666a8f51771cbad14ba`
- 작업 브랜치: `codex/p0-03-restore-atomicity`
- P0-03 시작 전 P0-01/P0-02 변경은 선행 브랜치에 누적된 상태였고, P0-03 범위는 ops backup restore replace 원자성으로 제한함.

## 변경 파일
- `src/lib/ops/backup/planningDataVault.ts`
  - replace restore 전에 hard-error preflight를 수행해 손상 항목이 있으면 live 삭제를 시작하지 않도록 변경.
  - replace commit 전 live 저장소 snapshot과 `restore-replace-journal.json`을 만들고, commit 중 issue 또는 throw가 발생하면 snapshot rollback 후 `committed:false` summary를 반환.
  - 다음 restore 진입 시 pending replace journal이 있으면 먼저 rollback하도록 복구 루틴 추가.
  - 테스트용 `faultInjection` write/operation seam 추가.
- `src/lib/ops/backup/backupRestoreRouteService.ts`
  - replace restore가 `committed:false`이면 `RESTORE_NOT_COMMITTED` 409로 반환하고, audit/metric은 ERROR/FAILED로 기록.
  - merge mode의 부분 성공 계약은 유지.
- `src/lib/ops/errorContract.ts`
  - `RESTORE_NOT_COMMITTED`를 409 ops contract error로 등록.
- `tests/planning/ops/backup-api.test.ts`
  - 손상 entry 포함 replace가 기존 데이터를 보존하고 성공 audit을 남기지 않는 회귀 테스트 추가.
  - commit write fault injection 시 rollback되는 장애 주입 테스트 추가.
- `scripts/planning_v2_ops_run.mjs`, `scripts/planning_v2_ops_safety.mjs`
  - required gate가 `tsx/esm/api`의 virtual CJS wrapper에서 `__filename` 오류로 실패해, 이미 활성화된 `node --import tsx` 표준 동적 import로 변경.

## 수정 전 실패 증거
- `corepack pnpm test tests/planning/ops/backup-api.test.ts tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts`
  - 실패 2건.
  - replace 손상 entry가 `200` 성공으로 반환됨. 기대값 `409`.
  - faultInjection 결과 `committed`가 `undefined`. 기대값 `false`.

## 수정 후 검증
- `corepack pnpm test tests/planning/ops/backup-api.test.ts tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts`
  - PASS, 2 files / 33 tests.
- `corepack pnpm planning:v2:ops:safety`
  - 최초 실패: `tsx/esm/api` import 중 `__filename is not defined in ES module scope`.
  - 스크립트 import 수정 후 PASS.
  - report: `.data/planning/ops/reports/20260628-071949-safety.json`
  - log: `.data/planning/ops/logs/20260628-071949-safety.log`
  - legacyCandidates=0.
- `corepack pnpm lint`
  - PASS.
- `corepack pnpm typecheck`
  - PASS.
- `git diff --check`
  - PASS.

## 운영 topology/env/inventory
- 파일시스템: workspace와 `.data/planning` 모두 `/dev/sdd` ext4.
- process `PLANNING_*` env: 없음.
- `.env.local`: `PLANNING_*` 항목 없음. 외부 API 키/URL, `DATABASE_URL`, GitHub 관련 env는 존재하나 값은 확인/기록하지 않음.
- restore journal/snapshot 잔여물: 없음.
- legacy backfill 후보: 0.

## rollback/호환성
- rollback 검증: commit write fault injection에서 기존 profile ID 목록이 유지되고 incoming profile이 남지 않음을 테스트로 확인.
- 손상 entry replace 검증: live 데이터 삭제 전 `RESTORE_NOT_COMMITTED` 409로 중단하며 success audit을 남기지 않음.
- API 응답 호환성: restore summary에 `committed` boolean이 추가됨. merge 성공/부분 성공은 계속 `ok:true`; replace 미커밋만 `ok:false`.
- migration/dry-run/rollback 대상: 저장 포맷 migration 없음. replace 복원 내부 rollback journal/snapshot만 추가.
- quarantine 대상: 이 라운드에서 소유자 불명 legacy 데이터 자동 배정 없음.

## 남은 리스크
- 프로세스가 replace commit 중 강제 종료되면 다음 restore 진입 시 pending journal rollback을 수행한다. 앱 시작 시 전역 recovery hook은 이번 범위에 추가하지 않았다.
- 다중 프로세스가 같은 파일 root를 동시에 쓰는 실제 운영 topology는 로컬 workspace만으로 확정할 수 없다. 이번 구현은 process-local mutex가 아니라 파일 snapshot/journal rollback에 의존하지만, 분산 lock은 추가하지 않았다.
