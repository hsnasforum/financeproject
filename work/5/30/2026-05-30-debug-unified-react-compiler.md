# 2026-05-30 DebugUnifiedClient React Compiler 경고 축소

## 변경 파일
- `src/components/DebugUnifiedClient.tsx`
- `work/5/30/2026-05-30-debug-unified-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현/검증 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: React hook/UI 타이밍 변경에 맞춰 targeted ESLint, unified API 축소 테스트, lint/test/build, debug e2e를 검증 범위로 정했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 명령, 실패 후 재실행 결과, 남은 리스크를 `/work` 종료 기록으로 정리했습니다.
- `route-ssot-check`, `dart-data-source-hardening`, `planning-v3-batch-contract-narrowing`: route/href, DART/public-data, planning v3 batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 이유
- `DebugUnifiedClient`의 초기 reload effect가 커서 상태를 effect 본문에서 동기 setState로 초기화해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/debug/unified`는 운영자용 debug 화면이므로 route, href, API 계약, 화면 문구를 바꾸지 않고 초기 reset/reload 타이밍만 최소 변경했습니다.

## 핵심 변경
- 초기 reload effect의 `nextCursorRef`, `nextCursor`, `hasMore`, `reload(false)` 호출을 `window.setTimeout(..., 0)` 콜백으로 옮겼습니다.
- cleanup에서 `window.clearTimeout(timeoutId)`를 호출해 언마운트 또는 의존성 변경 뒤 지연 reload가 남지 않게 했습니다.
- 수동 Refresh, Load more, smoke sync, auto refresh 로직은 변경하지 않았습니다.
- `/debug/unified`, `/api/sources/status`, `/api/products/unified`, `/api/sync/smoke` 계약과 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/DebugUnifiedClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`: 변경 전 `line 267` 경고 1건 확인
- `corepack pnpm exec eslint src/components/DebugUnifiedClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`: 변경 후 `messages: []`, `warningCount: 0`
- `corepack pnpm exec vitest run tests/unified-mode-validation.test.ts tests/unified-samplebank.test.ts tests/products-unified-route.test.ts tests/unified-item-route.test.ts`: PASS, 4 files / 9 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-debug-unified.json`: `30 warnings / 24 files`, target 없음
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS, 663 files / 2035 tests
- `corepack pnpm build`: PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/debug-access.spec.ts --workers=1`: 1차 FAIL, `PLANNING_DEBUG_ENABLED` 없이 실행해 `/debug/unified`가 의도대로 404 반환
- `PLANNING_DEBUG_ENABLED=true node scripts/playwright_with_webserver_debug.mjs test tests/e2e/debug-access.spec.ts --workers=1`: PASS, 2 tests
- `corepack pnpm cleanup:next-artifacts`: PASS, `.next-e2e-3126` 제거
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`: 잔여 디렉터리 없음
- `git diff --check`: PASS

## 남은 리스크
- 초기 reload가 다음 macrotask로 이동해 `/debug/unified` 첫 paint 직후 아주 짧게 기존 기본 상태가 보일 수 있습니다.
- debug 화면 접근은 `PLANNING_DEBUG_ENABLED=true`와 로컬 요청 조건에 의존합니다. flag 없이 404가 나는 것은 기존 보안 동작입니다.

## 다음 라운드 우선순위
- 다음 one-off 후보는 `src/components/DevDataDashboardClient.tsx` 1건입니다.
