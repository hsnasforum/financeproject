# 2026-03-25 N1 planning-v3 ImportBatch TransactionRecord stored-first read owner vs legacy bridge memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `work/3/25/2026-03-25-n1-planning-v3-importbatch-transactionrecord-stored-first-read-owner-vs-legacy-bridge-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only memo audit 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: writer owner를 다시 열지 않고 stored-first reader facade / legacy bridge / route meaning을 가장 좁은 현재 질문으로 분리하는 기준으로 사용했다.
- `route-ssot-check`: stable `/planning*`와 beta `/planning/v3/*` route SSOT가 이번 read-owner memo와 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` 메모 형식과 실제 실행 검증, 남은 read-boundary 리스크를 현재 라운드 기준으로 정리했다.

## 변경 이유
- 직전 remaining-boundary reselection에서 `ImportBatch / TransactionRecord` read ownership이 current smallest `N1` 후보로 남았고, 이 범위를 writer owner 변경이 아니라 read-owner wording split으로 더 좁힐 필요가 있었다.
- broad batch-family rewrite나 `N2` 구현을 열지 않고, stored writer owner, stored-first reader facade, legacy bridge, route consumer meaning을 current code 기준으로 잠그는 편이 가장 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에 `ImportBatch / TransactionRecord stored-first read owner vs legacy bridge memo audit` 연결 메모를 추가했다.
- `src/lib/planning/v3/store/batchesStore.ts`를 current stored writer owner, `src/lib/planning/v3/service/transactionStore.ts`를 legacy NDJSON bridge/compat layer, `src/lib/planning/v3/transactions/store.ts`를 stored-first reader facade와 explicit legacy fallback을 함께 품은 mixed read layer로 분리해 적었다.
- `getBatchSummary.ts`, `generateDraftPatchFromBatch.ts`, `/api/planning/v3/batches`, `/api/planning/v3/batches/[id]/summary`, `/api/planning/v3/transactions/batches/[id]`, `/api/planning/v3/balances/monthly`를 stored-first read consumer와 route meaning 기준으로 다시 정리했다.
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 current read-boundary map, still-valid writer/read boundary, mixed read-owner boundary, next `N1` candidate를 추가했다.
- 이번 라운드에서도 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`는 읽기 기준으로만 두고 추가 수정하지 않았다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-importbatch-transactionrecord-stored-first-read-owner-vs-legacy-bridge-memo-audit.md`

## 남은 리스크
- `src/lib/planning/v3/transactions/store.ts`는 stored-first helper와 legacy bridge re-export가 같은 entrypoint에 공존해, module path만으로 owner를 추론하면 다시 섞여 읽힐 수 있다.
- `/api/planning/v3/batches`와 `/api/planning/v3/transactions/batches`는 같은 merged candidate set을 서로 다른 public contract로 소비하므로, dual list surface meaning은 후속 memo에서 더 좁혀야 한다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
