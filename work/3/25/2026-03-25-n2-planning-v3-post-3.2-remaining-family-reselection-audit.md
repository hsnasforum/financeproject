# 2026-03-25 N2 planning-v3 post-3.2 remaining-family reselection audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/25/2026-03-25-n2-planning-v3-post-3.2-remaining-family-reselection-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only reselection audit 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: `3.2` closeout을 다시 열지 않고, override family와 batch-family current-state contract를 broad rewrite 없이 다음 공식 질문 후보 수준으로만 좁히는 기준으로 사용했다.
- `route-ssot-check`: stable `/planning*`와 beta `/planning/v3/*` route SSOT가 post-3.2 remaining-family reselection 판단과 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` audit 메모 형식과 실제 검증, parked family와 다음 후보를 현재 라운드 기준으로 정리했다.

## 변경 이유
- `3.2 ImportBatch / TransactionRecord`를 `none for now`로 닫은 뒤, `N2 planning/v3 API / import-export / rollback contract` 안에서 실제로 남아 있는 next smallest official question을 다시 골라야 했다.
- broad `N2` 구현이나 route behavior 변경을 열지 않고, `3.3`, `3.4`, `3.5`를 current code 기준으로 비교해 가장 작은 docs-first contract cut만 재선정하는 편이 가장 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`에 `post-3.2 remaining-family reselection audit (2026-03-25)` 메모를 추가했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에 같은 상태를 반영하는 연결 메모를 추가했다.
- `3.4 Draft family / applied profile boundary`는 `N1` memo chain과 current code 기준으로 apply route stable bridge, parked compat route, support/internal tier가 이미 비교적 정렬돼 있어 이번 라운드의 smallest `N2` candidate로 다시 고르지 않았다.
- `3.5 NewsSettings / AlertRule / Exposure / Scenario library`는 `NewsAlertRuleOverride` owner 구현 확인 이후에도 export/rollback grouping과 singleton config wrapper divergence를 같이 다뤄야 해서 현재 기준 더 큰 질문으로 남긴다고 정리했다.
- post-3.2 current smallest viable next `N2` candidate를 `3.3 override family current-state resync / batch-scoped owner vs legacy unscoped bridge containment`으로 재선정했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n2-planning-v3-post-3.2-remaining-family-reselection-audit.md`

## 남은 리스크
- 이번 라운드는 reselection audit이라 `3.3` current mixed ownership snapshot 자체를 아직 재작성하지 않았다. 다음 라운드에서 `txnOverridesStore.ts`뿐 아니라 `accountMappingOverridesStore.ts`, `txnTransferOverridesStore.ts`까지 포함한 current-state resync가 필요하다.
- `3.5`의 export/rollback grouping, `news/exposure` vs `exposure/profile` wrapper divergence, singleton config family 묶음은 여전히 `[검증 필요]` 또는 후속 official `N2` question 범위다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
