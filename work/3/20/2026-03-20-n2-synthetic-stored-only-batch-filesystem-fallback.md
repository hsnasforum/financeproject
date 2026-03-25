# 2026-03-20 N2 synthetic stored-only batch filesystem timestamp fallback guard

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/lib/planning/v3/store/batchesStore.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-batch-center-api.test.ts`
- `work/3/20/2026-03-20-n2-synthetic-stored-only-batch-filesystem-fallback.md`

## 사용 skill

- `planning-gate-selector`: store/helper/list-test 범위에 맞춰 targeted API tests, `pnpm lint`, `pnpm build`, `git diff --check`를 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: synthetic ordering fallback guard 변경, 실제 실행한 명령, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 synthetic stored-only batch ordering은 latest valid row date 기준으로 개선됐지만, 유효한 transaction date가 하나도 없으면 surrogate가 곧바로 epoch로 내려가 list 정렬이 다시 가장 뒤로 밀리는 문제가 남아 있었다.
- 이번 라운드는 public `createdAt` 노출 정책은 그대로 두고, ordering 전용 fallback만 `row-date > file-stat > epoch` 순서로 보강하는 것이 목적이었다.

## 핵심 변경

- `batchesStore.ts`에 `getBatchTransactionsFileModifiedAt()`를 추가해 synthetic `.ndjson` 파일의 mtime을 ISO 문자열로 읽을 수 있게 했다.
- `transactions/store.ts`의 synthetic ordering helper를 async 흐름으로 바꾸고, 우선순위를 `latest valid row date -> file mtime -> epoch` 순서로 명시했다.
- row-date candidate는 이제 날짜 문자열 하나만 고르는 대신 각 row를 실제 parse해서 valid한 날짜만 비교하므로, invalid lexical max 때문에 valid row date를 놓치지 않게 했다.
- 유효한 row date가 없는 synthetic batch만 file mtime fallback을 읽고, file stat도 못 읽으면 마지막으로 epoch fallback을 유지한다.
- `metadataSource: "synthetic"`와 shared public createdAt predicate는 그대로 유지해 transactions batch list는 여전히 `""`, batch center list는 여전히 createdAt omission을 사용한다.
- 테스트는 invalid semantic date를 가진 synthetic stored-only batch 두 개를 만들어, id tie-break가 아니라 file mtime fallback으로 ordering이 결정되는지 두 list route에서 고정했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm build`
- `git diff --check -- src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/store/batchesStore.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts work/3/20/2026-03-20-n2-synthetic-stored-only-batch-filesystem-fallback.md`
- 관찰 메모
- `pnpm lint`는 이번 변경과 무관한 기존 warning 30건만 남기고 종료됐다.
- 미실행 검증
- `pnpm e2e:rc`

## 남은 리스크

- filesystem fallback은 ordering 전용 내부 surrogate일 뿐이라 true import time과 동일하지 않다.
- file mtime은 환경이나 복사 방식에 따라 달라질 수 있으므로, valid row date가 없는 synthetic batch끼리의 ordering은 여전히 filesystem metadata 품질에 영향을 받는다.
- index repair/write-back은 하지 않으므로 synthetic batch는 이후에도 매번 `.ndjson` file stat과 rows를 읽어 fallback surrogate를 다시 계산한다.
