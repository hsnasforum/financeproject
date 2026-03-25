# 2026-03-23 N5 dashboard hero post-spike doc sync

## 변경 파일
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n5-dashboard-hero-post-spike-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only sync 라운드라 `git diff --check -- ...`만 최소 검증으로 유지했다.
- `work-log-closeout`: landed 범위, 미실행 검증, 다음 후보를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- `/dashboard` hero CTA copy/helper polish가 이미 landing한 뒤에도 backlog 문서가 아직 future candidate처럼 읽혀, 구현 완료 범위와 다음 smallest cut을 다시 맞춰야 했다.

## 핵심 변경
- `analysis_docs/v2/16...`에 `/dashboard` hero CTA copy/helper polish landed memo를 추가해 hero title, description, helper, support button copy가 이미 반영됐음을 적었다.
- 같은 문서에 hero 다음 smallest candidate를 `최근 플랜` follow-through copy/helper audit으로 좁히고, recent-run card reorder나 action hub 재배치는 여전히 비범위로 남겼다.
- `analysis_docs/v2/11...` backlog 연결 메모도 같은 상태로 동기화해 current next question이 hero CTA 구현 여부가 아니라 dashboard 후속 small batch 선정이라는 점을 분명히 했다.
- CTA destination, block order, card structure, stable IA/nav는 이번 sync에서 바뀌지 않았다고 명시했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-dashboard-hero-post-spike-doc-sync.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 post-spike 문서 동기화만 다뤘으므로, 이후 `최근 플랜` 후속 배치를 구현할 때 recent-run 카드 배치나 quick-link 우선순위까지 같이 바꾸면 다시 broad dashboard overhaul로 번질 수 있다.
- `최근 플랜` follow-through copy/helper audit도 hero hierarchy를 다시 흔들지 않도록 block 내부 helper 범위로만 좁혀야 한다.
