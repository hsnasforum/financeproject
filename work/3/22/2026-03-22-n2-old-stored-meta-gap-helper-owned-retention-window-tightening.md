# 2026-03-22 N2 old stored meta gap helper-owned retention window tightening

## 변경 파일
- `src/lib/planning/v3/transactions/store.ts`
- `tests/planning-v3-batches-api.test.ts`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-old-stored-meta-gap-helper-owned-retention-window-tightening.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: old stored meta gap helper boundary를 detail shell surface 안에서만 더 좁게 명시했다.
- `planning-gate-selector`: helper/test/doc 변경에 맞는 최소 검증 세트를 `pnpm test tests/planning-v3-batches-api.test.ts`, `pnpm build`, `git diff --check -- ...`로 선택했다.
- `work-log-closeout`: 오늘 라운드의 변경, 검증, 남은 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- previous bootstrap round에서 old stored meta `importMetadata` gap class predicate는 열렸지만, helper가 어떤 public field에 대해서만 legacy summary fallback을 유지하는지는 코드상 암묵적이었다.
- 이번 라운드는 fallback 제거나 backfill이 아니라, helper-owned bridge가 `failed`, `stats.failed` alias, `fileName`만 retention 대상으로 가진다는 경계를 코드와 테스트로 고정하는 bootstrap tightening cut이다.

## 핵심 변경
- `getStoredFirstLegacyDetailSummaryRetentionWindow()`를 추가해 fallback class별 helper-owned retention field를 명시했다.
- `buildStoredFirstVisibleBatchShell()`가 새 retention window helper를 직접 읽도록 바꿔 `failed`와 `fileName` compat bridge를 route-local이 아니라 shared helper 경계로 고정했다.
- `getStoredFirstLegacyDetailSummaryFallback()`도 같은 retention helper의 class 판정을 재사용하게 맞췄다.
- 테스트에서 `pure-legacy`, `old-stored-meta-importMetadata-gap`, `hybrid-legacy-summary-retained`의 retention window를 각각 고정했다.
- old stored meta gap fixture의 legacy `total/ok`를 일부러 키워 두고도 detail output `total/ok`가 current visible-row contract를 유지하는지 확인했다.
- 문서에 retention window tightening 메모를 한 단락 추가해, helper-owned boundary 명시화이지 fallback 제거/backfill이 아니라는 점을 남겼다.

## 검증
- `pnpm test tests/planning-v3-batches-api.test.ts`
  - PASS. `23 passed`.
- `pnpm build`
  - PASS. Next.js production build completed successfully.
- `git diff --check -- src/lib/planning/v3/transactions/store.ts tests/planning-v3-batches-api.test.ts analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/22/2026-03-22-n2-old-stored-meta-gap-helper-owned-retention-window-tightening.md`
  - PASS.
- 미실행 검증:
- `pnpm test tests/planning-v3-batch-center-api.test.ts`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- old stored meta gap class는 여전히 explicit schema marker 없이 `importMetadata` absence로만 식별한다. malformed historical meta와의 완전 분리는 아직 `[검증 필요]`다.
- 이번 라운드는 helper-owned retention window만 명시했을 뿐, `batch.failed` / `stats.failed` / `fileName` fallback 제거와 stored backfill/migration은 열지 않았다.
- `hybrid-legacy-summary-retained`에서 stored provenance `fileName`이 비어 있는 edge case는 여전히 helper-owned compat bridge로 남아 있다.
