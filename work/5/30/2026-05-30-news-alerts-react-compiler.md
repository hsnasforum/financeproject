# 2026-05-30 News alerts React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `work/5/27/2026-05-27-news-route-local-client-react-hooks-plan.md`
- `work/5/30/2026-05-30-news-alerts-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: planning v3 news 알림 route-local client 변경의 최소 검증 세트를 정하기 위해 사용했습니다.
- `work-log-closeout`: `/work/5/30` 마감 기록의 섹션, 실제 실행 명령, 남은 리스크를 정리하기 위해 사용했습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 기준에서 `NewsAlertsClient`가 mount effect 안에서 `load(days)`를 호출하고, `load`가 즉시 `setLoading`/`setErrorMessage`를 실행해 경고 1건을 만들고 있었습니다.
- planning v3 news route-local client의 잔여 경고를 한 번에 크게 바꾸기보다, 사용자 경로 `/planning/v3/news/alerts`의 API 계약과 fallback 문구를 유지하면서 경고 1건을 줄이는 최소 수정이 필요했습니다.

## 핵심 변경
- 알림 요약 정규화를 `toAlertSummary`로 분리해 GET/POST 응답 처리의 중복을 줄였습니다.
- `load`를 fetch 전용 함수로 바꾸고 effect에서는 비동기 응답 이후에만 route-local state를 commit하도록 분리했습니다.
- effect cleanup에 `AbortController`와 active guard를 추가해 날짜 전환 또는 unmount 후 stale 응답 commit을 막았습니다.
- 날짜 토글은 `selectDays`에서 사용자 이벤트로 `loading`/`errorMessage`를 갱신해 기존 로딩 피드백을 유지했습니다.
- 전체 one-off 스캔 결과가 51 warnings / 44 files에서 50 warnings / 43 files로 감소했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsAlertsClient.tsx --rule react-hooks/set-state-in-effect:error` — PASS
- `corepack pnpm exec vitest run tests/planning-v3-news-alerts-ui.test.tsx tests/planning-v3-news-alerts-api.test.ts tests/news-alerts.test.ts tests/planning-v3-write-route-guards.test.ts` — PASS, 4 files / 14 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-news-alerts-client.json` — PASS
- `rg -o 'react-hooks/set-state-in-effect' tmp/eslint-react-hooks-set-state-after-news-alerts-client.json | wc -l` — PASS, `50`
- `rg -o 'warningCount.:[1-9][0-9]*' tmp/eslint-react-hooks-set-state-after-news-alerts-client.json | wc -l` — PASS, `43`
- `corepack pnpm lint` — PASS
- `corepack pnpm test` — PASS, 663 files / 2035 tests
- `corepack pnpm build` — PASS
- `corepack pnpm multi-agent:guard` — 1차 FAIL, 최신 `/work`가 5/27 계획 문서라 다음 라운드 정보가 없다고 보고했습니다.
- `corepack pnpm multi-agent:guard` — 2차 PASS, `latestWorkNote=work/5/30/2026-05-30-news-alerts-react-compiler.md`
- `git diff --check` — PASS

## 남은 리스크
- [사실] `NewsDigestClient`, `NewsExploreClient`, `NewsTodayClient`, `NewsTrendsTableClient`, `WeeklyPlanPanel`, `useNewsSettingsController`의 `react-hooks/set-state-in-effect` 경고는 아직 남아 있습니다.
- [사실] 이번 변경은 `/planning/v3/news/alerts`의 클라이언트 로딩 경계만 바꾸었고 API route나 데이터 저장 계약은 수정하지 않았습니다.
- [미확인] 원격 GitHub Actions는 아직 이번 head 기준으로 재확인하지 않았습니다.

## 다음 라운드 우선순위
- `NewsDigestClient` 또는 `NewsExploreClient` 중 fetch fan-out이 더 좁은 route-local client 1건을 다음 대상으로 선택합니다.
- 선택한 파일에서 effect 호출 직후 동기 state commit을 fetch 단계와 분리합니다.
- 동일하게 target ESLint, 해당 route 테스트, one-off 스캔, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm multi-agent:guard`를 실행합니다.
