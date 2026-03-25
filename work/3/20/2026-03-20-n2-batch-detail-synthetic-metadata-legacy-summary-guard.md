# 2026-03-20 N2 batch detail synthetic metadata and legacy summary fallback guard

## 변경 파일

- `src/lib/planning/v3/transactions/store.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `tests/planning-v3-batches-api.test.ts`
- `work/3/20/2026-03-20-n2-batch-detail-synthetic-metadata-legacy-summary-guard.md`

## 사용 skill

- `planning-gate-selector`: batch detail route의 fallback guard와 stored-first metadata alignment 범위에 맞춰 `tests/planning-v3-batches-api.test.ts`, `tests/planning-v3-getBatchSummary.test.ts`, `pnpm build`, `git diff --check`만 실행하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 수정 파일, 실행한 명령, synthetic metadata hiding과 legacy summary fallback의 잔여 범위를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- batch detail route는 raw/derived projection contract와 account binding은 이미 정리했지만, `batch.createdAt`는 여전히 stored meta보다 legacy summary `createdAt`를 먼저 읽을 수 있었고, synthetic stored-only 케이스에서는 epoch 문자열이 남을 수 있었다.
- 또한 `batch`, `stats`, `sample` 중 어떤 필드가 legacy summary fallback을 읽고 어떤 필드는 recovered rows만 읽는지가 route 본문에서 충분히 드러나지 않았다.
- 이번 라운드는 response shape를 바꾸지 않고, synthetic metadata hiding과 legacy summary fallback 범위를 더 명시적으로 잠그는 것이 목적이었다.

## 핵심 변경

- `transactions/store.ts`에 `getStoredFirstLegacyDetailSummaryFallback()`를 추가해 batch detail route가 legacy summary fallback을 읽는 경계를 `policy.needsLegacyDetailFallback` 기준으로 고정했다.
- `getStoredFirstDetailBatchCreatedAt()`를 추가해 `batch.createdAt`는 public stored/legacy-derived metadata가 있으면 그것을 우선 쓰고, synthetic metadata인데 explicit legacy summary fallback도 없으면 빈 문자열로 downgrade하도록 했다.
- batch detail route는 `legacySummaryFallback`을 한 번만 계산해 `batch`와 `stats`에만 넘긴다. `sample`은 계속 recovered derived rows를 읽고, `transactions/monthsSummary/accountMonthlyNet/data/meta`는 기존 stored-first/raw-derived 정책을 유지한다.
- hybrid snapshot 테스트에는 `batch.createdAt`가 stored meta 시각을 쓰고, `stats.total/ok/failed`만 legacy summary fallback을 읽으며, `sample`은 recovered legacy rows를 읽는 케이스를 잠갔다.
- synthetic stored-only 테스트에는 `meta.createdAt`뿐 아니라 `batch.createdAt`도 더 이상 synthetic epoch를 노출하지 않고 빈 문자열로 downgrade되는지 추가로 잠갔다.
- `getBatchSummary` 코드는 이번 라운드에서 다시 수정하지 않았다. 대신 기존 summary tests를 다시 실행해 detail route의 `createdAt` guard가 summary의 hiding 규칙과 어긋나지 않는지 확인했다.

## 검증

- 실행한 확인
- `pnpm test tests/planning-v3-batches-api.test.ts`
- `pnpm test tests/planning-v3-getBatchSummary.test.ts`
- `pnpm build`
- `git diff --check -- src/app/api/planning/v3/transactions/batches/[id]/route.ts src/lib/planning/v3/transactions/store.ts src/lib/planning/v3/service/getBatchSummary.ts tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts work/3/20/2026-03-20-n2-batch-detail-synthetic-metadata-legacy-summary-guard.md`
- 미실행 검증
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크

- `batch.createdAt`는 synthetic stored-only 케이스에서 epoch 대신 빈 문자열로 downgrade되지만, client contract가 여전히 string이라 UI에서는 `-`가 아니라 빈 값으로 보일 수 있다.
- `stats.inferredMonths`는 legacy summary fallback이 아니라 raw/recovered rows month aggregation에서 계산되므로, `stats.total`과 source가 완전히 같지는 않다. 이번 라운드는 total/ok/failed fallback 범위만 잠갔다.
- `data`는 raw payload를 그대로 유지하고 `sample`은 derived rows를 읽으므로, raw surface와 derived surface가 다를 수 있는 contract 자체는 계속 남아 있다.
