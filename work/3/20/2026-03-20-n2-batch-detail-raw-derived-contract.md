# 2026-03-20 N2 batch detail raw-vs-derived projection contract clarification

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/20/2026-03-20-n2-batch-detail-raw-derived-contract.md`

## 사용 skill

- `planning-gate-selector`: batch detail route의 내부 projection assembly 정리에 맞춰 `tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check`까지만 최소 검증으로 유지하는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 명령, raw `data`와 derived projection의 의미 차이를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 batch detail route는 `accountMonthlyNet`, `transactions`, `sample`에 account binding을 적용했지만, route 본문에는 여전히 raw rows와 bound rows가 나란히 흩어져 있어 `data`와 `transactions`가 왜 다를 수 있는지가 코드에서 충분히 읽히지 않았다.
- 이번 라운드는 response shape를 바꾸지 않고, raw surface는 raw로 유지하고 derived surface는 helper-owned binding/normalization을 읽는다는 batch detail contract를 더 명시적으로 드러내는 것이 목적이었다.

## 핵심 변경

- `transactions/store.ts`에 `getStoredFirstBatchDetailProjectionRows()`를 추가해 batch detail route가 읽는 row contract를 `rawRows`와 `derivedRows`로 분리했다.
- helper 주석에 `data`는 raw snapshot payload를 유지하고, user-facing derived projection은 batch-level account binding이 적용된 rows를 읽는다는 정책을 명시했다.
- batch detail route는 이제 `monthsSummary`와 `data`는 `rawRows`를, `transactions`, `sample`, `accountMonthlyNet`은 `derivedRows`를 읽도록 assembly를 한 곳에서 정리한다.
- 테스트 이름과 assertion을 바꿔 stored rows의 `accountId`가 비어 있을 때 `transactions.accountId`는 bound value를 가지지만 `data.accountId`는 비어 있을 수 있다는 contract를 잠갔다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-batches-api.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/20/2026-03-20-n2-batch-detail-raw-derived-contract.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- 실행하지 않은 추가 검증
- `pnpm test tests/planning-v3-getBatchSummary.test.ts`
- 이유: 이번 라운드는 batch detail route의 raw/derived projection 조립 의미만 정리했고 summary consumer나 synthetic metadata/legacy summary fallback 규칙은 다시 열지 않았다.

## 남은 리스크

- `data`는 의도적으로 raw payload로 남아 있으므로, raw surface를 직접 읽는 consumer는 row-level `accountId` 공백을 계속 볼 수 있다.
- `sample`은 derived rows를 읽지만 응답 shape에 `accountId`가 없어서 raw/derived 차이가 payload에서 직접 드러나지 않는다.
- synthetic metadata hiding과 legacy summary fallback 범위는 직전 라운드 상태를 그대로 유지한다. 이번 라운드는 raw/derived projection 의미만 정리했다.
