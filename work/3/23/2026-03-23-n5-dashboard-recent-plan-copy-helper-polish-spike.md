# 2026-03-23 N5 dashboard recent-plan copy-helper polish spike

## 변경 파일
- `src/components/DashboardClient.tsx`
- `work/3/23/2026-03-23-n5-dashboard-recent-plan-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `최근 플랜` block의 copy-only 변경이라 `pnpm lint`, `pnpm build`, `git diff --check -- ...`만 실행했다.
- `work-log-closeout`: 실제 수정 범위, 실행 검증, 남은 리스크를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- `/dashboard` hero 다음 smallest candidate로 잠근 `최근 플랜` block에서, primary follow-through와 support action 위계를 문구만으로 더 분명하게 보여 줄 필요가 있었다.

## 핵심 변경
- `최근 플랜` section description을 `저장된 실행 결과를 먼저 다시 열고, 필요하면 같은 조건으로 다시 계산합니다.`로 바꿔 `Report →` 우선 흐름을 드러냈다.
- empty-state helper를 `플래닝을 한 번 저장하면 이곳에서 먼저 리포트를 다시 열고, 필요하면 같은 조건으로 다시 계산할 수 있습니다.`로 바꿔 first-time entry CTA가 아니라 저장 후 follow-through 안내로 읽히게 했다.
- card footer CTA를 `리포트 다시 보기 →`와 `같은 조건으로 다시 계산`으로 다듬어 primary follow-through와 secondary support action의 tone을 더 또렷하게 만들었다.
- `View All →` header action, card 순서, block 순서, metrics/summary 구조, hero와 다른 section은 바꾸지 않았다.

## 검증
- 실행:
  - `pnpm lint`
  - `pnpm build`
  - `git diff --check -- src/components/DashboardClient.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-dashboard-recent-plan-copy-helper-polish-spike.md`
- 미실행:
  - `pnpm test`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 `최근 플랜` block 내부 copy/helper만 다뤘으므로, 후속 구현에서 card order나 header action 위계까지 바꾸기 시작하면 dashboard IA 재정렬로 범위가 커질 수 있다.
- `리포트 다시 보기 →`와 `같은 조건으로 다시 계산`의 위계는 현재 시각 스타일에도 일부 의존하므로, 이후 layout을 건드리지 않고 문구만으로 해결 가능한 범위를 넘는지 별도 라운드에서 다시 확인해야 한다.
