# 2026-05-30 NewsDigestClient react-hooks 경고 축소 계획

## 변경 파일
- `work/5/30/2026-05-30-news-digest-react-hooks-plan.md`

## 사용 skill
- `planning-gate-selector`: `NewsDigestClient` 범위를 React hooks 경고 축소 작업으로 분류하고 최소 검증 세트를 고르기 위해 사용했습니다.
- `work-log-closeout`: 최신 `/work` 문서 형식, `다음 라운드` 섹션, 실제 실행 명령 기록을 저장소 규칙에 맞추기 위해 사용했습니다.

## 변경 이유
- [사실] 최신 closeout `work/5/30/2026-05-30-news-explore-react-compiler.md`는 다음 우선순위로 `NewsDigestClient`를 지정했습니다.
- [사실] `src/app/planning/v3/news/_components/NewsDigestClient.tsx`는 현재 워크트리에서 이미 수정 중이며, `useEffect -> load()` 경계와 `handleRefresh()` 재로딩 경계가 `react-hooks/set-state-in-effect` 재검토 대상입니다.
- [사실] 현재 검색 기준으로 `/planning/v3/news` 실제 page 진입은 `NewsTodayClient`를 렌더링하고, `NewsDigestClient`는 다른 TSX에서 직접 mount되지 않습니다.
- [해석] 따라서 이번 라운드는 사용자 경로 회귀보다 "잔여 경고 축소" 목적이 더 강하고, 최소 검증도 route wiring 변경 없는 client 파일 기준으로 좁히는 편이 맞습니다.

