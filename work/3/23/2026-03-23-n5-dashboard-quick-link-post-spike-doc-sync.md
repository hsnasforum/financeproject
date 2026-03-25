# 2026-03-23 dashboard quick-link post-spike doc sync

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `work/3/23/2026-03-23-n5-dashboard-quick-link-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only sync 라운드에 맞춰 `git diff --check`만 실행하는 최소 검증 세트를 유지했다.
- `work-log-closeout`: `/work` 종료 기록을 표준 형식으로 남겼다.

## 변경 이유
- `/dashboard`의 `바로 이동` copy/helper polish가 이미 landing한 상태인데, backlog 문서가 아직 future candidate처럼 읽힐 여지가 있었다.
- quick-link 이후 다음 smallest candidate를 broad dashboard overhaul이 아니라 `최근 피드백` docs-first memo 수준으로만 남길 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`에 quick-link polish landed 범위와 unchanged 범위를 반영했다.
- 다음 `/dashboard` smallest candidate를 `최근 피드백` block의 docs-first candidate memo로 갱신했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 연결 메모도 같은 상태로 동기화했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-dashboard-quick-link-post-spike-doc-sync.md` — PASS

## 남은 리스크
- `최근 피드백` 후속 후보가 card order나 block priority 변경으로 커지면 다시 broad dashboard overhaul로 번질 수 있다.
- quick-link landed 상태도 계속 href, shortcut 추가/삭제, 카드 순서, block 순서를 건드리지 않는 경계 안에서만 해석해야 한다.
- 미실행 검증: `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
