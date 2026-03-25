# 2026-03-22 N2 old stored meta importMetadata gap predicate helper bootstrap

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-old-stored-meta-importMetadata-gap-predicate-helper-bootstrap.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail helper surface만 좁게 보고 old stored meta gap class 판정 경계를 shared helper로 먼저 드러내는 데 사용.
- `planning-gate-selector`: batch detail helper 변경으로 분류해 `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check`를 실행 검증으로 고정하고 나머지는 미실행 검증으로 남기는 데 사용.
- `work-log-closeout`: 실제 수정 파일, 실행 검증, 남은 리스크를 표준 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- old stored meta gap class는 현재 `hybrid-legacy-transactions + stored metadataSource + needsLegacyDetailFallback + missing importMetadata` 조합으로만 암묵 판정되고 있어, 다음 retention/backfill 판단 전에 shared helper 수준의 명시적 경계가 필요했다.
- 이번 라운드는 fallback 제거나 backfill 구현이 아니라, pure legacy와 old stored meta gap class를 helper 내부에서 구분하는 bootstrap만 최소 범위로 추가하는 것이 목표였다.

## 핵심 변경
- `src/lib/planning/v3/transactions/store.ts`에 `getStoredFirstLegacyDetailFallbackClass()`와 `isOldStoredMetaImportMetadataGap()`를 추가해 old stored meta gap class와 pure legacy fallback class를 shared helper 수준에서 판정할 수 있게 했다.
- `getStoredFirstLegacyDetailSummaryFallback()`은 새 class helper를 읽도록 바꿨지만, legacy summary를 반환하는 현재 behavior는 유지했다.
- `tests/planning-v3-batches-api.test.ts`에는 pure legacy가 `pure-legacy` class로, hybrid stored meta without `importMetadata`가 `old-stored-meta-importMetadata-gap` class로 판정되는 회귀를 추가했다.
- 같은 hybrid gap test에서 detail API의 `failed/fileName/total/ok` output이 기존 fallback 규칙대로 유지된다는 점도 함께 고정했다.
- `analysis_docs/v2/13...`에는 predicate helper bootstrap이 열렸지만 fallback 제거/backfill은 아직 아니라는 메모만 최소 범위로 추가했다.

## 검증
- 실행:
  - `pnpm test tests/planning-v3-batches-api.test.ts`
  - `pnpm build`
  - `git diff --check -- src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-old-stored-meta-importMetadata-gap-predicate-helper-bootstrap.md`
- 미실행:
  - `pnpm test tests/planning-v3-batch-center-api.test.ts`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 판정 helper bootstrap만 열었고, actual fallback 제거나 stored meta backfill/migration은 전혀 시작하지 않았다.
- `hybrid-legacy-summary-retained` class는 behavior 보존을 위해 남겨 두었지만, future retention/backfill cut에서 어떤 helper가 어떤 class를 소비하는지 더 좁게 정리할 필요가 있다.
- old stored meta gap class는 여전히 explicit schema marker 없이 `importMetadata` absence로 식별하므로, malformed historical meta와 owner-bootstrap 이전 meta를 완전히 구분하는 proof는 아직 없다. `[미확인]`
- smallest safe next cut: predicate helper를 재사용해 old stored meta gap class 전용 retention window를 helper contract와 tests로 더 좁히되, direct backfill이나 fallback 제거는 proof contract가 닫히기 전까지 열지 않는다.
