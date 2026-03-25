# 2026-03-25 N1 planning-v3 batch-list dual-surface route-meaning memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `work/3/25/2026-03-25-n1-planning-v3-batch-list-dual-surface-route-meaning-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only memo audit 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: writer owner, stored-first reader facade, legacy bridge 분리를 유지한 채 dual list surface의 route meaning만 더 좁게 분리하는 기준으로 사용했다.
- `route-ssot-check`: `/planning/v3/batches`와 `/planning/v3/transactions/batches`가 `docs/current-screens.md` 기준 `Public Beta` route로 유지되는지 확인했다.
- `work-log-closeout`: `/work` 메모 형식과 실제 검증, 남은 route-meaning 리스크를 현재 라운드 기준으로 정리했다.

## 변경 이유
- 직전 memo에서 same merged candidate set을 읽는 dual list surface가 current smallest `N1` 후보로 남았고, `/api/planning/v3/batches`와 `/api/planning/v3/transactions/batches`를 같은 public contract로 읽지 않도록 route meaning을 더 좁힐 필요가 있었다.
- broad batch-family rewrite나 `N2` contract 구현을 열지 않고, summary row surface와 transaction list/picker support surface 차이를 docs-first로 잠그는 편이 가장 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에 `batch-list dual-surface route-meaning memo audit` 연결 메모를 추가했다.
- `/api/planning/v3/batches`를 `BatchesCenterClient`가 읽는 batch-center summary row surface로, `/api/planning/v3/transactions/batches`를 `TransactionsBatchListClient`가 읽는 transaction batch list surface이자 `BalancesClient`가 읽는 batch-picker support surface로 분리해 적었다.
- `createdAt` 정책도 route meaning과 함께 잠갔다. `/api/planning/v3/batches`는 omission boundary, `/api/planning/v3/transactions/batches`는 string downgrade contract를 유지한다.
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 dual-surface route-meaning map, still-valid shared read-layer boundary, mixed route-meaning boundary, next `N1` candidate를 추가했다.
- 이번 라운드에서도 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`는 읽기 기준으로만 두고 추가 수정하지 않았다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-batch-list-dual-surface-route-meaning-memo-audit.md`

## 남은 리스크
- `/api/planning/v3/transactions/batches`는 `items`와 `data`를 함께 내보내고, current beta clients도 이를 나눠 읽으므로 payload tier를 더 좁히는 후속 memo가 필요하다.
- same merged candidate set을 읽는 두 route의 meaning은 분리했지만, `/api/planning/v3/transactions/batches` 내부 compat payload boundary는 아직 `[검증 필요]` 상태다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
