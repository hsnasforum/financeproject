# 2026-03-25 N1 planning-v3 transactions-batches items-vs-data compat-payload memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `work/3/25/2026-03-25-n1-planning-v3-transactions-batches-items-vs-data-compat-payload-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only memo audit 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: dual-surface route meaning을 유지한 채 `/api/planning/v3/transactions/batches` 내부 compat payload tier만 더 좁게 분리하는 기준으로 사용했다.
- `route-ssot-check`: `/planning/v3/transactions/batches`와 관련 beta route가 `docs/current-screens.md` 기준과 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` 메모 형식과 실제 검증, 남은 compat payload 리스크를 현재 라운드 기준으로 정리했다.

## 변경 이유
- 직전 memo에서 `/api/planning/v3/transactions/batches`의 `items`/`data` compat payload meaning이 current smallest `N1` 후보로 남았고, 같은 route 안에서 primary list contract와 support/meta contract를 분리해 적을 필요가 있었다.
- writer owner, shared read layer, dual-surface route meaning을 다시 열지 않고 active consumer split만 잠그는 편이 가장 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에 `transactions/batches items-vs-data compat-payload memo audit` 연결 메모를 추가했다.
- `/api/planning/v3/transactions/batches`의 `items`를 `TransactionsBatchListClient`가 읽는 primary list contract로, `data`를 `BalancesClient`가 batch picker용으로 읽는 support/meta contract로 분리해 적었다.
- 두 payload가 같은 `getStoredFirstPublicCreatedAtString()` helper를 공유해도 같은 tier의 duplicate payload가 아니라는 점을 문서에 명시했다.
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 compat payload map, still-valid consumer split, mixed compat boundary, current smallest viable next `N1` candidate를 추가했다.
- 이번 라운드에서도 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`는 읽기 기준으로만 두고 추가 수정하지 않았다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-transactions-batches-items-vs-data-compat-payload-memo-audit.md`

## 남은 리스크
- `/api/planning/v3/transactions/batches`는 `nextCursor`를 여전히 반환하지만, current round 기준 active consumer는 확인되지 않아 future pagination/compat contract는 `[검증 필요]` 상태로 남는다.
- 이번 라운드에서는 compat payload tier를 잠갔지만, future consumer가 `data`를 co-primary list contract처럼 쓰기 시작하면 reopen이 필요할 수 있다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
