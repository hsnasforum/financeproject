# 2026-03-24 recommend route-cluster candidate memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-recommend-route-cluster-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only candidate audit 라운드에 맞춰 `git diff --check`만 실행했다.
- `route-ssot-check`: `/recommend`와 `/recommend/history`가 `docs/current-screens.md`의 `Public Stable` inventory와 충돌 없이 남아 있는지 다시 확인했다.
- `work-log-closeout`: recommend cluster selection 결과와 보류 범위, 남은 리스크를 `/work` 종료 기록으로 남겼다.

## 변경 이유
- `/dashboard`와 `/feedback` cluster가 사실상 닫힌 현재 상태에서, 다음 stable/public route-cluster 후보로 고른 `recommend / action follow-through surface`를 host/history 경계 기준으로 더 좁힐 필요가 있었다.
- `/recommend` host surface는 planning linkage, data freshness, compare/save/export가 함께 얽혀 있어 범위가 쉽게 커지므로, 더 작은 첫 후보를 문서 기준으로 먼저 잠가야 했다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 recommend route-cluster role map, smallest viable next candidate, defer-for-now 목록, next cut recommendation을 추가했다.
- `/recommend`는 current-condition comparison host surface, `/recommend/history`는 saved-run history/follow-through surface라는 역할 경계를 고정했다.
- cluster 안의 smallest viable next candidate를 `/recommend/history` docs-first candidate memo audit으로 좁히고, `/recommend` host surface는 planning linkage/store flow 얽힘 때문에 일단 보류한다고 명시했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 selection 결과와 비범위 항목을 연결 메모로 반영했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-route-cluster-candidate-memo-audit.md` — PASS

## 남은 리스크
- `/recommend/history`도 compare diff semantics, planning report deep-link, raw identifier helper가 얽혀 있어, 바로 구현 spike로 가면 범위가 커질 수 있다.
- `/recommend` host surface는 planning linkage/store flow, data freshness policy, compare/save/export semantics를 함께 건드리기 쉬워 이번 라운드에서 계속 보류했다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
