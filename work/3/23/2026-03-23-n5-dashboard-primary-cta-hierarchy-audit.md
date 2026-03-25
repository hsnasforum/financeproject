# 2026-03-23 N5 dashboard primary CTA hierarchy audit

## 변경 파일
- `analysis_docs/v2/16_public_stable_ux_polish_backlog.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/23/2026-03-23-n5-dashboard-primary-cta-hierarchy-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only 라운드라 `git diff --check -- ...`만 최소 검증으로 유지했다.
- `route-ssot-check`: `docs/current-screens.md`, `src/app/dashboard/page.tsx`, `src/components/DashboardClient.tsx`를 대조해 `/dashboard`의 current stable IA 역할과 CTA 층위를 확인했다.
- `work-log-closeout`: 이번 audit 결론, 검증, 남은 리스크를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- `/dashboard` single-surface first batch 안에서도 실제로 어떤 CTA 층위부터 건드려야 가장 작은 polish cut이 되는지 먼저 잠가야 했다.

## 핵심 변경
- `analysis_docs/v2/16...`의 `4.1 시작점 / 진입 surface`에 `dashboard CTA hierarchy audit memo`를 추가해 hero CTA 묶음을 primary layer, `최근 플랜`과 `플랜 액션과 비교 후보`를 follow-through/support layer, `바로 이동`을 tertiary quick-link layer로 정리했다.
- recent run이 있는 경우 hero의 `재무 상태 다시 보기`를 primary next action, `조건에 맞는 상품 비교`를 parallel branch CTA, `플랜 다시 계산`과 `새로고침`을 support control로 읽는 current boundary를 문서화했다.
- recent run이 없는 경우 hero의 `재무 상태 진단 시작`을 primary CTA, `조건에 맞는 상품 비교`를 secondary branch CTA, `새로고침`을 support control로 읽는다고 남겼다.
- first implementation target은 `/dashboard` hero CTA hierarchy copy/helper polish으로 좁혔다. hero title/description/button/helper 문구에서 primary/secondary/support 구분을 더 또렷하게 만드는 정도만 다음 구현 후보로 두었다.
- `analysis_docs/v2/11...` backlog 메모를 같은 상태로 동기화해 next `N5` cut이 열리더라도 card reorder, action hub 재배치, quick-link block 재구성 같은 broad dashboard overhaul보다 hero CTA hierarchy cut이 더 작은 후속 배치라고 남겼다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-dashboard-primary-cta-hierarchy-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 CTA hierarchy boundary만 잠갔으므로, 실제 구현이 `최근 플랜`, `플랜 액션과 비교 후보`, `바로 이동` 블록의 배치나 우선순위를 함께 바꾸기 시작하면 `N5` small-batch 범위를 쉽게 넘어설 수 있다.
- `추천 허브`, `리포트`, `플래닝`, `다시 계산` 사이의 canonical entry를 새로 정의하거나 block 순서를 바꾸는 일은 여전히 stable IA 재편에 가까워 별도 범위로 분리해야 한다.
