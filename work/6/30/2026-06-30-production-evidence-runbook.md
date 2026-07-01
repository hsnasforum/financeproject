# 2026-06-30 production evidence 수집 runbook

## 변경 파일
- `work/6/30/2026-06-30-production-evidence-runbook.md`
- `work/6/29/2026-06-29-0629-delivery-final-report-draft.md`

## 사용 skill
- `planning-gate-selector`: 운영 절차 문서 보강이므로 코드 gate 대신 스크립트 옵션 확인과 `git diff --check`를 검증 범위로 선택했습니다.
- `work-log-closeout`: 실제 확인한 스크립트 옵션과 deferred external verification 항목을 `/work` 표준 형식으로 기록했습니다.

## 변경 이유
- 전달문 최종 완료에는 실제 운영 topology, env, legacy inventory, conflict, quarantine, rollback 증거가 필요합니다.
- production/staging 검증은 현재 범위 밖이므로 deferred external verification으로 분리하고, 운영자가 실행할 read-only evidence 수집 절차를 별도 문서로 남깁니다.
- apply 명령은 지원 여부와 confirm 문자열을 기록하되, 사용자 승인·백업·dry-run 확인 전 실행 금지로 분리합니다.

## 핵심 변경
- production/staging에서 실행할 read-only 명령과 제출해야 할 report/log 필드를 정리했습니다.
- owner 불명 legacy 데이터는 자동 배정하지 않고 quarantine/blocker로 보고하도록 명시했습니다.
- PostgreSQL readiness는 confirmed apply가 의도적으로 미구현 상태이며, dry-run/apply-plan/rollback probe 증거만 수집한다는 점을 분리했습니다.
- 이번 라운드에서도 stage, commit, branch 생성, push, PR은 수행하지 않았습니다.

## 운영 수집 절차
1. Checkout/변경 상태 기록:
   ```bash
   git rev-parse HEAD
   git status --short --branch
   ```
   - 최종 보고서에는 실제 운영 checkout SHA를 기록합니다.
   - 작업트리가 dirty면 어떤 파일이 운영 로컬 변경인지 먼저 설명해야 합니다.

2. 민감값 없이 env 존재 여부만 기록:
   ```bash
   node -e 'for (const k of ["NODE_ENV","DATABASE_URL","PLANNING_DATA_DIR","PLANNING_AUTH_REQUIRED","PLANNING_NAMESPACE_ENABLED","PLANNING_SINGLE_USER_MODE","AUTH_SECRET","NEXTAUTH_SECRET"]) console.log(`${k}=${process.env[k] ? "set-redacted" : "missing"}`)'
   ```
   - 값 원문, DB URL, secret은 보고서에 넣지 않습니다.
   - `NODE_ENV=production`이면 `PLANNING_NAMESPACE_ENABLED=true` 또는 `PLANNING_SINGLE_USER_MODE=true` 중 하나가 필요합니다.

3. 운영 topology와 legacy 후보 read-only safety:
   ```bash
   corepack pnpm planning:v2:ops:safety -- --legacy-mode=check --legacy-limit=500 --legacy-fail-threshold=0
   ```
   - 제출 파일: `.data/planning/ops/reports/*-safety.json`, `.data/planning/ops/logs/*-safety.log`
   - 필수 필드:
     - `operatingEnvironment.storageMode`
     - `operatingEnvironment.dataDir`
     - `operatingEnvironment.databaseUrl`
     - `topology.writeSerializationScope`
     - `topology.sharedFileStoreCompletion`
     - `legacyBackfill.summary.totalRuns`
     - `legacyBackfill.summary.legacyCandidates`
     - `legacyBackfill.candidateCount`
     - `legacyBackfill.status`
   - `topology.sharedFileStoreCompletion=not_proven`이면 다중 프로세스 공유 파일 저장소 완료를 주장하지 않습니다.

4. legacy run inventory dry-run:
   ```bash
   corepack pnpm planning:v2:backfill-legacy-runs -- --dry-run --limit=500
   ```
   - ops doctor run까지 포함해야 하면:
     ```bash
     corepack pnpm planning:v2:backfill-legacy-runs -- --dry-run --limit=500 --include-ops-doctor
     ```
   - 필수 필드:
     - `totalRuns`
     - `legacyCandidates`
     - `userLegacyCandidates`
     - `opsDoctorLegacyCandidates`
     - `resultDtoOnlyCandidates`
     - `missingEngineSchemaCandidates`
     - `missingResultDtoCandidates`
     - `unreadableCandidates`
   - 후보가 1건 이상이면 sample의 `id`, `profile`, `kind`, `reason`, `createdAt`을 기록합니다.

