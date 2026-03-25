# 2026-03-20 N2 detail-summary createdAt parity helper alignment

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/lib/planning/v3/service/getBatchSummary.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-getBatchSummary.test.ts`
- `work/3/20/2026-03-20-n2-detail-summary-createdAt-parity.md`

## 사용 skill

- `planning-gate-selector`: detail route와 summary helper의 createdAt/public metadata parity 범위에 맞춰 `tests/planning-v3-batches-api.test.ts`, `tests/planning-v3-getBatchSummary.test.ts`, `pnpm build`, `git diff --check`만 실행하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 명령, shared createdAt predicate와 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 직전 라운드에서 detail route와 summary는 결과적으로 비슷한 createdAt hiding 동작을 하고 있었지만, detail은 `getStoredFirstDetailBatchCreatedAt()` 안에서, summary는 `getStoredFirstPublicCreatedAt()`를 직접 읽는 식이라 “public createdAt을 노출할 수 있는가”라는 판단 경계가 helper 이름만으로는 충분히 통일돼 보이지 않았다.
- 이번 라운드는 payload shape를 바꾸지 않고, public createdAt decision boundary만 shared helper/predicate 수준에서 정렬하는 것이 목적이었다.

## 핵심 변경

- `transactions/store.ts`에 `shouldExposeStoredFirstPublicCreatedAt()`를 추가해 synthetic `createdAt` hiding 판단을 boolean predicate로 분리했다.
- `getStoredFirstPublicCreatedAt()`는 이제 이 predicate를 읽고 값만 반환한다. `toStoredFirstPublicMeta()`도 같은 predicate를 사용해 `meta.createdAt` 노출 여부를 결정한다.
- `getStoredFirstDetailBatchCreatedAt()`도 같은 predicate를 먼저 읽고, detail route의 string contract 때문에 public createdAt이 숨겨져야 하면 legacy fallback 또는 빈 문자열로 downgrade한다는 의도를 주석으로 명시했다.
- `getBatchSummary`는 이제 같은 `shouldExposeStoredFirstPublicCreatedAt()`를 직접 읽고, true일 때만 `createdAt`을 포함한다. 값 표현은 detail과 summary가 다르지만 decision boundary는 같은 helper를 공유하게 됐다.
- detail/summary synthetic createdAt 테스트 이름을 shared public createdAt boundary가 드러나도록 바꿨다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-batches-api.test.ts`
- `pnpm test tests/planning-v3-getBatchSummary.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/service/getBatchSummary.ts src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/20/2026-03-20-n2-detail-summary-createdAt-parity.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- detail route는 같은 predicate를 읽어도 string contract 때문에 hidden createdAt을 빈 문자열로 downgrade하고, summary는 field omission을 유지한다. 판단 기준은 같아졌지만 표현 차이는 계속 남아 있다.
- `batch.createdAt` empty-string presentation과 raw `data` vs derived projection, `stats` mixed source semantics는 이번 라운드 비범위 그대로 남아 있다.
