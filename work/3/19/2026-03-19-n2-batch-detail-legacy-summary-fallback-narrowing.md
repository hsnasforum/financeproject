# 2026-03-19 N2 batch detail legacy summary fallback narrowing

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/lib/planning/v3/service/getBatchSummary.ts`
- `tests/planning-v3-batches-api.test.ts`
- `tests/planning-v3-getBatchSummary.test.ts`
- `work/3/19/2026-03-19-n2-batch-detail-legacy-summary-fallback-narrowing.md`

## 사용 skill

- `planning-gate-selector`: batch detail route와 summary helper의 fallback 정책 변경에 맞춰 targeted test와 `pnpm build` 중심 검증 세트를 유지하는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 명령, synthetic metadata 노출과 legacy summary fallback 잔여 범위를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `/api/planning/v3/transactions/batches/[id]`는 stored-first reader를 쓰면서도 `batch/sample/stats` 보강을 위해 여전히 `readBatch(id)`를 직접 읽고 있었다.
- 그 결과 transaction rows, `monthsSummary`, `accountMonthlyNet`, `meta`는 stored-first helper 기준인데, legacy import summary projection만 별도 detail read에 의존해 fallback 경계가 덜 명시적이었다.
- 또한 stored rows만 있고 batch meta가 없는 synthetic metadata 케이스에서 batch detail route는 `meta.createdAt`에 `1970-01-01T00:00:00.000Z`를 그대로 노출할 수 있었고, summary route의 hiding 정책과도 어긋날 수 있었다.

## 핵심 변경

- `transactions/store.ts`에 `getStoredFirstPublicCreatedAt()`와 `toStoredFirstPublicMeta()`를 추가해 synthetic metadata면 `createdAt`를 public read surface에서 숨기는 규칙을 helper 쪽으로 모았다.
- batch detail route는 더 이상 `readBatch(id)`를 직접 읽지 않는다. `batch`와 `stats`는 `loaded.legacyBatch` summary projection만 읽고, `sample`은 stored-first helper가 고른 rows에서 직접 만든다.
- 이로써 `transactions`, `data`, `monthsSummary`, `accountMonthlyNet`, `meta`는 계속 helper 기준을 유지하고, legacy fallback은 `fileName/accountId/total/ok/failed` 같은 summary projection으로만 더 좁아졌다.
- batch detail route의 `meta`는 이제 `toStoredFirstPublicMeta()`를 사용해 synthetic `createdAt`를 숨긴다. stored/hybrid/legacy-derived metadata의 `createdAt`는 그대로 유지한다.
- `getBatchSummary`도 같은 helper를 사용해 synthetic `createdAt` hiding 규칙을 route와 공유한다.
- batch detail/summary 테스트에는 stored rows만 있고 stored meta는 없는 synthetic snapshot fixture를 추가해 `meta.createdAt` 및 `summary.createdAt`가 숨겨지는지 잠갔다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/getBatchSummary.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts work/3/19/2026-03-19-n2-batch-detail-legacy-summary-fallback-narrowing.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`
- 실행하지 않은 추가 검증
- `pnpm test tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
- 이유: 이번 라운드는 batch detail route와 summary helper의 fallback 정책만 건드렸고 categorized/cashflow route 본문은 다시 열지 않았다.

## 남은 리스크

- batch detail route는 `readBatch(id)`를 제거했지만 `batch.createdAt` 자체는 client contract가 string이라 synthetic stored-only 케이스에서 여전히 synthetic timestamp를 쓸 수 있다. 이번 라운드는 `meta.createdAt` hiding까지만 맞췄다.
- legacy summary fallback은 `legacyBatch` projection으로 더 좁혀졌지만, legacy import summary의 모든 필드를 helper가 구조화한 것은 아니다. 후속 라운드에서 detail batch projection 자체를 helper contract로 올릴 여지는 남아 있다.
- `accountMonthlyNet`과 raw `data`는 여전히 row-level `accountId`를 기준으로 하므로, stored rows에 `accountId`가 비고 `meta.accounts`만 있는 케이스의 detail surface 정렬은 별도 라운드가 필요할 수 있다.
- 워크트리에는 이번 배치와 무관한 기존 dirty 변경이 계속 남아 있으므로 후속 commit/PR 분리 시 주의가 필요하다.
