# 2026-03-23 N4 raw batch center vs user-facing batch overlay distinction audit

## 변경 파일
- `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`

## 사용 skill
- `planning-gate-selector`: docs-only 라운드라 `git diff --check -- ...`만 최소 검증으로 유지했다.
- `route-ssot-check`: `docs/current-screens.md`를 current inventory SSOT로 두고 `/planning/v3/batches*`와 `/planning/v3/transactions/batches*`의 역할 구분이 문서와 맞는지 재확인했다.
- `work-log-closeout`: 이번 audit 범위, 검증, 남은 리스크를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- `analysis_docs/v2/15...`에서 마지막 residual wording drift로 남아 있던 `/planning/v3/batches*` vs `/planning/v3/transactions/batches*` 축을 더 또렷하게 적어, current inventory와 next-cycle overlay를 함께 읽을 때 raw batch center/summary와 user-facing batch list/detail을 혼동하지 않게 해야 했다.

## 핵심 변경
- `/planning/v3/batches`와 `/planning/v3/batches/[id]`를 각각 `BatchesCenterClient`, `BatchSummaryClient`가 붙는 실존 raw center/summary route로 문서에 직접 풀어썼다.
- `/planning/v3/transactions/batches/[id]`를 `/planning/v3/transactions/batches` user-facing list 뒤에서 여는 deep-link detail로 명시해 raw `/planning/v3/batches/[id]`와 다른 축임을 적었다.
- `analysis_docs/v2/15...`의 residual wording drift 메모를 현재 wording clarification 완료 상태로 갱신하고, 남은 `[검증 필요]`를 future implementation round의 distinction preservation risk로 좁혔다.
- `analysis_docs/v2/11...` backlog 메모를 같은 상태로 동기화해, 다음 `N4` 재오픈 시 broad visibility 구현보다 preservation check가 더 작은 후속 컷임을 남겼다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md work/3/23/2026-03-23-n4-raw-batch-center-vs-user-facing-batch-overlay-distinction-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 wording clarification만 수행했으므로, future implementation round에서 `/planning/v3/batches*`와 `/planning/v3/transactions/batches*`를 다시 같은 “beta batch route”로 뭉뚱그리면 overlay drift가 재발할 수 있다.
- `docs/current-screens.md`는 broad current inventory를 유지하므로, 노출 정책 실제 적용 라운드에서는 여전히 current inventory와 next-cycle overlay를 구분해 읽어야 한다.
