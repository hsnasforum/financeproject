# 2026-03-19 N5 recommend why/helper polish

## 변경 파일

- `src/app/recommend/page.tsx`
- `src/components/RecommendHistoryClient.tsx`
- `work/3/19/2026-03-19-n5-recommend-why-helper-polish.md`

## 사용 skill

- `finance-skill-routing`: 이번 배치를 `N5 recommend / action follow-through surface`의 copy/helper polish로 한정하고, route SSOT나 beta exposure 범위로 번지지 않게 유지하는 데 사용
- `planning-gate-selector`: public stable TSX 문구 조정 범위에 맞춰 `pnpm lint`, `pnpm build` 중심의 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `/recommend`와 `/recommend/history`의 상단 문구와 CTA가 추천을 확정 답안처럼 읽히게 하는 표현을 일부 포함하고 있었다.
- `N5` 문서 기준으로 이번 배치는 stable/public surface의 why/helper/trust cue/CTA 위계만 작은 범위에서 다듬어야 했다.
- 추천 로직이나 score를 바꾸지 않고, 현재 조건 기준 비교/참고 톤과 planning 연계 helper를 더 쉽게 읽히게 정리할 필요가 있었다.

## 핵심 변경

- `/recommend` 헤더와 상단 helper를 `현재 조건 기준 비교` 톤으로 바꾸고, 데이터 신뢰 링크 앞에 "확정 답안이 아니라 비교/확인 단계"라는 안내를 추가했다.
- 추천 실행 CTA를 `추천 시작하기`에서 `비교 후보 보기`로 조정하고, 결과/빈 상태/로딩 안내도 같은 의미 체계로 맞췄다.
- 플래닝 연동 strip과 카드별 action reason helper 문구를 `플래닝 결과를 참고해 비교 후보를 읽는 흐름`으로 정리했다.
- 추천 카드의 기본 섹션 제목을 `추천 사유` 대신 `비교 근거`로 바꿔 확정 표현을 줄였다.
- `/recommend/history` 헤더, 저장 기록 안내, 실행 상세, 비교 CTA를 `저장된 실행 비교`와 `플래닝 근거 재확인` 중심 문구로 정리했다.

## 검증

- `git diff --check -- src/app/recommend/page.tsx src/components/RecommendHistoryClient.tsx`
- `pnpm lint`
  - 에러 없이 통과
  - 기존 unrelated warning 33건은 그대로 남아 있음
- `pnpm build`
- 미실행 검증
  - `pnpm e2e:rc` (`selector`나 route 구조를 바꾸지 않아 이번 라운드에서는 생략)

## 남은 리스크

- 이번 라운드는 copy/helper/CTA 조정만 수행했기 때문에, 실제 사용자가 새 문구를 더 쉽게 이해하는지는 별도 사용성 확인이 더 필요할 수 있다.
- `recommend/history`는 여전히 run ID와 planning run ID를 함께 보여주므로, 이후 배치에서 필요하면 raw 식별자 노출 수준을 다시 검토할 수 있다.
- 워크트리에는 이번 범위 밖의 기존 modified/untracked 파일이 계속 남아 있으므로, 후속 commit 시 포함 범위를 엄격히 확인해야 한다.
