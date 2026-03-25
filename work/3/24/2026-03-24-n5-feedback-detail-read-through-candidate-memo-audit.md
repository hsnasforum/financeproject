# 2026-03-24 feedback detail read-through candidate memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/24/2026-03-24-n5-feedback-detail-read-through-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드에 맞춰 `git diff --check`만 실행하는 최소 검증 세트를 유지했다.
- `route-ssot-check`: `/feedback/[id]`가 `docs/current-screens.md`의 `Public Stable` 실존 route이고 이번 라운드에서 route contract 변경이 없음을 먼저 확인했다.
- `work-log-closeout`: `/work` 종료 기록을 표준 형식으로 남겼다.

## 변경 이유
- `/feedback/list` history-surface post-spike 이후 feedback cluster 안의 다음 smallest candidate를 broad detail flow 재설계가 아니라 `/feedback/[id]` detail read-through copy/helper 범위로 더 좁힐 필요가 있었다.
- detail 화면에는 사용자용 read-through 안내, support/export helper, dev-only recovery helper가 함께 있어 문서 기준 경계가 없으면 후속 구현이 쉽게 ops/debug 정책 조정까지 커질 수 있었다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `/feedback/[id]` detail read-through role map과 first implementation candidate를 추가했다.
- `피드백 상세`, `내역`/`새 의견` 보조 이동, `이 화면에서 먼저 보는 정보`, `공유·지원용 보조 정보`, `공유·지원용 내보내기`, `개발용 복구 액션`의 층위를 분리해 문서화했다.
- smallest safe next implementation cut을 broad feedback flow 재설계가 아니라 `/feedback/[id]` detail read-through copy/helper polish spike로 좁혔다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 상태를 연결 메모로 반영했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-feedback-detail-read-through-candidate-memo-audit.md` — PASS

## 남은 리스크
- 상태/우선순위/체크리스트 편집 흐름, export/issue template semantics, dev recovery action 정책까지 함께 손보면 `N5` small-batch 범위를 넘어 detail flow 재설계로 커질 수 있다.
- `내역`/`새 의견`의 canonical 관계를 바꾸거나 `/feedback` cluster route 흐름을 수정하는 일도 계속 별도 범위로 분리해야 한다.
- 미실행 검증: `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
