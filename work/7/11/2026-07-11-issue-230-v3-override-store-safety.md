# 2026-07-11 Issue #230 Planning v3 override store 안전성

## 변경 파일

- `src/lib/planning/storage/serverFileRead.ts`
- `src/lib/planning/v3/store/categoryRulesStore.ts`, `src/lib/planning/v3/store/txnOverridesStore.ts`, `src/lib/planning/v3/store/accountMappingOverridesStore.ts`, `src/lib/planning/v3/store/txnTransferOverridesStore.ts`
- `src/lib/planning/v3/service/batchCenterRows.ts`, `src/lib/planning/v3/service/batchImportRepository.ts`, `src/lib/planning/v3/service/batchReadRepository.ts`, `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`, `src/lib/planning/v3/service/getBatchSummary.ts`, `src/lib/planning/v3/service/importCsvToBatch.ts`, `src/lib/planning/v3/service/loadBatchVisiblePipeline.ts`
- `src/app/api/planning/v3/balances/monthly/route.ts`, `src/app/api/planning/v3/batches/[id]/summary/route.ts`, `src/app/api/planning/v3/batches/[id]/txn-overrides/route.ts`, `src/app/api/planning/v3/batches/import/csv/route.ts`
- `src/app/api/planning/v3/categories/rules/route.ts`, `src/app/api/planning/v3/categories/rules/[id]/route.ts`, `src/app/api/planning/v3/draft/apply/route.ts`, `src/app/api/planning/v3/draft/profile/route.ts`
- `src/app/api/planning/v3/transactions/account-overrides/route.ts`, `src/app/api/planning/v3/transactions/overrides/route.ts`, `src/app/api/planning/v3/transactions/transfer-overrides/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/cashflow/route.ts`, `src/app/api/planning/v3/transactions/batches/[id]/categorized/route.ts`, `src/app/api/planning/v3/transactions/batches/[id]/transfers/route.ts`
- `tests/planning-v3-store-concurrency.test.ts`, `tests/planning-v3-override-store-safety.test.ts`, `tests/planning-v3-storage-error-api.test.ts`, `tests/planning-v3-batches-import-csv-api.test.ts`
- `work/7/11/2026-07-11-issue-230-v3-override-store-safety.md`

## 사용 skill

- `finance-skill-routing`: Issue #230에 필요한 로컬 skill만 선택했습니다.
- `planning-gate-selector`: store, route, 사용자 격리, full test와 build 검증 범위를 정했습니다.
- `planning-v3-batch-contract-narrowing`: stored-first reader, batch-scoped override, raw/derived projection과 성공 응답 shape를 유지했습니다.
- `work-log-closeout`: 실제 변경, 실행한 검증, 롤백과 잔여 위험을 표준 한글 종료 기록으로 정리했습니다.
- `github:github`: Issue #230과 기존 Issue #32/#33, PR #111의 중복 여부와 현재 main 상태를 확인했습니다.
- `github:yeet`: clean worktree의 의도된 변경만 commit·push하고 draft PR로 발행합니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/230
- 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- 작업 브랜치: `codex/230-v3-store-safety`
- 네 JSON store가 동일 파일의 병렬 read-modify-write를 직렬화하지 않아 update를 유실했고, JSON 손상·권한·I/O 오류를 missing/default로 축약한 뒤 일반 mutation이 원문을 덮어쓸 수 있었습니다.
- store 오류를 고쳐도 서비스의 `.catch(() => ({}))`와 route의 generic `INTERNAL` 응답이 손상을 다시 숨기므로 사용자-facing 경계까지 같은 typed storage contract로 맞췄습니다.

## 핵심 변경

