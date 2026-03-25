# 2026-03-23 N5 dashboard action-candidate copy-helper polish spike

## 변경 파일
- `src/components/DashboardClient.tsx`
- `work/3/23/2026-03-23-n5-dashboard-action-candidate-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `플랜 액션과 비교 후보` block의 copy-only 변경이라 `pnpm lint`, `pnpm build`, `git diff --check -- ...`만 실행했다.
- `work-log-closeout`: 실제 수정 범위, 실행 검증, 남은 리스크를 `/work` 표준 형식으로 정리했다.

## 변경 이유
- `/dashboard`의 `플랜 액션과 비교 후보` block에서 block-level action과 action card follow-through, fallback helper의 위계를 문구만으로 더 분명하게 보여 줄 필요가 있었다.

## 핵심 변경
- section description을 `저장된 액션을 다시 확인하고, 후보 비교는 허브에서 이어서 살펴봅니다.`로 바꿔 header action과 block 목적을 더 분명히 했다.
- action card CTA를 `Explore ▶`에서 `액션 이어보기 →`로 조정해 header `Action Hub →` / `Pick Hub →`와 구분되는 card-level follow-through tone을 만들었다.
- empty-state helper를 `먼저 플랜을 저장하면 이곳에서 저장된 액션을 다시 보고, 필요하면 추천 허브에서 직접 비교를 이어갈 수 있습니다.`로 바꿔 fallback helper 성격을 더 또렷하게 했다.
- header action 위치, href, candidate card 구조, card 순서, block 순서, hero/최근 플랜/바로 이동 section은 바꾸지 않았다.

## 검증
- 실행:
  - `pnpm lint`
  - `pnpm build`
  - `git diff --check -- src/components/DashboardClient.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-dashboard-action-candidate-copy-helper-polish-spike.md`
- 미실행:
  - `pnpm test`
  - `pnpm e2e:rc`
  - `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 `플랜 액션과 비교 후보` block 내부 copy/helper만 다뤘으므로, 후속 구현에서 action hub header 위계나 candidate card CTA를 같이 건드리면 dashboard IA 재정렬로 범위가 커질 수 있다.
- `액션 이어보기 →`와 header action의 위계는 현재 시각 스타일에도 일부 의존하므로, 이후 layout을 건드리지 않고 문구만으로 해결 가능한 범위를 넘는지 별도 라운드에서 다시 확인해야 한다.
