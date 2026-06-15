# 2026-05-30 News trends table React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx`
- `work/5/30/2026-05-30-news-trends-table-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: planning v3 news 흐름 보기 route-local client 변경의 최소 검증 세트를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 실행한 검증과 남은 React Compiler 후보를 `/work/5/30` 마감 기록으로 남기기 위해 사용했습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 기준에서 `NewsTrendsTableClient`가 mount effect 안에서 `load(windowDays)`를 호출하고, `load`가 즉시 `setLoading`/`setErrorMessage`를 실행해 경고 1건을 만들고 있었습니다.
- `/planning/v3/news/trends` 경로는 단일 `/api/planning/v3/news/trends` GET과 기간 토글 중심이라, 남은 news route-local client 중 좁은 범위로 경고를 줄이기 적합했습니다.

## 핵심 변경
- `load`를 fetch 전용 함수로 바꾸고 effect에서는 비동기 응답 이후에만 `data`, `windowDays`, `errorMessage`, `loading`을 commit하도록 분리했습니다.
- effect cleanup에 `AbortController`와 active guard를 추가해 기간 전환 또는 unmount 뒤 stale 응답 commit을 막았습니다.
- 기간 토글은 `selectWindowDays`에서 사용자 이벤트로 `loading`/`errorMessage`를 갱신해 기존 로딩 피드백을 유지했습니다.
- API 응답의 `windowDays`는 `7 | 30` 타입으로 명시해 Next build 타입 체크 실패를 고쳤습니다.
- 전체 one-off 스캔 결과가 50 warnings / 43 files에서 49 warnings / 42 files로 감소했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` — 변경 전 경고 1건 확인
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx --rule react-hooks/set-state-in-effect:error` — PASS
- `corepack pnpm exec vitest run tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts` — PASS, 2 files / 15 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-news-trends-table-client.json` — PASS
- `rg -o 'react-hooks/set-state-in-effect' tmp/eslint-react-hooks-set-state-after-news-trends-table-client.json | wc -l` — PASS, `49`
- `rg -o 'warningCount.:[1-9][0-9]*' tmp/eslint-react-hooks-set-state-after-news-trends-table-client.json | wc -l` — PASS, `42`
- `git diff --check -- src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx` — PASS
- `corepack pnpm lint` — PASS
- `corepack pnpm test` — PASS, 663 files / 2035 tests
- `corepack pnpm build` — 1차 FAIL, `next.windowDays`가 `number`로 추론되어 `7 | 30` state setter에 전달되지 못했습니다.
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx --rule react-hooks/set-state-in-effect:error` — 타입 보정 후 PASS
- `corepack pnpm lint` — 타입 보정 후 PASS
- `corepack pnpm build` — 타입 보정 후 PASS
- `corepack pnpm test` — 타입 보정 후 PASS, 663 files / 2035 tests
- `corepack pnpm multi-agent:guard` — PASS, `latestWorkNote=work/5/30/2026-05-30-news-trends-table-react-compiler.md`
- `git diff --check` — PASS

## 남은 리스크
- [사실] `NewsDigestClient`, `NewsExploreClient`, `NewsTodayClient`, `WeeklyPlanPanel`, `useNewsSettingsController`의 `react-hooks/set-state-in-effect` 경고는 아직 남아 있습니다.
- [사실] 이번 변경은 `/planning/v3/news/trends` 클라이언트의 로딩 경계만 바꾸었고 API route나 데이터 저장 계약은 수정하지 않았습니다.
- [미확인] 원격 GitHub Actions는 아직 이번 head 기준으로 재확인하지 않았습니다.

## 다음 라운드 우선순위
- `NewsExploreClient`를 다음 대상으로 잡고 `/api/planning/v3/news/search` 단일 fetch 경계의 effect/state commit 분리를 검토합니다.
- 그다음 `NewsDigestClient`, `NewsTodayClient`, `WeeklyPlanPanel`, `useNewsSettingsController` 순서로 fetch fan-out과 공유 범위를 다시 비교합니다.
- 동일하게 target ESLint, 해당 news API 테스트, one-off 스캔, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm multi-agent:guard`를 실행합니다.
