# 2026-03-25 planning-v3 news alerts header contrast fix

## 변경 파일
- `src/app/planning/v3/news/_components/NewsNavigation.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`

## 사용 skill
- `planning-gate-selector`: 뉴스 화면 상단 UI 수정에 맞는 최소 검증 세트를 고르기 위해 사용.
- `work-log-closeout`: 실제 변경 내용과 실행한 검증만 `/work` 형식으로 남기기 위해 사용.

## 변경 이유
- `/planning/v3/news/alerts` 상단 메뉴와 빠른 필터가 밝은 hero 카드 위에서 흰 글자로 렌더되어 가독성이 깨졌다.
- 공용 뉴스 이동 탭과 알림 화면 상단 필터가 어두운 hero 전용 톤을 그대로 써, 실제 배경과 스타일 계약이 어긋나 있었다.

## 핵심 변경
- [변경 전 메모] 수정 대상 파일: `src/app/planning/v3/news/_components/NewsNavigation.tsx`, `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- [변경 전 메모] 변경 이유: 뉴스 alerts 상단 탭과 빠른 필터가 흰 배경 위에서 보이지 않음
- [변경 전 메모] 실행할 검증 명령: `pnpm build`
- `NewsNavigation`의 `SegmentedTabs`를 `dark` 톤에서 `light` 톤으로 전환하고, 밝은 surface border/shadow를 추가해 `오늘 브리핑`, `중요 알림`, `흐름 보기`, `뉴스 탐색`, `설정` 탭이 공통으로 읽히게 조정했다.
- `NewsAlertsClient`에서 기간 토글과 빠른 필터 칩을 알림 화면 전용 밝은 스타일 helper로 분리해 `표시중`, `미확인`, `확인 완료`, `숨김`, `중요`, `전체 출처`가 모두 slate 기반 텍스트 대비를 갖도록 바꿨다.
- 빠른 필터 라벨과 구분선도 흰색 계열에서 slate 계열로 바꿔 상단 제어 묶음 전체가 같은 밝은 카드 문맥으로 읽히게 맞췄다.

## 검증
- `git diff --check -- src/app/planning/v3/news/_components/NewsNavigation.tsx src/app/planning/v3/news/_components/NewsAlertsClient.tsx` — 통과
- `pnpm build` — 통과
- [미실행] `pnpm e2e:rc` — selector, route, data contract는 바꾸지 않았고 이번 라운드는 상단 대비/스타일 수정에 한정해 제외했다.

## 남은 리스크
- `알림 설정` 액션 링크는 기존 `reportHeroActionLinkClassName`을 그대로 사용한다. 사용자가 같은 영역의 추가 대비 문제를 다시 보고하면 이 링크도 밝은 surface용 variant로 분리할 필요가 있다.
- 다른 news 화면에도 dark hero용 공용 tone이 남아 있을 수 있다. 이번 라운드는 사용자 제보가 들어온 `/planning/v3/news/alerts`와 공통 navigation만 최소 수정했다.
