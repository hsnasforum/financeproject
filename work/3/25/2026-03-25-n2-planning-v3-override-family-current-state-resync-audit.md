# 2026-03-25 N2 planning-v3 override-family current-state resync audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/25/2026-03-25-n2-planning-v3-override-family-current-state-resync-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only resync audit 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: `3.2` closeout을 reopen하지 않고, `3.3` owner/reader tier wording만 current code 기준으로 다시 잠그는 기준으로 사용했다.
- `route-ssot-check`: stable `/planning*`와 beta `/planning/v3/*` route SSOT가 이번 `3.3` resync 판단과 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` audit 메모 형식과 실제 검증, stale boundary와 다음 후보를 현재 라운드 기준으로 정리했다.

## 변경 이유
- 직전 reselection audit에서 `3.3 override family`가 post-3.2 기준 가장 작은 공식 `N2` candidate로 다시 선정됐고, current mixed ownership snapshot이 현재 코드보다 좁게 적혀 있어 resync가 필요했다.
- broad `N2` 구현이나 override-family rewrite를 열지 않고, batch-scoped owner set과 legacy unscoped bridge tier를 current code 기준으로 다시 적는 편이 가장 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `3.3 CategoryRule / override family` section에서 route 분류, request intent, current mixed ownership snapshot, handoff cut을 current code 기준으로 보강했다.
- `txnOverridesStore.ts`뿐 아니라 `accountMappingOverridesStore.ts`, `txnTransferOverridesStore.ts`까지 batch-scoped writer owner surface에 포함된다고 문서에 명시했다.
- `/api/planning/v3/transactions/overrides`를 dev-only internal bridge route로 다시 잠그고, public canonical read facade로 읽으면 안 된다는 경계를 support/internal tier로 분명히 남겼다.
- `getBatchSummary.ts`, `generateDraftPatchFromBatch.ts`, `/categorized`, `/cashflow`, `/transfers`, `/balances/monthly`를 세 override store와 `CategoryRule`을 함께 읽는 multi-owner projection stack으로 다시 정리했다.
- next `N2` candidate를 `override-family current-state closeout docs-only sync`로 좁히고, override precedence 재설계나 route/API 변경은 비범위로 고정했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n2-planning-v3-override-family-current-state-resync-audit.md`

## 남은 리스크
- 이번 라운드는 current-state wording resync만 다뤘다. override precedence 재설계, legacy bridge 제거 구현, export/rollback 단위 확정은 여전히 후속 `N2` 본작업 범위다.
- `/api/planning/v3/transactions/overrides`의 dev-only bridge를 실제로 얼마나 오래 유지할지, `3.5` config family grouping과 어떤 순서로 이어 갈지는 여전히 `[검증 필요]`다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
