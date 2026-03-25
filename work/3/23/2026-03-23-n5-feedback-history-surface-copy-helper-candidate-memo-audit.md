# 2026-03-23 feedback history-surface copy-helper candidate memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/23/2026-03-23-n5-feedback-history-surface-copy-helper-candidate-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드에 맞춰 `git diff --check`만 실행하는 최소 검증 세트를 유지했다.
- `route-ssot-check`: `/feedback/list`가 `docs/current-screens.md`의 `Public Stable` 실존 route이고 이번 라운드에서 route contract 변경이 없음을 먼저 확인했다.
- `work-log-closeout`: `/work` 종료 기록을 표준 형식으로 남겼다.

## 변경 이유
- `/feedback` entry-surface spike 이후 feedback cluster 안의 다음 smallest candidate를 broad flow 재설계가 아니라 `/feedback/list` history surface copy/helper 범위로 더 좁힐 필요가 있었다.
- list-level action, empty state, detail follow-through helper를 문서 기준으로 잠가 두지 않으면 filter/search IA나 detail flow까지 한 배치로 커질 위험이 있었다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `/feedback/list` history-surface role map과 first implementation candidate를 추가했다.
- `/feedback/list`를 support history surface로, `새 의견 남기기`를 list-level 보조 action으로, `기록 보기 ▶`를 detail read-through follow-through로 읽는 경계를 문서화했다.
- smallest safe next implementation cut을 broad feedback flow 재설계가 아니라 `/feedback/list` history-surface copy/helper polish spike로 좁혔다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 상태를 연결 메모로 반영했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-feedback-history-surface-copy-helper-candidate-memo-audit.md` — PASS

## 남은 리스크
- filter/search IA를 재배치하거나 `새 의견 남기기`를 history surface의 primary CTA처럼 재격상하면 copy/helper 범위를 넘어 history/entry 역할 재설계로 커질 수 있다.
- `/feedback/[id]` detail contract나 `/feedback` entry 역할을 함께 손보면 `N5` small-batch 범위를 넘는다.
- 미실행 검증: `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
