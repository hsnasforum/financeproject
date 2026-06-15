# 2026-05-30 Scenario library React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx`
- `work/5/30/2026-05-30-scenario-library-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: React 훅/클라이언트 화면 변경에 맞춰 target ESLint, 관련 시나리오/뉴스 테스트, 전체 lint/test/build 검증을 선택했습니다.
- `work-log-closeout`: 실제 실행한 검증과 잔여 리스크를 `/work/5/30` closeout 형식으로 정리했습니다.
- `planning-v3-batch-contract-narrowing`: 적용 여부를 검토했지만, 이번 대상은 scenarios client로 batch/detail/draft/profile 계약 변경이 아니라서 코드 판단 기준에는 적용하지 않았습니다.

## 변경 이유
- `ScenarioLibraryClient`의 mount effect가 `load()`를 호출했고, `load()`가 첫 await 전에 `setLoading`/`setLoadError`/`setError`를 실행해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/planning/v3/scenarios`의 scenario library 목록 로딩과 저장 동기화 의미는 유지하면서 effect 안의 동기 state reset 경계를 줄일 필요가 있었습니다.

## 핵심 변경
- `loadLibraryData()`를 GET `/api/planning/v3/scenarios/library` fetch 전용 함수로 분리했습니다.
- `applyLibraryLoadResult()`와 `applyLibraryLoadFailure()`를 추가해 성공/실패 state commit을 명확히 나눴습니다.
- mount effect는 `AbortController`와 active flag로 stale/unmount 응답을 방어하고, fetch 결과 이후에만 화면 state를 반영합니다.
- 저장 POST 경로, request body, route/link/API payload shape는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` — 변경 전 WARN 1건, line 137 `void load()`
- `corepack pnpm exec eslint src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` — 변경 후 PASS, messages `[]`
- `mkdir -p tmp && corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-scenario-library.json` — PASS, 전체 스캔 42 warnings / 35 files, 대상 파일 0건
- `corepack pnpm exec vitest run tests/planning-v3-draft-scenario-api.test.ts tests/news-summary-scenario.test.ts planning/v3/news/digest.test.ts tests/planning-v3-news-api.test.ts` — PASS, 4 files / 18 tests
- `git diff --check` — PASS
- `corepack pnpm lint` — PASS
- `find . -maxdepth 1 -type d -name ".next-build-*" -print` — PASS, 잔여 `.next-build-*` 없음
- `corepack pnpm test` — PASS, 663 files / 2035 tests
- `corepack pnpm build` — PASS
- `find . -maxdepth 1 -type d -name ".next-build-*" -print` — PASS, build 후 잔여 `.next-build-*` 없음
- `corepack pnpm multi-agent:guard` — PASS, latestWorkNote=`work/5/30/2026-05-30-scenario-library-react-compiler.md`
- `git diff --check` — PASS

## 남은 리스크
- `react-hooks/set-state-in-effect` 전체 스캔은 아직 42 warnings / 35 files가 남아 있습니다. 이번 라운드 대상 `ScenarioLibraryClient.tsx`는 목록에서 제거됐습니다.
- `/planning/v3/scenarios` 전용 e2e는 실행하지 않았습니다. selector나 route/link/API 구조를 바꾸지 않았고, 관련 테스트와 전체 lint/test/build로 검증했습니다.
- mount 로딩 중 저장 버튼은 기존처럼 `loading || saving || !dirty`로 막히며, 저장 POST 이후 state 재동기화 경로는 그대로 유지했습니다.

## 다음 라운드
- manager 분해를 먼저 실행한 뒤 planning v3 잔여 경고인 `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx` 1건을 우선 검토합니다.
- transactions/batch list 계열을 건드릴 경우 `planning-v3-batch-contract-narrowing` 적용 여부를 먼저 확인하고, 관련 batch/list 테스트와 build 필요성을 다시 고릅니다.