- 네 store가 `ENOENT`만 기존 기본값으로 처리하고 malformed JSON·잘못된 envelope는 `STORAGE_CORRUPT`, read/write 권한·I/O 실패는 `STORAGE_UNAVAILABLE`로 전달합니다.
- 실제 대상 JSON 경로 단위 process-local lock 안에서 read-modify-atomic-write 전체를 실행하며, txn batch 파일과 legacy 파일은 서로 다른 lock key를 사용합니다.
- row별 tolerant read는 유지하지만 invalid row가 하나라도 있으면 mutation을 차단해 일반 upsert/delete가 암묵적 repair로 원문을 재작성하지 못하게 했습니다.
- category의 missing 파일은 기본 룰을 제공하고 유효한 `items: []`는 명시적 empty로 유지하며, 자동 생성 ID는 `Date.now()` 대신 UUID를 사용합니다.
- 직접·간접 API는 성공 shape를 유지하고 storage 실패만 표준 500/503과 `/ops/doctor` 복구 링크로 바꿨으며, summary 포함 import는 commit 전 preflight하고 summary 없는 import의 기존 201 계약은 유지합니다.
- public route와 성공 응답 shape, stored JSON version/shape, DB schema/query, cache/revalidation, migration에는 변화가 없습니다. `docs/current-screens.md`도 변경하지 않았습니다.

## 검증

- `corepack pnpm vitest run tests/planning-v3-store-concurrency.test.ts tests/planning-v3-override-store-safety.test.ts tests/planning-v3-categoryRulesStore.test.ts tests/planning-v3-txnOverridesStore.test.ts tests/planning-v3-txnOverridesBatchStore.test.ts tests/planning-v3-storage-error-api.test.ts tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-batch-txn-overrides-api.test.ts tests/planning-v3-overrides-api.test.ts tests/planning-v3-account-overrides-api.test.ts tests/planning-v3-transfer-overrides-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-transfers-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-draft-apply-api.test.ts tests/planning-v3-batch-center-api.test.ts`: PASS, 20 files / 108 tests
- `corepack pnpm typecheck:planning:v3`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm typecheck`: PASS
- `corepack pnpm planning:user-scope:check`: PASS, 15 files / 88 tests
- `corepack pnpm multi-agent:guard`: PASS
- 첫 수정 후 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: FAIL, 직전 build의 `.next/standalone`에 생성된 `@img/sharp-libvips-linux-x64` symlink 때문에 Issue #230과 무관한 `desktop-artifact-provenance` 2 tests 실패
- 생성된 `.next`를 제거한 뒤 `corepack pnpm vitest run tests/desktop-artifact-provenance.test.ts`: PASS, 1 file / 6 tests
- 깨끗한 상태의 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 805 files / 2730 tests
- 최종 `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- 독립 store/API/test 재검토: blocking P0/P1 없음

## 남은 리스크

- lock은 Node process-local입니다. 다중 프로세스나 공유 파일시스템 안전성은 Issue #234 범위이며 이 변경으로 보장하지 않습니다. 여러 사용자 env가 같은 실제 파일을 가리키는 topology도 금지 또는 별도 lock 정책이 필요합니다.
- invalid row가 있는 파일은 읽을 수 있지만 mutation은 차단됩니다. 자동 복구는 추가하지 않았으므로 운영자가 사용할 explicit inspect/repair 절차는 별도 제품·운영 결정이 필요합니다.
- `atomicWrite.ts`는 write/rename 실패 시 final file은 보존하지만 `.tmp-*` 정리를 보장하지 않습니다. 반복 실패 시 임시 파일이 누적될 수 있는 기존 P2 위험이 남습니다.
- final build 뒤 생성된 sharp 내부 symlink 때문에 같은 worktree에서 desktop artifact test를 다시 실행하면 Issue #223의 strict no-symlink guard가 실패합니다. release gate는 test 후 build 순서를 유지하고, Next standalone의 신규 필수 symlink materialization 정책은 Issue #223 재개 여부를 별도 판단해야 합니다.
- rollback은 네 store의 safe read/write·file lock, 서비스 오류 전파, route mapper와 관련 테스트를 함께 되돌려야 합니다. broad catch/default 축약으로 되돌리는 롤백은 허용하지 않고 호환 문제가 있으면 explicit repair/migration을 추가합니다.

## 다음 라운드 우선순위

1. Issue #231에서 사용자 Planning 실행 1회당 persisted run이 정확히 1개 생성되는 계약을 재현하고 수정합니다.
2. Issue #234에서 process-local lock을 넘어서는 single-writer·at-rest protection 배포 결정을 확정합니다.
3. final build가 만드는 신규 sharp symlink를 Issue #223 재개 사유로 볼지 release 운영 정책과 함께 판단합니다.
