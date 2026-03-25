# 2026-03-23 feedback history-surface copy-helper polish spike

## 변경 파일
- `src/components/FeedbackListClient.tsx`
- `work/3/23/2026-03-23-n5-feedback-history-surface-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: history-surface 단일 컴포넌트 수정에 맞춰 `pnpm lint`, `pnpm build`, `git diff --check`만 실행했다.
- `route-ssot-check`: `/feedback/list`가 `docs/current-screens.md`의 `Public Stable` 실존 route이고 이번 라운드에서 href/route contract 변경이 없음을 먼저 확인했다.
- `work-log-closeout`: 실행한 검증과 남은 리스크를 저장소 표준 형식의 `/work` note로 남겼다.

## 변경 이유
- `/feedback/list`의 primary 목적이 새 접수 시작이 아니라 기존 기록 재확인이라는 점을 copy/helper만으로 더 또렷하게 보여줄 필요가 있었다.
- header description, empty state, detail follow-through helper, row/card CTA tone을 다듬지 않으면 `새 의견 남기기`와 detail follow-through가 같은 층위로 오해될 여지가 있었다.

## 핵심 변경
- `PageHeader` description을 저장된 의견과 질문을 다시 열어 접수 상태와 다음 확인 포인트를 이어서 보는 history surface 톤으로 다듬었다.
- empty state description과 action label을 history fallback 관점으로 정리해, 먼저 기록을 남기고 이후 이 목록으로 돌아오는 흐름이 더 쉽게 읽히게 했다.
- `상세 화면에서는 ... 이어서 다시 볼 수 있습니다.` helper로 detail read-through 기대치를 더 명확하게 적었다.
- mobile card helper와 mobile/desktop CTA를 `상세 기록 보기 →` 톤으로 맞춰 detail follow-through를 더 또렷하게 했다.
- href, filter/search control 배치, row/card 순서, 표시 개수, `/feedback/[id]` detail contract는 바꾸지 않았다.

## 검증
- `pnpm lint` — PASS (`0 errors`, 변경과 무관한 기존 warning 30건 유지)
- `pnpm build` — PASS
- `git diff --check -- src/components/FeedbackListClient.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-feedback-history-surface-copy-helper-polish-spike.md` — PASS

## 남은 리스크
- `새 의견 남기기`의 위계를 다시 올리거나 filter/search IA를 재배치하면 이번 copy/helper 범위를 넘어 history/entry 역할 재설계로 커질 수 있다.
- `/feedback/[id]` detail contract, row/card 순서, 표시 개수, route 흐름까지 함께 바꾸면 `N5` small-batch 범위를 넘는다.
- 미실행 검증: `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