## 영향 범위
- 분류: `planning`
- 직접 수정 후보 파일: `src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- 간접 확인 파일:
  - `src/app/planning/v3/news/page.tsx`
  - `tests/planning-v3-news-api.test.ts`
  - `tests/planning-v3-news-digest-indicator-root.test.ts`
- 사용자 경로:
  - [사실] 현재 직접 mount 확인 경로 없음
  - [관련 경로] `/planning/v3/news`는 존재하지만 현재 `NewsTodayClient`를 렌더링합니다
- 데이터 흐름:
  - `NewsDigestClient -> /api/planning/v3/news/digest`
  - `NewsDigestClient -> /api/planning/v3/news/scenarios`
  - `NewsDigestClient -> /api/planning/v3/news/notes`
  - `NewsDigestClient -> /api/planning/v3/news/refresh`

## 단계별 작업 계획
- 단계: 1
  목적: 현재 워크트리 diff와 실제 경고 라인을 다시 맞춰, 이미 들어간 로컬 수정이 경고를 얼마나 줄였는지 재확정합니다.
  추천 에이전트 타입: `analyzer`
- 단계: 2
  목적: 메인 에이전트가 `NewsDigestClient.tsx` 한 파일 안에서 effect 본문과 fetch helper의 책임을 분리하고, 현재 사용자 수정과 충돌 없이 가장 작은 안전한 수정만 적용합니다.
  추천 에이전트 타입: `developer`
- 단계: 3
  목적: refresh/notes 하위 경로가 같은 규칙을 다시 만들지 않는지 정적 검토하고, API 계약 테스트 추가 필요 여부만 병렬로 제안합니다.
  추천 에이전트 타입: `reviewer`
- 단계: 4
  목적: 메인 에이전트가 최소 검증 세트를 단독 실행하고 `/work` closeout 및 `multi-agent:guard`까지 마무리합니다.
  추천 에이전트 타입: `tester`

## 즉시 막는 핵심 경로와 메인 에이전트가 로컬에서 직접 처리할 일
- [사실] 대상 파일이 이미 수정 중이라, 메인 에이전트가 먼저 `git diff -- src/app/planning/v3/news/_components/NewsDigestClient.tsx` 기준으로 현재 사용자 변경을 보존해야 합니다.
- [권고] 첫 구현 직전 `NewsDigestClient.tsx` 대상 ESLint를 다시 실행해 실제 잔여 경고가 `useEffect -> load()`인지 `handleRefresh()`인지 확정해야 합니다.
- [권고] 최종 코드 수정, `pnpm lint`, `pnpm build`, `pnpm multi-agent:guard`는 메인 에이전트 단독 소유로 유지합니다.

## 병렬 배정 가능한 조사/검증/문서화 작업
- [조사] `reviewer`: `NewsDigestClient`의 `fetchNotes`, `load`, `handleRefresh`가 현재 React hooks 규칙상 어떤 라인으로 잡히는지 정적 코멘트만 남깁니다.
- [검증 제안] `tester`: API 계약이 건드려질 가능성이 생길 때만 `tests/planning-v3-news-api.test.ts`, `tests/planning-v3-news-digest-indicator-root.test.ts` 추가 여부를 분류합니다.
- [문서화] `documenter`: 구현 완료 후 `/work` closeout 초안에 `남은 리스크`와 `다음 라운드` 문구만 준비하고, 실제 PASS/FAIL 판정은 메인 검증 이후에만 확정합니다.

## 필요한 검증
- 최소 검증 세트:
  - `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsDigestClient.tsx --rule react-hooks/set-state-in-effect:error`
  - `corepack pnpm lint`
  - `corepack pnpm build`
- 조건부 추가 검증:
  - [권고] 응답 해석이나 refresh/notes 흐름의 예외 처리까지 바꾸면 `corepack pnpm exec vitest run tests/planning-v3-news-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts`
  - [권고] 실제 `/planning/v3/news` page wiring 또는 셀렉터가 바뀌는 경우에만 `corepack pnpm e2e:rc`
  - [권고] 라운드 종료 기록을 최신 `/work`로 남기면 `corepack pnpm multi-agent:guard`
- 최소 검증 선택 이유:
  - [사실] 변경 축은 React hooks/client 정적 규칙이므로 대상 ESLint와 `pnpm lint`가 1차 게이트입니다.
  - [사실] 파일 위치가 App Router 트리 아래라 import/build 회귀는 `pnpm build`가 가장 작게 잡습니다.
  - [사실] 현재 `NewsDigestClient`는 직접 mount 검색 결과가 없어 `pnpm e2e:rc`는 기본 세트에서 제외하는 편이 더 작습니다.

## 검증
- `Get-ChildItem -LiteralPath 'work/5/30' -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5 FullName,Name,LastWriteTime`
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '1,220p' work/5/30/2026-05-30-news-explore-react-compiler.md`
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '1,220p' work/5/30/2026-05-30-news-explore-react-hooks-plan.md`
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '1,260p' multi_agent.md`
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '1,320p' src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '235,330p' src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- sed -n '1,200p' src/app/planning/v3/news/page.tsx`
- `rg -n "NewsDigestClient|/api/planning/v3/news/digest|planning-v3-news-digest|digest" tests src/app/planning/v3/news src/app/api/planning/v3/news -g "*.ts" -g "*.tsx"`
- `rg -n "<NewsDigestClient|NewsDigestClient\\(" src -g "*.tsx"`
- `rg -n "digest route|Digest 확인|/planning/v3/news\\b|NewsTodayClient" src/app/planning/v3/news tests/e2e -g "*.tsx" -g "*.ts"`
- `rg -n "useEffect\\(|const load|setLoading\\(|setErrorMessage\\(|setDigest\\(|setTopicContradictions\\(|setScenarios\\(|setNotes\\(|setNotice\\(|setRefreshing\\(|fetchNotes\\(|handleRefresh|handleNote|handleDelete" src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `rg -n "다음 라운드|latestWorkNote|closeout" scripts/multi_agent_handoff_guard.mjs package.json`
- `git status --short -- src/app/planning/v3/news/_components/NewsDigestClient.tsx work/5/30`
- `git diff -- src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `rg --files tmp | rg 'eslint-react-hooks-set-state-after-news'` -> 결과 없음
- `rg --files tmp | rg 'digest|explore|alerts|trends'` -> 결과 없음

## 남은 리스크
- [사실] `NewsDigestClient.tsx`는 이미 수정 중이라, 다음 구현 라운드에서 기존 사용자 변경과 충돌할 수 있습니다.
- [사실] 현재 grep 기준으로 `NewsDigestClient`는 직접 mount되지 않아, 경고를 줄여도 사용자 노출 회귀 검증 신호가 약합니다.
- [미확인] 현재 워크트리 상태에서 `react-hooks/set-state-in-effect` 경고가 아직 남아 있는지, 이미 부분 해소됐는지는 targeted ESLint 재실행 전까지 확정할 수 없습니다.
- [사실] `verify/5/30` 폴더는 없었고, `tmp` 아래에도 `news` 전용 ESLint 산출물 패턴은 찾지 못했습니다.

## 다음 라운드 우선순위
- 메인 에이전트가 `NewsDigestClient.tsx` 대상 ESLint를 먼저 재실행해 잔여 경고 위치를 확정합니다.
- 경고가 남아 있으면 현재 diff를 보존한 상태에서 effect와 refresh 재조회 경계를 한 번만 더 축소합니다.
- 구현 종료 후 `corepack pnpm exec eslint ...`, `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm multi-agent:guard` 순서로 단독 검증하고 closeout을 남깁니다.
