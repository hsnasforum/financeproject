# 2026-03-23 N5 dashboard hero CTA copy-helper polish spike

## 변경 파일
- `src/components/DashboardClient.tsx`
- `work/3/23/2026-03-23-n5-dashboard-hero-cta-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/dashboard` hero copy-only 변경에 맞춰 `pnpm lint`, `pnpm build`, `git diff --check -- ...`만 실행했다.
- `route-ssot-check`: hero CTA destination과 route class를 유지하는지 확인하고 문구만 조정했다.
- `work-log-closeout`: 이번 구현 범위, 실행 검증, 남은 리스크를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- `/dashboard` first batch에서 hero CTA hierarchy를 실제 문구로 더 또렷하게 보여 주되, block reorder나 IA 변경 없이 single-surface copy/helper polish로 닫아야 했다.

## 핵심 변경
- recent run이 있는 경우 hero title과 description을 `재무 상태 다시 보기`가 먼저 읽히도록 다듬고, 상품 비교는 필요 시 이어지는 분기 CTA로 설명했다.
- recent run이 없는 경우 hero title과 description을 `재무 상태 진단 시작`이 기본 출발점으로 읽히도록 정리하고, 추천 허브는 secondary branch로 남겼다.
- support CTA 성격을 더 분명히 하기 위해 `플랜 다시 계산` 버튼 문구를 `같은 조건으로 다시 계산`으로 조정했다.
- hero 하단 helper 문구를 recent-run 유무별로 다시 써서 primary CTA와 secondary branch의 역할을 더 자연스럽게 구분했다.
- `최근 플랜`, `플랜 액션과 비교 후보`, `바로 이동` 블록의 순서와 카드 구조, hero CTA href는 바꾸지 않았다.

## 검증
- 실행:
  - `pnpm lint`
  - `pnpm build`
  - `git diff --check -- src/components/DashboardClient.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-dashboard-hero-cta-copy-helper-polish-spike.md`
- 미실행:
  - `pnpm test`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 hero copy/helper polish만 다뤘으므로, `최근 플랜`, `플랜 액션과 비교 후보`, `바로 이동` 블록의 배치나 상대 우선순위를 같이 바꾸기 시작하면 `N5` small-batch 범위를 벗어날 수 있다.
- `조건에 맞는 상품 비교`와 `같은 조건으로 다시 계산`의 시각적 위계는 현재 버튼 스타일에 계속 의존하므로, 이후 layout 조정 없이 문구만으로 해결 가능한 범위를 넘는지 추가 구현 라운드에서 다시 확인해야 한다.
