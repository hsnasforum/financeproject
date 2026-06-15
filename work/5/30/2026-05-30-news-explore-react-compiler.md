# 2026-05-30 News explore React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `work/5/30/2026-05-30-news-explore-react-hooks-plan.md`
- `work/5/30/2026-05-30-news-explore-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: planning v3 news 탐색 route-local client 변경의 검증 범위를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 실행한 검증, 실패/재시도, 남은 React Compiler 후보를 `/work/5/30` 마감 기록으로 남기기 위해 사용했습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 기준에서 `NewsExploreClient`가 effect 안에서 `load(applied)`를 호출하고, `load`가 즉시 `setLoading`/`setErrorMessage`와 fetch 결과 commit을 함께 처리해 경고 1건을 만들고 있었습니다.
- `/planning/v3/news/explore`는 `/api/planning/v3/news/search` 단일 검색 fetch와 필터 제출/초기화 흐름이 중심이라, fetch 함수와 effect의 state commit 경계를 분리하면 사용자 흐름 변경 없이 경고를 줄일 수 있었습니다.

## 핵심 변경
- `load`를 fetch 전용 함수로 바꾸고 응답 payload를 반환하도록 정리했습니다.
- effect는 `AbortController`, active flag, request sequence guard로 stale 응답을 막고, 비동기 응답 이후에만 items/topics/sources/total/freshness/error/loading을 commit합니다.
- 필터 적용은 `applyFilters`로 모아 사용자 이벤트에서 `loading`과 `errorMessage`를 먼저 갱신하고 `applied`를 바꾸도록 유지했습니다.
- 전체 one-off 스캔 결과가 49 warnings / 42 files에서 48 warnings / 41 files로 감소했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsExploreClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` — 변경 전 경고 1건 확인
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsExploreClient.tsx --rule react-hooks/set-state-in-effect:error` — PASS
- `corepack pnpm exec vitest run tests/planning-v3-news-search-api.test.ts` — PASS, 1 file / 3 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-news-explore-client.json` — PASS
- `rg -o 'react-hooks/set-state-in-effect' tmp/eslint-react-hooks-set-state-after-news-explore-client.json | wc -l` — PASS, `48`
- `rg -o 'warningCount.:[1-9][0-9]*' tmp/eslint-react-hooks-set-state-after-news-explore-client.json | wc -l` — PASS, `41`
- `git diff --check -- src/app/planning/v3/news/_components/NewsExploreClient.tsx` — PASS
- `corepack pnpm lint` — PASS
- `corepack pnpm test` — PASS, 663 files / 2035 tests
- `corepack pnpm build` — 1차 미판정, 124초 timeout
- `corepack pnpm build` — 재실행 PASS
- `corepack pnpm multi-agent:guard` — FAIL, 최신 `/work` 문서가 계획 메모라 `다음 라운드` 섹션이 없었습니다.
- `git diff --check` — PASS
- `corepack pnpm multi-agent:guard` — 종료 기록 추가 후 PASS, `latestWorkNote=work/5/30/2026-05-30-news-explore-react-compiler.md`
- `git diff --check` — 종료 기록 추가 후 PASS

## 남은 리스크
- [사실] 이번 변경은 `/planning/v3/news/explore` 클라이언트의 fetch/effect 경계만 바꾸었고 API route, 검색 계약, freshness 계산 로직은 수정하지 않았습니다.
- [사실] `NewsDigestClient`, `NewsTodayClient`, `WeeklyPlanPanel`, `useNewsSettingsController`의 `react-hooks/set-state-in-effect` 경고는 아직 남아 있습니다.
- [미확인] 원격 GitHub Actions는 아직 이번 head 기준으로 재확인하지 않았습니다.

## 다음 라운드 우선순위
- `NewsDigestClient`를 다음 대상으로 보고 digest fetch fan-out과 effect 내부 state commit 경계를 먼저 확인합니다.
- 그다음 `NewsTodayClient`, `WeeklyPlanPanel`, `useNewsSettingsController` 순서로 route-local 범위와 공유 훅 범위를 비교합니다.
- 동일하게 target ESLint, 관련 news API 테스트, one-off 스캔, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm multi-agent:guard`를 실행합니다.
