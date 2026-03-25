# 2026-03-21 N2 pure legacy batch delete boundary

## 변경 파일

- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/21/2026-03-21-n2-pure-legacy-batch-delete-boundary.md`

## 사용 skill

- `planning-gate-selector`: batch delete route와 helper 범위에 맞춰 `tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check`를 실행 검증으로 고르고 `pnpm lint`, `pnpm e2e:rc`, `tests/planning-v3-user-facing-remote-host-api.test.ts`를 미실행 검증으로 남기는 데 사용
- `work-log-closeout`: 이번 라운드의 changed files, 실제 실행한 검증, 남은 legacy delete contract 리스크를 `/work` 형식으로 정리하는 데 사용
- `planning-v3-batch-contract-narrowing`: pure legacy batch가 read facade에서는 보이지만 stored delete owner는 아니라는 경계를 delete helper 하나에 모아 explicit boundary guard로 좁히는 데 사용

## 변경 이유

- pure legacy batch는 stored meta나 stored rows 없이 legacy owner에만 단독으로 남아 있을 수 있고, detail read surface는 이를 계속 해석한다.
- 그런데 `/api/planning/v3/transactions/batches/[id]` `DELETE`는 stored command surface 기준만 보고 `NO_DATA` 404를 돌려, 배치가 없는 것처럼 보이거나 delete owner 경계를 숨기는 문제가 있었다.

## 핵심 변경

- `getStoredBatchDeleteSurfaceState()`가 stored command surface가 `missing`이어도 same-id legacy batch를 추가로 확인해 `legacy-only` 상태를 반환하도록 넓혔다.
- `/api/planning/v3/transactions/batches/[id]` `DELETE`는 pure legacy batch에서 더 이상 `NO_DATA`를 반환하지 않고, `INPUT` 400과 “기존 배치만 남아 있는 경우 이 삭제 경로는 지원하지 않습니다.” 메시지로 command boundary를 명시한다.
- synthetic stored-only legacy collision, stored-meta legacy coexistence, pure legacy boundary를 같은 delete helper 기준으로 묶었고, pure stored-meta delete success와 pure synthetic stored-only delete success는 그대로 유지했다.
- `tests/planning-v3-batches-api.test.ts`에 pure legacy batch가 detail에서는 계속 해석되지만 delete는 explicit boundary guard를 반환하는 회귀 테스트를 추가했다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/transactionStore.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts work/3/21/2026-03-21-n2-pure-legacy-batch-delete-boundary.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm test tests/planning-v3-user-facing-remote-host-api.test.ts`

## 남은 리스크

- pure legacy batch는 이제 explicit guard로 드러나지만, legacy owner 자체의 delete/write contract를 user-facing route에 어떻게 노출할지는 이번 라운드 비범위다.
- `DELETE` helper는 boundary 설명만 정리했을 뿐 legacy-side delete 지원, migration, write-back, owner 승격은 하지 않았으므로 canonical delete owner 재정의는 후속 검토가 남아 있다.
