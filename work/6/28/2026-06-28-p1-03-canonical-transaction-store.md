# 2026-06-28 P1-03 canonical transaction store 종료 기록

## 범위
- 기준 SHA: `dccfc284`
- 대상: Planning v3 거래 저장소의 사용자 요청 write owner를 canonical `batchesStore`로 고정하고, legacy 거래 저장소는 read-only migration input으로 제한했습니다.
- 실제 workspace inventory: legacy 거래 파일 0개, canonical batch 파일 0개, legacy `batches.ndjson` 0줄, canonical index 없음.

## 사용 skill
- `planning-v3-batch-contract-narrowing`: stored-first/canonical batch 계약과 legacy fallback 축소 기준 확인.
- `planning-gate-selector`: P1-03 targeted/full 검증 세트 선정.
- `work-log-closeout`: 종료 기록 형식과 남은 리스크 정리.

## 변경 파일
- `src/app/api/planning/v3/transactions/batches/[id]/account/route.ts`: legacy-only write 성공 분기 제거, same-ID는 `409 MIGRATION_CONFLICT`, legacy-only는 `404 NO_DATA`.
- `src/app/api/planning/v3/transactions/batches/merge/route.ts`: 사용자 요청 legacy merge를 `410 UNSUPPORTED`로 차단.
- `src/lib/planning/v3/service/batchAccountRepository.ts`: legacy `updateBatchAccount`와 same-ID coexistence write command 호출 제거.
- `src/lib/planning/v3/service/storedBatchCommandSurface.ts`: legacy row 파싱 실패와 무관하게 batch meta 존재로 same-ID 충돌 감지.
- `src/lib/planning/v3/service/transactionStore.ts`: read-only `hasLegacyBatch` 추가.
- `src/lib/planning/v3/service/legacyTransactionMigration.ts`: legacy inventory/dry-run/report 추가. checksum, row count, account binding, same-ID conflict, owner 불명 quarantine, malformed partial을 기록하고 write는 하지 않음.
- `tests/planning-v3-canonical-write-owner.test.ts`: legacy-only/same-ID/merge 사용자 write 차단 회귀 테스트 추가.
- `tests/planning-v3-legacy-transaction-migration.test.ts`: dry-run idempotency, no-write, quarantine/conflict/partial 장애 주입 테스트 추가.
- `tests/planning-v3-batches-merge-api.test.ts`, `tests/planning-v3-batch-cashflow-account-guard-api.test.ts`: P1-03 계약에 맞게 legacy merge/same-ID 성공 기대를 conflict/unsupported로 갱신.

## 수정 전 실패 증거
- `corepack pnpm test tests/planning-v3-canonical-write-owner.test.ts`
  - 실패: 신규 회귀 3건이 기존 route에서 `200`을 반환했습니다. 기대값은 legacy-only `404`, same-ID `409`, merge `410`이었습니다.
- `corepack pnpm test tests/planning-v3-legacy-transaction-migration.test.ts`
  - 실패 1: `legacyTransactionMigration` 모듈 부재.
  - 실패 2: malformed legacy records가 `StorageCorruptedError`로 throw되어 partial report로 남지 않았습니다.
- `corepack pnpm test tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - 실패: legacy binding이 이미 같은 계좌여도 same-ID route가 `200`을 반환해 `409 MIGRATION_CONFLICT` 계약을 위반했습니다.

## 수정 후 검증
- `corepack pnpm test tests/planning-v3-legacy-transaction-migration.test.ts tests/planning-v3-canonical-write-owner.test.ts tests/planning-v3-batches-merge-api.test.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-transactions-batches-user-scope.test.ts tests/planning-v3-batchesStore-importCsvToBatch.test.ts tests/planning-v3-transactionStore.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - PASS: 8 files, 97 tests.
- `corepack pnpm lint`
  - PASS.
- `corepack pnpm typecheck`
  - PASS.
- `git diff --check`
  - PASS.
- `corepack pnpm test`
  - PASS: 729 files, 2394 tests.
- `corepack pnpm build`
  - PASS: Next.js 16.2.6 production build, 251 static pages generated.

## migration / rollback / 호환성
- migration apply는 수행하지 않았습니다. 이번 변경의 migration surface는 dry-run report만 제공하며, legacy 파일과 canonical index를 변경하지 않습니다.
- dry-run report는 반복 실행 시 동일 입력과 동일 `generatedAt`에서 동일 결과를 반환합니다.
- 소유자 불명 legacy 데이터는 자동 배정하지 않고 `quarantineReason: "OWNER_UNKNOWN"`으로 분류합니다.
- same-ID canonical/legacy 공존은 사용자 요청 write 성공이 아니라 `MIGRATION_CONFLICT`로 분류합니다.
- malformed legacy rows는 `partialReason: "LEGACY_ROW_READ_FAILED"`로 보고하고 write하지 않습니다.
- rollback 대상 write가 없으므로 runtime rollback은 발생하지 않았습니다. 호환성 변화는 사용자 요청 legacy merge/account write가 성공하지 않고 명시 오류로 바뀐 점입니다.

## 남은 리스크
- legacy read fallback 자체는 아직 일부 조회 경로에 남아 있습니다. 이번 라운드는 사용자 요청 write owner 축소와 dry-run inventory에 한정했습니다.
- owner 증거가 있는 실제 migration apply/marker 영속화/rollback 명령은 아직 구현하지 않았습니다. 현재 workspace inventory가 0이라 실제 quarantine 대상도 0개입니다.
- 다중 프로세스 공유 파일 저장소에서 migration apply를 추가할 경우 process-local mutex만으로 완료 처리하면 안 됩니다. 별도 inter-process lock 또는 DB-backed migration state가 필요합니다.
