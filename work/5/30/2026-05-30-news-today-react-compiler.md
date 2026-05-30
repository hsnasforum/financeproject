# 2026-05-30 News today React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`
- `work/5/30/2026-05-30-news-today-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: planning v3 news client의 React hook/effect 변경에 맞는 대상 ESLint, 관련 news API 테스트, 전체 lint/test/build 범위를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 React Compiler 후보를 `/work/5/30` 마감 기록으로 남기기 위해 사용했습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 기준에서 `NewsTodayClient`가 mount effect 안에서 `load()`를 호출하고, `load`가 즉시 `setLoading`/`setErrorMessage`와 fetch 결과 commit을 함께 처리해 경고 1건을 만들고 있었습니다.
- 오늘 브리핑 화면은 `/api/planning/v3/news/today`, `/api/planning/v3/exposure/profile`, `/api/planning/v3/news/digest`를 함께 읽고 수동 갱신/복구 뒤 재조회까지 수행하므로, fetch와 state commit 경계를 분리해 stale 응답 commit 위험도 줄였습니다.

## 핵심 변경
- `load`를 fetch 전용 함수로 바꾸고 today, exposure profile, digest watchlist 결과를 `NewsTodayLoadResult`로 반환하도록 정리했습니다.
- mount effect는 `AbortController`, active flag, request sequence guard를 사용해 비동기 응답 이후 최신 요청일 때만 화면 상태를 commit합니다.
- 수동 갱신과 복구 실행 후 재조회도 같은 request sequence guard를 사용해 이전 mount load나 오래된 재조회 응답이 최신 화면 상태를 덮어쓰지 않게 했습니다.
- 재조회 실패 시 기존 동작처럼 today/profile/watchlist 상태를 비우고 실제 실패 메시지를 표시하도록 유지했습니다.
- 전체 one-off 스캔 결과가 47 warnings / 40 files에서 46 warnings / 39 files로 감소했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsTodayClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` — PASS, 대상 파일 경고 0건
- `corepack pnpm exec vitest run tests/planning-v3-news-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts` — PASS, 3 files / 16 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-news-today-client.json` — PASS
- `node -e "..."`로 `tmp/eslint-react-hooks-set-state-after-news-today-client.json` 집계 — PASS, `46` warnings / `39` files
- `pnpm lint` — FAIL, WSL non-login shell에서 `pnpm` 바이너리를 찾지 못했습니다. 동일 검증은 `corepack pnpm lint`로 재실행했습니다.
- `corepack pnpm lint` — PASS
- `find . -maxdepth 1 -type d -name '.next-build-*' -print` — PASS, 출력 없음
- `corepack pnpm test` — PASS, 663 files / 2035 tests
- `corepack pnpm build` — PASS
- `corepack pnpm multi-agent:guard` — PASS, closeout 작성 전 기준 `latestWorkNote=work/5/30/2026-05-30-news-digest-react-compiler.md`
- `corepack pnpm multi-agent:guard` — closeout 작성 후 PASS, `latestWorkNote=work/5/30/2026-05-30-news-today-react-compiler.md`, `latestWorkNoteTracking=untracked`
- `git diff --check` — PASS
- `git diff --cached --check` — PASS

## 남은 리스크
- [사실] 이번 변경은 `NewsTodayClient`의 클라이언트 fetch/effect 경계만 바꾸었고 API route, news digest 생성, exposure profile 계약은 수정하지 않았습니다.
- [사실] manager 서브에이전트는 NewsToday 라운드 분해용으로 시작했지만 2회 wait timeout 뒤 종료했으며, 최종 산출물이나 코드 변경은 없었습니다.
- [사실] `WeeklyPlanPanel`, `useNewsSettingsController` 등 news 관련 잔여 `react-hooks/set-state-in-effect` 후보는 아직 남아 있습니다.

## 다음 라운드 우선순위
- `WeeklyPlanPanel`의 `/api/planning/v3/news/weekly-plan` 로드/저장 흐름에서 effect 내부 state commit 경계를 먼저 확인합니다.
- 그다음 `useNewsSettingsController`처럼 route-local을 넘어 공유 훅에 가까운 범위는 테스트 범위를 더 넓혀 처리합니다.
- 동일하게 target ESLint, 관련 news API 테스트, one-off 스캔, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm multi-agent:guard`를 실행합니다.
