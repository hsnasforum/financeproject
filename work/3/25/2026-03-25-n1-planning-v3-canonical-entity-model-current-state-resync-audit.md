# 2026-03-25 N1 planning-v3 canonical-entity-model current-state resync audit

## 변경 파일
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/25/2026-03-25-n1-planning-v3-canonical-entity-model-current-state-resync-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only 변경이라 `git diff --check`만 최소 검증으로 선택했다.
- `route-ssot-check`: `docs/current-screens.md` 기준 stable `/planning*`와 beta `/planning/v3/*` route mapping 충돌 여부를 다시 확인했다.
- `planning-v3-batch-contract-narrowing`: broad rewrite 대신 owner / reader facade / legacy bridge 경계를 유지한 채 next `N1` 후보를 좁히는 기준으로 사용했다.
- `work-log-closeout`: 이번 라운드 closeout note 형식에 맞춰 정리했다.

## 변경 이유
- `2026-03-19` code audit 이후 current code와 canonical entity 문서가 어디까지 still-valid한지 다시 맞출 필요가 있었다.
- `N5 stable/public`을 `none for now`로 닫은 뒤 next 공식 우선순위인 `N1`을 broad implementation이 아니라 docs-first resync audit부터 다시 잠가야 했다.

## 핵심 변경
- `NewsAlertRuleOverride` actual owner를 `src/lib/news/alerts.ts` 기준으로 재확인하고 persistence boundary를 `.data/alerts/rules.override.json` 계열 root로 보정했다.
- `generateDraftPatchFromBatch.ts`와 `getBatchSummary.ts`가 current code에서는 stored-first reader facade를 쓰는 점을 `v2/12` current-state drift map에 반영했다.
- stable `/planning*` route와 beta `/planning/v3/*` route의 SSOT가 current canonical route map과 충돌하지 않는다는 메모를 추가했다.
- next `N1` smallest viable candidate를 broad rewrite나 `N2` 구현이 아니라 `draft family owner-sync question`으로 잠갔다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-canonical-entity-model-current-state-resync-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- `ImportBatch` / `TransactionRecord` read ownership은 여전히 stored-first reader facade + legacy bridge 혼합 상태다.
- `CsvDraftRecord` / `V3DraftRecord` / `DraftProfileRecord` family facade와 shared-dir / legacy fallback boundary는 여전히 unresolved다.
- `NewsAlertRuleOverride` owner 구현은 확인됐지만 default config / override doc / generated alert event / event-state를 export-rollback 단위로 어디까지 묶을지는 여전히 `N2` 범위다.
