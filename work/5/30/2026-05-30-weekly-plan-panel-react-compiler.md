# 2026-05-30 WeeklyPlanPanel React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx`
- `work/5/30/2026-05-30-weekly-plan-panel-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: planning v3 news weekly-plan client 변경의 검증 범위를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 실행한 검증, manager 산출물, 남은 React Compiler 후보를 `/work/5/30` 마감 기록으로 남기기 위해 사용했습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 기준에서 `WeeklyPlanPanel`이 effect 안에서 `load()`를 호출하고, `load`가 즉시 `setLoading`/`setErrorMessage`와 fetch 결과 commit을 함께 처리해 경고 1건을 만들고 있었습니다.
- 이 패널은 `NewsTodayClient`, `NewsExploreClient`, `NewsTrendsTableClient`에서 공통으로 쓰이고 `/api/planning/v3/news/weekly-plan` GET/POST를 다루므로, 초기 로드 fetch와 화면 상태 반영을 분리해 stale 응답 commit 위험도 줄였습니다.

## 핵심 변경
- `load`를 fetch 전용 함수로 바꾸고 weekly-plan form 상태를 `WeeklyPlanFormState`로 반환하도록 정리했습니다.
- mount effect는 `AbortController`, active flag, request sequence guard를 사용해 비동기 응답 이후 최신 요청일 때만 form 상태와 오류 상태를 commit합니다.
- 수동 불러오기 버튼은 `reloadPlan`으로 분리해 사용자 이벤트 경로에서 loading/error 처리를 유지하면서도 오래된 응답이 최신 상태를 덮어쓰지 않게 했습니다.
- 저장 API 계약과 저장 성공 후 form 동기화 동작은 바꾸지 않았습니다.
- 전체 one-off 스캔 결과가 46 warnings / 39 files에서 45 warnings / 38 files로 감소했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx --rule react-hooks/set-state-in-effect:warn -f json` — 변경 전 경고 1건 확인
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/WeeklyPlanPanel.tsx --rule react-hooks/set-state-in-effect:warn -f json` — 수정 후 PASS, 대상 파일 경고 0건
- `corepack pnpm exec vitest run tests/planning-v3-news-weekly-plan-api.test.ts planning/v3/news/weeklyPlan.test.ts tests/planning-v3-write-route-guards.test.ts` — PASS, 3 files / 10 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-weekly-plan-panel.json` — PASS
- `node -e "..."`로 `tmp/eslint-react-hooks-set-state-after-weekly-plan-panel.json` 집계 — PASS, `45` warnings / `38` files
- `git diff --check` — 중간 확인 PASS
- `corepack pnpm lint` — PASS
- `find . -maxdepth 1 -type d -name '.next-build-*' -print` — PASS, 출력 없음
- `corepack pnpm test` — PASS, 663 files / 2035 tests
- `corepack pnpm build` — PASS
- `git diff --check` — closeout 작성 전 최종 확인 PASS
- `corepack pnpm multi-agent:guard` — closeout 작성 후 PASS, `latestWorkNote=work/5/30/2026-05-30-weekly-plan-panel-react-compiler.md`, `latestWorkNoteTracking=untracked`
- `git diff --check` — closeout 작성 후 PASS

## 남은 리스크
- [사실] 이번 변경은 `WeeklyPlanPanel` 클라이언트의 초기 GET fetch/effect 경계와 수동 불러오기 경계만 바꾸었고 API route, storage helper, 저장 POST 계약은 수정하지 않았습니다.
- [사실] manager 에이전트는 stale one-off 아티팩트와 현재 파일 상태의 불일치를 보고 baseline 재확인을 권고했으며, 메인 라운드에서 최신 one-off 스캔으로 실제 감소분 1건을 확인했습니다.
- [사실] 사용자 흐름 셀렉터나 라우트는 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.
- [사실] `useNewsSettingsController` 등 news 관련 잔여 `react-hooks/set-state-in-effect` 후보는 아직 남아 있습니다.

## 다음 라운드 우선순위
- `useNewsSettingsController`의 settings route-local/shared hook 경계를 확인하고, 저장/로드 상태 commit이 effect 내부 동기 경로로 묶인 부분이 있는지 먼저 재현합니다.
- 다음 라운드도 최신 one-off 스캔으로 실제 대상 포함 여부를 확인한 뒤 target ESLint, 관련 settings API/UI 테스트, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm multi-agent:guard`를 실행합니다.
