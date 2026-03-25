# 2026-03-23 feedback history-surface post-spike doc sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/23/2026-03-23-n5-feedback-history-surface-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only sync 라운드에 맞춰 `git diff --check`만 실행하는 최소 검증 세트를 유지했다.
- `route-ssot-check`: `/feedback/list`가 `docs/current-screens.md`의 `Public Stable` route이고 이번 라운드에서 route contract 변경이 없음을 다시 확인했다.
- `work-log-closeout`: landed 상태와 미실행 검증을 저장소 표준 형식의 `/work` note로 남겼다.

## 변경 이유
- `/feedback/list` history-surface copy/helper polish가 이미 landing했는데 backlog 문서는 아직 future candidate처럼 읽힐 여지가 있었다.
- landed 범위와 유지된 경계를 문서에 고정하고, 다음 smallest candidate를 broad flow 재설계가 아닌 `/feedback/[id]` detail read-through memo로 좁힐 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 `/feedback/list` history-surface post-spike sync memo를 추가했다.
- 실제 landed 범위를 `PageHeader` description, empty-state description/action label tone, detail follow-through helper, mobile/desktop CTA tone으로 고정했다.
- href destination, filter/search control 배치, row/card 순서, 표시 개수, `/feedback/[id]` detail contract가 그대로 유지됐다는 점을 명시했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에도 같은 상태를 연결 메모로 반영하고, next smallest candidate를 `/feedback/[id]` detail read-through docs-first candidate memo로 좁혔다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-feedback-history-surface-post-spike-doc-sync.md` — PASS

## 남은 리스크
- `/feedback/[id]` 후속 후보가 detail flow, 상태 메모, 공유/진단 보조 정보까지 한 번에 손보는 배치로 커지면 `N5` small-batch 범위를 넘을 수 있다.
- history landed 상태도 계속 href destination, filter/search control 배치, row/card 순서, 표시 개수, `/feedback/[id]` detail contract를 건드리지 않는 경계 안에서만 해석해야 한다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
