# 2026-05-30 News digest React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `work/5/30/2026-05-30-news-digest-react-hooks-plan.md`
- `work/5/30/2026-05-30-news-digest-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: planning v3 news digest client 변경의 검증 범위를 고르기 위해 사용했습니다.
- `work-log-closeout`: 실제 실행한 검증, cleanup 재시도, 남은 React Compiler 후보를 `/work/5/30` 마감 기록으로 남기기 위해 사용했습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 기준에서 `NewsDigestClient`가 effect 안에서 `load()`를 호출하고, `load`가 즉시 `setLoading`/`setErrorMessage`와 fetch 결과 commit을 함께 처리해 경고 1건을 만들고 있었습니다.
- `NewsDigestClient`는 digest/scenarios/notes/refresh fetch를 한 클라이언트에서 다루므로, fetch 함수와 effect의 state commit 경계를 분리해 stale 응답과 unmount 뒤 commit 위험도 함께 줄일 수 있었습니다.

## 핵심 변경
- `load`를 fetch 전용 함수로 바꾸고 digest, scenarios, notes, topic contradiction 결과를 `DigestLoadResult`로 반환하도록 정리했습니다.
- mount effect는 `AbortController`, active flag, request sequence guard를 사용해 비동기 응답 이후에만 화면 상태를 commit합니다.
- `fetchNotes`는 선택적 `AbortSignal`을 받아 mount effect cleanup과 같은 취소 경계를 공유합니다.
- 수동 갱신 후 digest 재조회가 실패하면 기존 `load` 동작처럼 digest/scenarios/notes/topic contradictions를 비워 화면 상태가 실제 실패와 어긋나지 않도록 유지했습니다.
- 전체 one-off 스캔 결과가 48 warnings / 41 files에서 47 warnings / 40 files로 감소했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsDigestClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` — 변경 전 경고 1건 확인
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsDigestClient.tsx --rule react-hooks/set-state-in-effect:error` — 최초 수정 후 PASS
- `corepack pnpm exec vitest run tests/planning-v3-news-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts` — 최초 수정 후 PASS, 2 files / 13 tests
- `git diff --check -- src/app/planning/v3/news/_components/NewsDigestClient.tsx` — 최초 수정 후 PASS
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-news-digest-client.json` — 최초 수정 후 PASS, `47` warnings / `40` files
- `corepack pnpm exec eslint src/app/planning/v3/news/_components/NewsDigestClient.tsx --rule react-hooks/set-state-in-effect:error` — 수동 갱신 실패 경로 보정 후 PASS
- `corepack pnpm exec vitest run tests/planning-v3-news-api.test.ts tests/planning-v3-news-digest-indicator-root.test.ts` — 수동 갱신 실패 경로 보정 후 PASS, 2 files / 13 tests
- `git diff --check -- src/app/planning/v3/news/_components/NewsDigestClient.tsx` — 수동 갱신 실패 경로 보정 후 PASS
- `corepack pnpm lint` — PASS
- `corepack pnpm test` — 1차 FAIL, 이전 build 산출물 `.next-build-509283/standalone`의 e2e spec이 Vitest 수집 범위에 섞여 helper import를 찾지 못했습니다.
- `corepack pnpm cleanup:next-artifacts` — 실행됐지만 `.next-build-info.json`이 `.next-build-509283`을 보존 대상으로 남겨 root build cleanup을 skip했습니다.
- PowerShell `Remove-Item` 경로 검증 정리 명령 — 120초 timeout, 완료 여부 미확정
- WSL 경로 검증 정리 명령 — 1차 FAIL, PowerShell 변수 확장으로 quoting이 깨졌습니다.
- WSL stop-parsing 경로 검증 정리 명령 — PASS, `.next-build-509283`와 `.next-build-info.json` 정리
- `corepack pnpm test` — 정리 후 재실행 PASS, 663 files / 2035 tests
- `corepack pnpm build` — PASS
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-news-digest-client.json` — 최종 PASS
- `rg -o 'react-hooks/set-state-in-effect' tmp/eslint-react-hooks-set-state-after-news-digest-client.json | wc -l` — PASS, `47`
- `rg -o 'warningCount.:[1-9][0-9]*' tmp/eslint-react-hooks-set-state-after-news-digest-client.json | wc -l` — PASS, `40`
- `corepack pnpm multi-agent:guard` — PASS, `latestWorkNote=work/5/30/2026-05-30-news-digest-react-compiler.md`
- `git diff --check` — PASS

## 남은 리스크
- [사실] 이번 변경은 `NewsDigestClient` 클라이언트의 fetch/effect 경계만 바꾸었고 API route, digest 생성 로직, notes 저장 계약은 수정하지 않았습니다.
- [사실] 현재 grep 기준 `NewsDigestClient`는 직접 mount되는 TSX 경로가 확인되지 않아, 사용자 노출 회귀 검증 신호는 target API 테스트와 build 중심입니다.
- [사실] `NewsTodayClient`, `WeeklyPlanPanel`, `useNewsSettingsController` 등 news 관련 잔여 `react-hooks/set-state-in-effect` 후보는 아직 남아 있습니다.

## 다음 라운드 우선순위
- `NewsTodayClient`를 다음 대상으로 보고 `/api/planning/v3/news/today`, digest, exposure fetch fan-out과 effect 내부 state commit 경계를 먼저 확인합니다.
- 그다음 `WeeklyPlanPanel`, `useNewsSettingsController` 순서로 route-local 범위와 공유 훅 범위를 비교합니다.
- 동일하게 target ESLint, 관련 news API 테스트, one-off 스캔, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm multi-agent:guard`를 실행합니다.
