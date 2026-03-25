# 2026-03-20 N2 synthetic stored-only batch delete legacy-collision guard

## 변경 파일

- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/20/2026-03-20-n2-synthetic-stored-only-batch-delete-legacy-collision-guard.md`

## 사용 skill

- `planning-gate-selector`: batch delete command surface만 건드린 범위에 맞춰 `tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check`를 고르고 `pnpm lint`, `pnpm e2e:rc`를 미실행 검증으로 남기는 데 사용
- `work-log-closeout`: 이번 라운드의 delete collision guard, 실제 실행한 검증, 남은 write parity 리스크를 `/work` 형식으로 정리하는 데 사용
- `planning-v3-batch-contract-narrowing`: synthetic stored-only batch의 read parity는 유지하면서 delete command surface만 explicit legacy collision guard로 좁히는 데 사용

## 변경 이유

- synthetic stored-only batch는 이전 라운드에서 `DELETE`가 허용되도록 바뀌었지만, 같은 batch id의 legacy batch가 따로 남아 있으면 실제로는 stored file만 지워도 user-facing batch는 계속 남을 수 있었다.
- 이 상태에서 `DELETE`가 `ok: true, deleted: true`를 반환하면 “배치가 완전히 사라졌다”는 의미처럼 읽히기 쉬워, read parity와 command semantics가 어긋나는 문제가 남아 있었다.

## 핵심 변경

- `transactions/store.ts`에 `getStoredBatchDeleteSurfaceState()`를 추가해 `DELETE`가 `stored-meta`, `synthetic-stored-only`, `synthetic-stored-only-legacy-collision`, `missing`을 구분하게 했다.
- 새 helper는 synthetic stored-only batch에 한해 same-id legacy batch 존재 여부를 추가로 확인하고, 충돌이 있으면 delete collision state를 반환한다.
- `/api/planning/v3/transactions/batches/[id]`의 `DELETE`는 pure synthetic stored-only batch delete success는 그대로 유지하고, same-id legacy batch가 남아 있는 collision 상태에서는 `INPUT` 400과 명시적 메시지로 guard 한다.
- 테스트는 pure synthetic delete success 회귀를 유지하고, synthetic stored-only + legacy same-id collision에서는 delete가 400 guard를 반환하고 detail surface가 계속 batch를 해석하는지를 고정했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/transactionStore.ts src/lib/planning/v3/store/batchesStore.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts work/3/20/2026-03-20-n2-synthetic-stored-only-batch-delete-legacy-collision-guard.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm test tests/planning-v3-user-facing-remote-host-api.test.ts`

## 남은 리스크

- 이번 라운드는 synthetic stored-only delete collision만 guard 했으므로, stored meta batch와 legacy batch가 같은 id로 공존하는 broader delete semantics는 후속 검토가 남아 있다.
- write-back이나 index repair는 하지 않으므로, synthetic stored-only batch는 여전히 read-side helper가 `.ndjson`와 legacy fallback을 읽어 상태를 재구성한다.
