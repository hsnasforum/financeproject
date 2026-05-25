# 2026-05-25 뉴스/DART 상태 UI 정리

## 변경 파일
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`
- `src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx`
- `src/components/OpenDartStatusCard.tsx`
- `tests/news-search-index.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`
- `docs/dart-rules-quality-report.md`

## 사용 skill
- `dart-data-source-hardening`: DART/뉴스 상태 표시와 갱신 경로의 실패 처리 영향 확인
- `planning-gate-selector`: 변경 범위에 맞는 focused lint, 테스트, build 검증 선정
- `work-log-closeout`: 라운드 종료 기록 작성

## 변경 이유
- 뉴스 v3 클라이언트의 미사용 상태, import, 계산값을 제거해 lint 부채를 줄였습니다.
- 뉴스 검색 인덱스 테스트의 기준 시각을 고정해 날짜 기반 결과가 실행일에 흔들리지 않게 했습니다.
- DART 상태 카드의 색상 토큰을 의미 기반 `success`/`danger` 토큰으로 맞췄습니다.
- `/api/planning/v3/news/refresh`는 같은 출처 성공 probe가 실제 뉴스 갱신을 실행하므로, write-route guard의 런타임 성공 probe만 건너뛰고 정적 경로 가드와 원격 host 차단 검증은 유지했습니다.

## 검증
- `git diff --check -- src/app/planning/v3/news/_components tests/news-search-index.test.ts src/components/OpenDartStatusCard.tsx docs/dart-rules-quality-report.md tests/planning-v3-write-route-guards.test.ts` PASS
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsAlertsClient.tsx src/app/planning/v3/news/_components/NewsDigestClient.tsx src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/NewsTodayClient.tsx src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx src/components/OpenDartStatusCard.tsx tests/news-search-index.test.ts tests/planning-v3-write-route-guards.test.ts` PASS
- `corepack pnpm test tests/news-search-index.test.ts tests/planning-v3-write-route-guards.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts tests/planning-v3-news-search-api.test.ts` PASS, 5 files / 25 tests
- `corepack pnpm build` PASS

## 남은 리스크
- 뉴스 갱신의 실제 외부 데이터 freshness나 upstream 장애 대응 로직은 이번 변경에서 바꾸지 않았습니다.
- `docs/dart-rules-quality-report.md`는 생성 시각만 갱신된 산출물입니다.
