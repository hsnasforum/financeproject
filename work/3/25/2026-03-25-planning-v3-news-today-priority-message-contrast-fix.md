# 2026-03-25 planning-v3 news today priority message contrast fix

## 변경 파일
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`

## 사용 skill
- `planning-gate-selector`: `planning/v3/news` 사용자 화면의 단일 TSX 스타일 수정에 맞춰 `lint + build`를 최소 검증 세트로 고르기 위해 사용.
- `work-log-closeout`: 실제 변경 원인, 실행 검증, 미실행 검증, 남은 리스크를 오늘 `/work` 형식으로 정확히 남기기 위해 사용.

## 변경 이유
- `/planning/v3/news` 상단 priority 배너에 렌더되는 `상태가 unknown인 watch 항목부터 정리하는 편이 좋습니다.` 문구가 사용자 화면에서 거의 보이지 않았다.
- 확인 결과 문구 자체나 조건문은 정상이고, 밝은 emerald 배경 위에 `text-emerald-50`가 적용돼 대비가 너무 낮은 것이 원인이었다.
- route, 데이터, 조건 분기는 건드리지 않고 문구 가독성만 회복하는 최소 수정이 필요했다.

## 핵심 변경
- `NewsTodayClient` 상단 priority 배너의 문구 색상을 `text-emerald-50`에서 `text-emerald-950`로 올려 light emerald 배경 위에서도 읽히게 조정했다.
- `priorityMessage` 조건 분기, `unresolvedWatchCount` 계산, watchlist 상태 판정 로직은 변경하지 않았다.
- route, href, selector, API shape, 데이터 계약은 변경하지 않았다.
- 문제 문구 위치는 `planning/v3/news` hero 영역의 안내 배너로 유지된다.

## 검증
- `git diff --check -- src/app/planning/v3/news/_components/NewsTodayClient.tsx` — 통과
- `pnpm lint` — 통과 (`no-unused-vars` 기존 경고 25건 유지, 새 error 없음)
- `pnpm build` — 통과
- [미실행] `pnpm test` — 이번 라운드는 조건문/데이터가 아니라 단일 텍스트 대비 수정이라 별도 관련 UI 테스트 자산이 없어 제외했다.
- [미실행] `pnpm e2e:rc` — selector, href, flow hook를 바꾸지 않았고 실제 user flow 계약 변경이 없어 제외했다.

## 남은 리스크
- 이번 수정은 해당 배너 한 곳의 대비만 높였고, `planning/v3/news` 다른 카드들에도 비슷한 low-contrast 텍스트가 남아 있을 수 있다.
- `planning/v3` 전체 12px floor 적용 이후 dense badge/overline 대비가 약해진 다른 surface가 있으면 같은 방식의 후속 contrast 점검이 필요하다.
