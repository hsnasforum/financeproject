# 2026-07-01 로컬 restore transaction closure

## 변경 파일
- `src/lib/ops/backup/replaceRestoreTransaction.ts`: replace restore snapshot, journal, rollback, cleanup, pending recovery helper를 vault orchestration에서 분리했습니다.
- `src/lib/ops/backup/planningDataVault.ts`: replace restore helper를 새 transaction 모듈에서 호출하도록 바꾸고 기존 공개 fault injection 타입 별칭은 유지했습니다.
- `tests/planning/ops/backup-api.test.ts`: replace restore transaction helper가 vault orchestration 밖에 유지되는지 확인하는 회귀 테스트를 추가했습니다.

## 사용 skill
- `planning-gate-selector`: 변경 영향 범위에 맞는 targeted gate와 required gate를 고르는 데 사용했습니다.
- `work-log-closeout`: 변경 파일, 검증, 잔여 리스크를 `/work` 종료 기록으로 남기는 데 사용했습니다.
- `github:yeet`: 최신 사용자 지시에 따라 커밋, 푸시, PR, 머지까지 가능한 게시 흐름을 준비하는 데 사용했습니다.

## 변경 이유
- 전달문 I-07의 구조 개선 요구는 replace restore의 원자성 로직을 유지하면서도 `planningDataVault.ts`의 orchestration 책임과 snapshot/journal transaction 책임을 분리하는 것입니다.
- 기존 fault injection, `RESTORE_NOT_COMMITTED`, pending journal recovery 동작은 유지하고, 새 helper 모듈로 이동한 뒤 기존 targeted 장애 주입 테스트가 계속 통과하는지 확인했습니다.

## 검증
- `DATABASE_URL=file:./prisma/ci.db corepack pnpm test tests/planning/ops/backup-api.test.ts tests/planning/ops/ops-backup-restore-route-service-boundary.test.ts` PASS, 2 files / 34 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm lint` PASS.
- `corepack pnpm planning:v2:ops:safety` PASS, legacyCandidates=0, report `.data/planning/ops/reports/20260701-083147-safety.json`.
- I-01~I-15 targeted bundle PASS, 20 files / 118 tests.
- `corepack pnpm planning:auth:check` PASS, 13 files / 74 tests.
- `DATABASE_URL=file:./prisma/ci.db corepack pnpm planning:user-scope:check` PASS, 12 files / 32 tests.
- `DATABASE_URL=file:./prisma/ci.db corepack pnpm test` PASS, 739 files / 2444 tests.
- `DATABASE_URL="postgresql://finance_user:local-only@127.0.0.1:1/finance_test?schema=public" corepack pnpm release:verify` PASS. 이 URL은 외부 PostgreSQL 검증이 아니라 로컬 dry-run/schema gate용 더미 대상입니다.
- `corepack pnpm planner:deprecated:guard` PASS.
- `corepack pnpm build` PASS.
- `git diff --check` PASS.
- `.dist` tracked file count: 0.

## Deferred external verification
- GitHub remote CI, 운영 topology, 운영 env, 외부 DB apply/rollback, 실제 legacy data inventory는 이번 로컬 범위 밖입니다.
- 위 항목은 blocked가 아니라 deferred external verification으로 남기며, 로컬 synthetic fixture, dry-run, fault injection, release gate로 대체 검증했습니다.

## 남은 리스크
- 다중 프로세스 공유 파일 저장소에서의 최종 보장은 운영 topology 확인 후 별도 검증이 필요합니다.
- 소유자 불명 legacy 데이터 자동 배정 금지는 현재 dry-run/quarantine 테스트로 확인했지만, 운영 inventory 결과는 별도 evidence가 필요합니다.
