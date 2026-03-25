# 2026-03-20 N2 batch detail account binding normalization

## 변경 파일

- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/20/2026-03-20-n2-batch-detail-account-binding-normalization.md`

## 사용 skill

- `planning-gate-selector`: batch detail route의 derived projection 변경에 맞춰 최소 검증 세트를 `tests/planning-v3-batches-api.test.ts`와 `pnpm build` 중심으로 유지하는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 명령, raw/derived projection 분리와 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 batch detail route는 legacy summary fallback과 synthetic metadata hiding을 정리했지만, stored rows의 `accountId`가 비고 batch-level binding만 남은 케이스에서는 `accountMonthlyNet`과 transaction table이 여전히 `unassigned` 기준으로 보일 수 있었다.
- `transactions/store.ts`에는 이미 `applyStoredFirstBatchAccountBinding()`가 있었지만, batch detail route는 이를 detail projection에 아직 적용하지 않고 raw rows를 그대로 `classifyTransactions()`와 `summarizeAccountMonthlyNet()`에 넘기고 있었다.
- 이번 라운드는 raw `data`는 유지하고, detail surface의 derived projection만 helper-owned account binding 기준으로 정렬하는 것이 목적이었다.

## 핵심 변경

- batch detail route는 이제 `rawTransactions`와 `boundTransactions`를 분리해 사용한다. `boundTransactions`는 `applyStoredFirstBatchAccountBinding()`를 통해 `meta.accounts -> legacyBatch.accountId` 우선순위로 batch-level binding을 채운 rows다.
- `accountMonthlyNet`은 이제 `boundTransactions`를 기준으로 계산한다. row-level `accountId`가 비어 있어도 batch binding이 있으면 계좌별 월 net이 `unassigned`로 빠지지 않게 했다.
- `transactions`도 `boundTransactions`를 분류/override 적용의 입력으로 사용하고, 응답 row에 `accountId`를 포함하도록 맞췄다. detail client가 거래 행의 실제 계좌 binding을 직접 읽을 수 있게 했다.
- `sample`도 같은 `boundTransactions`를 읽도록 맞췄다. 현재 sample shape에는 `accountId`가 없어서 출력 자체는 같지만, detail route 내부 기준은 bound rows로 통일했다.
- `monthsSummary`와 raw `data`는 여전히 `rawTransactions`를 사용한다. 특히 `data`는 raw surface 성격을 유지해 stored rows에 `accountId`가 비어 있는 경우 그대로 남겨 두었다.
- batch detail 테스트에는 stored meta account binding만 있고 row `accountId`는 비어 있는 fixture를 추가해 `accountMonthlyNet`과 `transactions`는 bound rows를 읽고 `data`는 raw 그대로 남는지 잠갔다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-batches-api.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-balances-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/20/2026-03-20-n2-batch-detail-account-binding-normalization.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- 실행하지 않은 추가 검증
- `pnpm test tests/planning-v3-balances-api.test.ts`
- `pnpm test tests/planning-v3-getBatchSummary.test.ts`
- 이유: 이번 라운드는 existing account binding helper 재사용만 했고 helper 본문이나 summary/balances consumer는 수정하지 않았다.

## 남은 리스크

- `sample`은 내부적으로 bound rows를 읽지만 응답 shape에 `accountId`가 없어서 visible behavior 차이는 없다. 실제 사용자 체감 변화는 `transactions`와 `accountMonthlyNet` 쪽이 더 크다.
- raw `data`는 의도적으로 그대로 남겼기 때문에 stored rows에 `accountId`가 비어 있는 detail payload는 여전히 혼합 상태다. consumer가 raw `data`를 직접 쓰면 derived projection과 다르게 보일 수 있다.
- `batch.createdAt` synthetic timestamp 리스크와 legacy summary projection 구조화 범위는 직전 라운드와 동일하게 남아 있다.
- 워크트리에는 이번 배치와 무관한 기존 dirty 변경이 계속 남아 있으므로 후속 commit/PR 분리 시 주의가 필요하다.
