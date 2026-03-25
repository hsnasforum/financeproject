# 2026-03-24 n5-recommend-history-follow-through-copy-helper-polish-spike

## 변경 파일
- `src/components/RecommendHistoryClient.tsx`
- `work/3/24/2026-03-24-n5-recommend-history-follow-through-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: `/recommend/history` copy/helper polish에 필요한 최소 검증 세트를 선택했다.
- `route-ssot-check`: route contract와 `Public Stable` inventory를 바꾸지 않는 범위인지 확인했다.
- `work-log-closeout`: 이번 라운드 구현 범위와 검증 결과를 `/work`에 정리했다.

## 변경 이유
- `/recommend/history`는 새 추천 시작 화면이 아니라 저장한 추천 결과를 다시 읽고 필요한 follow-through로 이어 가는 history surface다.
- current 문구는 새 비교 시작, 플래닝 근거 확인, raw 식별자 확인의 층위가 한 번에 읽혀 support/helper 위계가 흐려질 여지가 있었다.
- compare/store semantics, planning deep-link contract, raw identifier semantics는 그대로 둔 채 copy/helper만 더 또렷하게 정리하는 것이 이번 최소 범위였다.

## 핵심 변경
- `PageHeader` description을 저장 기록 재읽기 중심으로 바꿔 `/recommend` 이동이 list-level 보조 action으로 읽히게 정리했다.
- empty state 문구를 “먼저 저장한 뒤 이 화면에서 다시 읽고 비교한다”는 흐름으로 좁혔다.
- active run helper 문구를 “저장 기록 재읽기 후 필요할 때만 새 비교/플래닝 근거 확인으로 이어 간다”는 톤으로 맞췄다.
- `공유·복구용 보조 정보` 안내를 raw 식별자가 support/recovery 대응 시에만 필요한 보조 정보라는 점이 더 또렷하게 보이도록 다듬었다.
- `href`, compare/store 동작, `상위 N개 비교 후보 담기`, `저장 당시 플래닝 보기`, row 순서, `/recommend` host surface는 바꾸지 않았다.

## 검증
- 실행: `pnpm lint`
  - PASS. 변경과 무관한 기존 warning 30건이 남아 있다.
- 실행: `pnpm build`
  - PASS.
- 실행: `git diff --check -- src/components/RecommendHistoryClient.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-recommend-history-follow-through-copy-helper-polish-spike.md`

## 남은 리스크
- current 위계는 여전히 현재 layout과 버튼 스타일에도 일부 의존한다.
- 이후 라운드에서 compare/store semantics, planning deep-link contract, raw identifier/helper policy까지 함께 건드리면 이번 small-batch 범위를 넘어 recommend flow 재설계로 커질 수 있다.
- 미실행 검증: `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
