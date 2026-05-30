# 2026-05-30 NewsExploreClient react-hooks 경고 축소 계획

## 변경 파일
- `work/5/30/2026-05-30-news-explore-react-hooks-plan.md`

## 사용 skill
- `planning-gate-selector`: `NewsExploreClient`의 route-local client 변경에 맞는 최소 검증 세트를 고르기 위해 사용했습니다.
- `work-log-closeout`: 이번 라운드의 계획, 실제 조회 명령, 남은 리스크를 `/work` 형식으로 남기기 위해 사용했습니다.

## 변경 이유
- 직전 라운드 기록 `work/5/30/2026-05-30-news-trends-table-react-compiler.md`가 다음 우선순위로 `NewsExploreClient`를 지정했습니다.
- 최신 one-off 스캔 파일 `tmp/eslint-react-hooks-set-state-after-news-trends-table-client.json` 기준 잔여 경고는 `49 warnings / 42 files`입니다.
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`는 `/planning/v3/news/explore` 사용자 경로에서 `/api/planning/v3/news/search`를 직접 호출하는 route-local client라서, effect 내부 fetch와 state commit 경계를 분리하는 방식으로 `react-hooks/set-state-in-effect` 1건을 줄일 가능성이 큽니다.

## 전달 변경
- `NewsExploreClient`의 현재 위험 구간을 `useEffect` 기반 초기/재조회 로딩 블록과 `applyFilters()`의 즉시 `setLoading`, `setErrorMessage`, `setApplied` 갱신 조합으로 정리했습니다.
- 영향 사용자 경로를 `/planning/v3/news/explore`로, 직접 데이터 흐름을 `explore/page.tsx -> NewsExploreClient -> /api/planning/v3/news/search -> search index/freshness payload`로 고정했습니다.
- `WeeklyPlanPanel`, `NewsNavigation`, freshness 배너는 같은 화면에 공존하지만 이번 경고 축소의 직접 수정 대상은 `NewsExploreClient` 1파일에서 시작하는 것이 가장 안전하다고 정리했습니다.
- 추천 검증 세트는 `targeted ESLint -> targeted news API test -> pnpm lint -> pnpm build` 순으로 제안하고, `pnpm e2e:rc`는 셀렉터/사용자 흐름이 실제로 바뀌는 경우에만 추가하도록 좁혔습니다.

## 검증
- `Get-ChildItem -LiteralPath 'work/5/30' -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5 FullName,Name,LastWriteTime`
- `Get-Content -LiteralPath 'work/5/30/2026-05-30-news-trends-table-react-compiler.md' | Select-Object -First 260`
- `Get-ChildItem -LiteralPath 'verify/5/30' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 10 FullName,Name,LastWriteTime` -> FAIL, 경로 없음
- `rg --files | rg "eslint-react-hooks-set-state-after-news-trends-table-client|NewsExploreClient|news-explore|news route-local|news/trends|news/explore|verify/.*/news|tmp/.*news"`
- `Get-Content -LiteralPath '.codex/skills/planning-gate-selector/SKILL.md' | Select-Object -First 260`
- `Get-Content -LiteralPath '.codex/skills/work-log-closeout/SKILL.md' | Select-Object -First 260`
- `Get-Content -LiteralPath 'src/app/planning/v3/news/_components/NewsExploreClient.tsx' | Select-Object -First 320`
- `Get-Content -LiteralPath 'tmp/eslint-react-hooks-set-state-after-news-trends-table-client.json' | Select-Object -First 260`
- `rg -n "planning-v3-news|news-search|news-explore|NewsExploreClient|/api/planning/v3/news/search" tests src/app/planning/v3/news -g "*.ts" -g "*.tsx"`
- `Get-Content -LiteralPath 'work/3/14/2026-03-14-planning-v3-news-explore-freshness-contract.md' | Select-Object -First 260`
- `rg -n "useEffect\\(|setApplied\\(|setLoading\\(|setErrorMessage\\(|setItems\\(|setTopics\\(|setSources\\(|setTotal\\(|setFreshness\\(|applyFilters|fetch\\(`/api/planning/v3/news/search" src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `rg -n "WeeklyPlanPanel|NewsNavigation|ReportHeroCard|ReportHeroStatCard|freshness" src/app/planning/v3/news/_components/NewsExploreClient.tsx src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx`

## 남은 리스크
- [사실] 이번 라운드는 계획 정리만 했고, ESLint를 새로 실행해 `NewsExploreClient` 경고 라인을 재확정하지는 않았습니다.
- [추정] 현재 구조상 `useEffect` 안의 `loadExplore()` 호출 또는 그 내부의 success/error state commit이 경고 원인일 가능성이 높지만, 정확한 트리거 라인은 다음 구현 라운드에서 targeted ESLint로 다시 확인해야 합니다.
- [사실] `verify/5/30` 폴더가 없어 오늘 날짜 기준 별도 검증 산출물 디렉터리는 확인하지 못했습니다.
- [권고] 다음 라운드는 `NewsExploreClient` 단일 파일 범위로 시작하고, API 계약이나 freshness 문구까지 번지지 않으면 `tests/planning-v3-news-search-api.test.ts`와 `pnpm build`까지만 유지하는 편이 안전합니다.