5. SQLite auth ownership dry-run:
   ```bash
   corepack pnpm planning:auth:sqlite-backfill -- --dry-run --db-url=file:./prisma/prod.db
   ```
   - SQLite 운영 DB가 아니면 해당 없음으로 기록합니다.
   - `sourceMutation=false`와 대상 row 수를 최종 보고서에 기록합니다.

6. PostgreSQL readiness dry-run:
   ```bash
   node scripts/planning_postgres_readiness.mjs --dry-run --data-dir=.data/planning --out-dir=tmp/planning-postgres-readiness-production
   ```
   - disposable PostgreSQL target 연결만 확인할 때:
     ```bash
     node scripts/planning_postgres_readiness.mjs --apply --confirm="APPLY POSTGRES READINESS" --check-db-connection --data-dir=.data/planning --out-dir=tmp/planning-postgres-readiness-production
     ```
   - confirmed apply는 현재 스크립트에서 의도적으로 미구현이며 source data를 적용하지 않습니다.
   - 필수 필드:
     - manifest file count / bytes / checksum
     - dry-run apply `operations`
     - `targetTables`
     - `idempotentUpsert`
     - `referentialIntegrity`
     - `rollbackProbe.status`
     - `rollbackProbe.rollbackDigestUnchanged`
     - `confirmedApply.reason`

7. apply는 별도 승인 전 금지:
   ```bash
   corepack pnpm planning:v2:ops:safety -- --legacy-mode=apply --legacy-limit=500 --legacy-fail-threshold=0 --confirm="BACKFILL LEGACY RUNS"
   ```
   - 이 명령은 source data를 변경할 수 있으므로 backup/restore point, dry-run 검토, 사용자 승인 없이 실행하지 않습니다.
   - apply 후에는 `postApplyCandidateCount=0` 또는 승인된 threshold 이하임을 report/log로 확인합니다.
   - owner 불명 또는 conflict 데이터는 자동 배정하지 않고 quarantine/blocker로 기록합니다.

## 보고서 입력값
- 시작/종료 SHA: 운영 checkout SHA와 로컬 구현 SHA를 분리합니다.
- 운영 env: redacted `set/missing` 상태만 기록합니다.
- topology: 단일 프로세스 여부를 runtime report 또는 배포 설정으로 증명합니다.
- migration 대상 수: `legacyCandidates`, user/ops doctor breakdown, PostgreSQL dry-run operation count.
- conflict/quarantine 수: 스크립트 report에 직접 수량이 없으면 후보 sample을 근거로 `[미확인]` 또는 blocker로 적습니다.
- rollback 검증: PostgreSQL dry-run rollback probe와 backup restore evidence를 분리합니다.
- 원격 CI: GitHub push/PR 금지가 해제된 뒤 PR별 check URL을 추가합니다.

## 검증
- `git rev-parse HEAD main origin/main` PASS:
  - HEAD `baf6325ecdadb3a2b249c0946490ec48887430ab`
  - main/origin/main `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`
- `git status --short --branch --untracked-files=normal` PASS:
  - staged 파일 없음
  - modified/untracked 파일 존재
- `Select-String`으로 관련 스크립트 옵션 확인 PASS:
  - `planning_v2_ops_safety.mjs`: `--legacy-mode`, `--legacy-limit`, `--legacy-fail-threshold`, `--confirm`
  - `planning_v2_backfill_legacy_runs.mjs`: `--dry-run`, `--apply`, `--limit`, `--include-ops-doctor`, `--confirm`
  - `planning_postgres_readiness.mjs`: `--dry-run`, `--apply`, `--data-dir`, `--out-dir`, `--check-db-connection`, `--confirm`
  - `planning_auth_sqlite_backfill.mjs`: `--dry-run`, `--apply`, `--db-url`, `--default-user-id`, `--confirm`
- `sed`가 PowerShell 파이프에서 실패한 상태 확인 명령은 증거에서 제외했고, `git status --short --branch --untracked-files=normal`을 별도 명령으로 재실행했습니다.

## 남은 리스크
- [deferred external verification] 이 runbook은 운영자가 실행해야 하는 절차입니다. 실제 production report/log는 현재 범위 밖입니다.
- [deferred external verification] commit/push/PR 및 원격 CI는 현재 범위 밖입니다.
- [검증 필요] 운영 환경에서 스크립트 경로나 data dir이 다르면 `--data-dir`와 `PLANNING_DATA_DIR`를 실제 배포 설정에 맞춰 조정해야 합니다.
