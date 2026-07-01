# 2026-06-28 P0-02 전역 legacy 거래 경로 제거

## 사용 skill
- `finance-skill-routing`: Finance Project 조건부 skill 선택 확인.
- `planning-gate-selector`: route/page/API 영향에 맞는 targeted test, lint/typecheck/build 검증 범위 선택.
- `planning-v3-batch-contract-narrowing`: batch/detail/list/read 계약을 stored-first, legacy quarantine 기준으로 좁히는 데 사용.
- `work-log-closeout`: 종료 기록 형식 확인.

## 변경 요약
- `/api/planning/v3/transactions/import/csv` 호환 URL은 유지하되 저장은 canonical `batches/import-csv` 저장소로 전환했다.
- 사용자-facing batch list, batch center, latest batch selection, detail/delete, summary, categorized/cashflow/transfers/balances/draft pipeline에서 pure legacy-only batch를 `NO_DATA`로 숨긴다.
- stored rows only + legacy id 충돌은 stored synthetic snapshot을 우선 읽고, 삭제 command는 collision guard를 유지한다.
- import/transactions UI는 canonical `/api/planning/v3/transactions/batches/import-csv`로 저장 요청을 보낸다.
- 회귀 테스트 fixture는 기능 검증용 데이터를 canonical stored batch로 옮기고, pure legacy는 quarantine/비노출 테스트로만 남겼다.

## 변경 파일
- API/UI: `src/app/api/planning/v3/transactions/import/csv/route.ts`, `src/app/api/planning/v3/transactions/batches/[id]/route.ts`, `src/app/planning/v3/import/_components/ImportCsvClient.tsx`, `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx`
- 서비스: `src/lib/planning/v3/service/batchCenterRows.ts`, `batchReadRepository.ts`, `generateDraftPatchFromBatch.ts`, `loadBatchVisiblePipeline.ts`, `storedFirstBatchSelection.ts`, `transactionBatchListRows.ts`, `src/lib/planning/v3/transactions/store.ts`
- 테스트: `tests/planning-v3-*`의 batch/list/detail/summary/balances/categorized/transfers/draft/import/remote-host 관련 파일

## 수정 전 실패 증거
- `corepack pnpm test tests/planning-v3-transactions-batches-user-scope.test.ts` 실패: legacy import URL이 전역 `v3/transactions/batches.ndjson`를 생성함.
- legacy-only 차단 확대 후 기존 테스트 다수가 404를 받으며 실패: 원인은 기능 회귀가 아니라 pure legacy fixture가 사용자-facing 경로에 노출된다는 과거 기대값이었다.

## 검증
- `corepack pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-transactions-batches-user-scope.test.ts tests/planning-v3-batch-center-api.test.ts tests/planning-v3-draft-profile-api.test.ts` PASS, 50 tests.
- `corepack pnpm test tests/planning-v3-balances-api.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-transfers-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts` PASS, 24 tests.
- `corepack pnpm test tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-getBatchSummary.test.ts` PASS, 20 tests.
- `corepack pnpm planning:user-scope:check` PASS, 12 files / 32 tests.
- `corepack pnpm lint` PASS.
- `corepack pnpm typecheck` PASS.
- `git diff --check` PASS.
- `corepack pnpm build` PASS.

## 운영 확인과 inventory
- 시작 기준 `main`/문서 SHA는 `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`로 일치했다.
- 로컬 `.data/planning` inventory: legacy transaction files 0, canonical batch files 0, shared profiles 0, shared runs 0, users 2.
- 로컬 env 확인: `.env.local`에는 `DATABASE_URL`만 있고 Planning namespace/auth 관련 실제 운영 값은 없음.
- 실제 production 인스턴스 수, 공유 파일 스토리지 여부, 운영 env 값은 이 workspace에서 확정 불가다. 다중 프로세스 공유 저장소라면 P0-03에서 process-local mutex만으로 완료 처리하면 안 된다.

## 남은 리스크
- legacy helper/export 자체는 테스트와 내부 호환을 위해 남아 있다. 사용자-facing 경로는 막았지만 migration/quarantine inventory 도구는 후속 P1/P0-03에서 더 명확히 정리해야 한다.
- 기존 legacy-only 데이터를 자동 소유자 배정하지 않았고, 사용자 API에서는 `NO_DATA`로 quarantine 처리한다.
- 저장 포맷 migration은 아직 수행하지 않았다. dry-run/rollback이 필요한 migration은 후속 이슈에서 별도로 다룬다.

## 다음 라운드 우선순위
- PR 생성 후 원격 `CI`와 `E2E Smoke`를 확인한다.
- P0-02 병합 뒤 P0-03 restore atomicity PR을 최신 `main` 기준으로 재구성한다.
