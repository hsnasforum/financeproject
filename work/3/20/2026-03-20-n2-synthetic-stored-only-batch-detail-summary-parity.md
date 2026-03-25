# 2026-03-20 N2 synthetic stored-only batch detail-summary parity guard

## 변경 파일

- `src/lib/planning/v3/service/getBatchSummary.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-batch-center-api.test.ts`
- `work/3/20/2026-03-20-n2-synthetic-stored-only-batch-detail-summary-parity.md`

## 사용 skill

- `planning-gate-selector`: batch list/detail/summary parity 범위에 맞춰 targeted tests와 `pnpm build`만 고르고, 미실행 검증을 `pnpm lint`, `pnpm e2e:rc`로 남기는 최소 검증 세트를 정하는 데 사용
- `work-log-closeout`: 이번 parity guard 라운드의 실제 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용
- `planning-v3-batch-contract-narrowing`: synthetic stored-only batch가 list/detail/summary에서 같은 stored-first reader와 hidden public `createdAt` boundary를 유지하는지 확인하고, route-local 조건 추가 대신 shared helper 재사용 쪽으로 좁히는 데 사용

## 변경 이유

- synthetic stored-only batch는 이미 list surface에서는 discover되지만, 같은 batch id가 detail/summary에서도 같은 기준으로 해석되는지 direct regression test가 부족했다.
- `getBatchSummary()`는 behavior상 parity를 유지하고 있었지만, hidden public `createdAt` 판단은 summary 쪽에서 predicate를 직접 읽고 있어 list/detail helper reuse가 코드상 충분히 드러나지 않았다.

## 핵심 변경

- `getBatchSummary.ts`는 이제 summary `createdAt` 노출 여부를 `toStoredFirstPublicMeta()`로 읽어, summary도 list와 같은 public metadata helper를 거치게 했다.
- 이로써 synthetic stored-only batch의 surrogate internal `meta.createdAt`은 summary에서도 직접 노출되지 않고, list/detail/summary가 같은 hidden public `createdAt` boundary를 읽는다.
- `tests/planning-v3-batches-api.test.ts`에 synthetic batch가 transaction batch list에서 보인 뒤 같은 batch id로 detail route에서도 정상 해석되고 hidden `createdAt`가 유지되는 회귀 테스트를 추가했다.
- `tests/planning-v3-batch-center-api.test.ts`에 synthetic batch가 batch center list에서 보인 뒤 direct summary route에서도 같은 batch id로 정상 해석되고 hidden `createdAt`가 유지되는 회귀 테스트를 추가했다.
- 이번 라운드에서는 list route, detail route, summary route payload shape는 바꾸지 않았고, synthetic batch를 정식 meta/index row로 write-back 하지 않았다.

## 검증

- 실행한 검증
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts tests/planning-v3-getBatchSummary.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/route.ts src/app/api/planning/v3/batches/route.ts src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/service/getBatchSummary.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/20/2026-03-20-n2-synthetic-stored-only-batch-detail-summary-parity.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- synthetic stored-only batch는 이제 list -> detail, list -> summary direct parity가 테스트로 잠겼지만, delete/write surface는 여전히 index/meta row 기준 동작이라 read parity와 write parity가 완전히 같은 것은 아니다.
- summary route는 이제 same helper boundary를 읽지만, detail은 string contract 때문에 hidden `createdAt`를 `""`로 내리고 summary는 omission을 유지하므로 표현 방식 자체는 여전히 다르다.
- index repair/write-back은 하지 않으므로 synthetic batch는 이후에도 read-side helper가 `.ndjson` rows와 fallback surrogate를 매번 다시 계산한다.
