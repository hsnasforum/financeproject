# 2026-03-24 next stable/public route-cluster candidate selection audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-next-stable-public-route-cluster-candidate-selection-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only selection audit 라운드에 맞춰 `git diff --check`만 실행했다.
- `route-ssot-check`: `docs/current-screens.md` 기준으로 남은 stable/public route group을 다시 확인하고, `Public Stable` inventory와 충돌하지 않는 후보만 남겼다.
- `work-log-closeout`: 이번 selection 결과, 보류 cluster, 남은 리스크를 `/work` 종료 기록으로 남겼다.

## 변경 이유
- `/dashboard`와 `/feedback` cluster가 `N5` small-batch polish 기준으로 사실상 닫힌 현재 상태에서, 남아 있는 stable/public surface 중 다음 smallest candidate cluster를 다시 고를 필요가 있었다.
- planning/products/settings처럼 큰 route family를 성급히 열면 contract-first backlog와 무관한 broad implementation으로 커질 수 있어, docs-first selection 기준을 먼저 고정해야 했다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 remaining stable/public cluster map, smallest viable next candidate, defer-for-now cluster, next cut recommendation을 추가했다.
- 다음 stable/public cluster 후보를 `recommend / action follow-through surface`로 고정하고, first cut은 broad implementation이 아니라 `recommend route-cluster candidate memo audit` 같은 docs-first narrowing round로 제한했다.
- `planning stable surface`, `상품 / 공공정보 / 탐색 surface`, `설정 / trust hub / 유지보수 surface`는 route 수, freshness/trust helper 밀도, support/ops 정책 오해 위험 때문에 이번 라운드에서는 보류한다고 명시했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 selection 결과와 비범위 항목을 연결 메모로 반영했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-next-stable-public-route-cluster-candidate-selection-audit.md` — PASS

## 남은 리스크
- `recommend` cluster도 planning linkage helper와 compare/history follow-through가 얽혀 있어, 바로 구현 spike로 가면 범위가 빠르게 커질 수 있다.
- `planning stable surface`, `products/public-data`, `settings/trust hub`는 이번 라운드에 보류했지만, 실제 reopen 시에는 각 cluster 내부에서 다시 더 작은 host surface로 쪼개는 docs-first audit이 필요하다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
