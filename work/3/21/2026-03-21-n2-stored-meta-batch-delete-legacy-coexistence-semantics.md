# 2026-03-21 N2 stored meta batch delete legacy coexistence semantics

## 변경 파일

- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/21/2026-03-21-n2-stored-meta-batch-delete-legacy-coexistence-semantics.md`

## 사용 skill

- `planning-gate-selector`: batch delete route와 helper 범위에 맞춰 `tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check`를 실행 검증으로 고르고 `pnpm lint`, `pnpm e2e:rc`, `tests/planning-v3-user-facing-remote-host-api.test.ts`를 미실행 검증으로 남기는 데 사용
- `work-log-closeout`: 이번 라운드의 changed files, 실제 실행한 검증, 남은 coexistence 리스크를 `/work` 형식으로 정리하는 데 사용
- `planning-v3-batch-contract-narrowing`: stored writer owner와 legacy bridge가 같은 id로 공존하는 delete semantics만 helper 경계에서 좁히고, owner 재정의나 write-back 없이 explicit guard로 잠그는 데 사용

## 변경 이유

- stored meta batch와 legacy batch가 같은 id로 공존하면 현재 `DELETE`는 stored index/meta와 stored rows만 지우고 legacy batch owner는 그대로 남는다.
- 이 상태에서 user-facing `DELETE`가 `ok: true, deleted: true`를 반환하면 실제로는 배치가 계속 보일 수 있는데도 완전 삭제처럼 읽혀 delete semantics를 과장하게 된다.

## 핵심 변경

- `getStoredBatchDeleteSurfaceState()`가 same-id legacy batch 존재 여부를 stored-meta 경로까지 같이 검사하도록 넓혀 `stored-meta-legacy-coexistence` 상태를 추가했다.
- `/api/planning/v3/transactions/batches/[id]` `DELETE`는 synthetic stored-only legacy collision과 stored-meta legacy coexistence를 모두 `INPUT` 400 guard로 처리한다.
- stored-meta coexistence guard 문구는 “저장된 배치 정보와 파일만 제거된다”는 범위만 설명하고, pure stored-meta delete success와 pure synthetic stored-only delete success는 기존 동작을 유지했다.
- `tests/planning-v3-batches-api.test.ts`에 stored meta + legacy same-id coexistence에서 delete가 guard되고, detail surface가 계속 stored-first batch를 읽는 회귀 테스트를 추가했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/transactionStore.ts src/lib/planning/v3/store/batchesStore.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts work/3/21/2026-03-21-n2-stored-meta-batch-delete-legacy-coexistence-semantics.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm test tests/planning-v3-user-facing-remote-host-api.test.ts`

## 남은 리스크

- same-id legacy batch가 남아 있는 상태는 이제 명시적으로 guard되지만, stored/meta owner와 legacy bridge를 하나의 canonical delete owner로 합치는 작업은 이번 라운드 비범위다.
- pure legacy batch는 이 route의 delete owner가 아니므로 여전히 stored command surface 기준으로 `NO_DATA` 또는 guard만 반환하고, legacy-side delete/write contract는 별도 정리가 필요하다.
