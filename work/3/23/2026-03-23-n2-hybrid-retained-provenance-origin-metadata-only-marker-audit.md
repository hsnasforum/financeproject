# 2026-03-23 N2 hybrid retained provenance-origin metadata-only marker audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n2-hybrid-retained-provenance-origin-metadata-only-marker-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: hybrid retained visible `fileName` compat bridge subset 안에서 writer/store metadata boundary만 좁혀 marker contract를 남기는 데 사용했다.
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`는 미실행으로 남겼다.
- `work-log-closeout`: marker 후보, expected touchpoint, 미실행 검증, 남은 provenance-origin 리스크를 오늘 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- previous provenance-origin proof audit까지는 visible `fileName` bridge subset 안의 blank stored provenance origin을 runtime evidence만으로 구분할 수 없다는 사실만 닫혔고, future runtime에서 이를 더 좁히려면 어떤 metadata-only marker가 필요한지는 아직 문서로 고정되지 않았다.
- 이번 라운드는 marker를 실제로 추가하는 구현이 아니라, smallest useful marker 후보와 그 한계를 docs-first로 잠그는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 provenance-origin metadata-only marker audit 메모를 추가해, current stored metadata inventory가 `diagnostics.rows/parsed/skipped`와 optional `provenance.fileName`까지만 가진다는 점을 명시했다.
- 같은 메모에서 smallest useful marker 후보를 `importMetadata.provenance.fileNameProvided: boolean`으로 남기고, `source kind`나 handoff version alone은 omission vs gap을 직접 가르지 못하므로 이번 질문의 smallest candidate가 아니라고 적었다.
- marker가 분리 가능한 subset은 marker-aware omission/provided subset까지이고, marker missing historical subset과 legacy label origin proof는 계속 `[미확인]`, `[검증 필요]`로 남는다고 정리했다.
- expected touchpoint는 `transactions.ts`, `importCsvToBatch.ts`, `batchesStore.ts`의 metadata boundary로만 좁히고, `transactions/store.ts` detail helper/public payload는 first cut에서 무수정으로 유지할 수 있다고 적었다.
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 backfill 구현이 아니라 metadata-only marker audit이라는 한정된 메모만 추가했다.

## 검증
- `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/23/2026-03-23-n2-hybrid-retained-provenance-origin-metadata-only-marker-audit.md`
  - PASS.
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`

## 남은 리스크
- `fileNameProvided` 같은 marker 후보를 문서로 정해도 existing no-marker historical subset은 여전히 unresolved이므로, historical handoff gap을 runtime에서 곧바로 증명할 수는 없다. [미확인]
- marker alone으로는 legacy `batch.fileName`이 original import provenance였는지, later append/merge drift가 없었는지, migration/backfill 완료 사실이 있는지 증명하지 못한다. [검증 필요]
- 따라서 next cut도 marker bootstrap을 넘어 provenance-only backfill이나 `fileName` fallback 제거로 넓히면 guessed provenance write 또는 premature visible contract shrink 위험이 남는다.
