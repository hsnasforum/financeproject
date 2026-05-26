# 2026-05-26 실행 기록 React Compiler lint 축소

## 변경 파일
- `src/components/PlanningRunsClient.tsx`
- `work/5/26/2026-05-26-planning-runs-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록과 이번 구현 라운드 성격에 맞춰 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: React hooks와 `/planning/runs` 사용자 경로 영향에 맞춰 변경 파일 ESLint, 관련 e2e, 전체 lint, build, production smoke, `e2e:rc`를 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 실패 후 재실행 결과, 잔여 리스크를 `/work` 기록으로 정리했습니다.
- `browser:browser`: 인앱 브라우저로 `/planning/runs` 렌더 확인을 시도했습니다. 현재 Windows에서 WSL 포트에 연결되지 않아 Playwright 검증을 렌더 근거로 유지했습니다.

## 변경 이유
- 최신 전체 ESLint 진단 기준 `react-hooks/set-state-in-effect` 잔여 92건 중 `PlanningRunsClient.tsx` 4건이 가장 큰 단일 군집이었습니다.
- `/planning/runs`는 profileId 복구, 실행 목록 로드, 선택 실행 Action Center 로드가 함께 얽혀 있어 effect 본문에서 동기 `setState`를 호출하던 구조가 React Compiler 호환성을 낮췄습니다.
- 실행 기록 화면은 `/planning`, `/planning/reports`, `/planning/runs/[id]`와 연결되는 안정 경로라서 변경 후 관련 e2e와 production smoke가 필요했습니다.

## 핵심 변경
- `localStorage[PLANNING_SELECTED_PROFILE_STORAGE_KEY]` 기반 profileId 복구를 effect 본문 동기 `setState`에서 취소 가능한 timer callback으로 옮겼습니다.
- `loadProfiles`와 `loadRuns` 시작을 `useEffectEvent`와 취소 가능한 timer로 감싸 effect 본문에서 직접 상태 갱신 함수가 실행되지 않게 했습니다.
- 선택 실행이 사라질 때 Action Center reset을 timer callback으로 미뤄 StrictMode cleanup 경계를 유지했습니다.
- 선택 실행이 바뀔 때 Action Center loading/reset도 별도 cancelable timer로 분리하고, 실제 상세 로드는 기존 250ms debounce를 유지했습니다.
- 전체 `react-hooks/set-state-in-effect` 잔여 수는 92건에서 88건으로 줄었습니다.

## 검증
- `corepack pnpm exec eslint src/components/PlanningRunsClient.tsx --rule react-hooks/set-state-in-effect:error` PASS
- `corepack pnpm exec eslint src tests scripts planning middleware.ts next.config.ts playwright.config.ts postcss.config.mjs prisma.config.ts vitest.config.ts eslint.config.mjs --rule 'react-hooks/set-state-in-effect:error' -f json > tmp/eslint-react-hooks-set-state-after-planning-runs.json || true` INFO: JSON report 생성
- `node ... tmp/eslint-react-hooks-set-state-after-planning-runs.json` INFO: 전체 잔여 88건
- `git diff --check` PASS
- `corepack pnpm e2e -- tests/e2e/flow-history-to-report.spec.ts --workers=1 --reporter=line` PASS: 10 tests
- `corepack pnpm e2e -- tests/e2e/planning-v2-fast.spec.ts --grep "/planning/runs shows print button" --workers=1 --reporter=line` 1차 FAIL: 병렬 실행 중 같은 3126 포트 사용으로 webServer `EADDRINUSE`
- `PORT=3146 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm e2e -- tests/e2e/planning-v2-fast.spec.ts --grep "/planning/runs shows print button" --workers=1 --reporter=line` PASS: 6 tests
- `corepack pnpm lint` PASS
- `corepack pnpm cleanup:next-artifacts` PASS: `.next-e2e-3126`, `.next-e2e-3146` 정리
- `corepack pnpm build` PASS
- `E2E_WEB_SERVER_MODE=production PORT=3147 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm e2e -- tests/e2e/planning-v2-fast.spec.ts --grep "/planning/runs shows print button" --workers=1 --reporter=line` 1차 FAIL: `/planning/runs shows print button`는 PASS였으나, wrapper 인자 경계로 같은 파일의 unrelated `/planning/reports` HTML download 케이스가 함께 실행되어 timeout
- `E2E_WEB_SERVER_MODE=production PORT=3148 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts -g "planning/runs shows print button" --workers=1 --reporter=line` PASS: 1 test
- `corepack pnpm e2e:rc` PASS: 24 passed / 1 skipped
- 인앱 브라우저 확인 BLOCKED: `http://localhost:3150/planning/runs`, `http://172.20.128.246:3150/planning/runs` 모두 `ERR_CONNECTION_REFUSED`
- `Invoke-WebRequest http://localhost:3150/planning/runs` BLOCKED: Windows에서 WSL dev server 포트 연결 실패

## 남은 리스크
- `react-hooks/set-state-in-effect`는 아직 88건 남아 있으며, 다음 배치에서는 3건 군집인 `CandidateComparisonSection`, `LabelingClient`, `OpsPlanningFeedbackClient`, `PlanningReportsClient` 중 사용자 경로 영향이 큰 항목을 우선 선정해야 합니다.
- 인앱 브라우저는 현재 Windows↔WSL localhost bridge 연결 문제로 `/planning/runs`를 직접 열지 못했습니다. 렌더와 사용자 흐름은 Playwright dev/prod/e2e:rc 결과로 검증했습니다.
- production broad smoke의 `/planning/reports` download timeout은 이번 변경 대상인 `PlanningRunsClient`와 직접 관련 없는 케이스입니다. 별도 report export 안정화 라운드에서 재현 여부를 분리해 볼 수 있습니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 최신 전체 lint JSON 기준으로 3건 군집 중 planning/report 사용자 경로와 가장 가까운 파일을 하나 골라 `react-hooks/set-state-in-effect`를 계속 줄입니다.
- report export production download timeout이 반복되는지 별도 focused production test로 확인해, 재현되면 report export 라운드로 분리합니다.
