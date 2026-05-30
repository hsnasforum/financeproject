# 2026-05-30 DartDisclosureMonitorClient React Compiler 경고 축소

## 변경 파일
- `src/components/DartDisclosureMonitorClient.tsx`
- `work/5/30/2026-05-30-dart-disclosure-monitor-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 기본 작업 규칙과 DART 관련 조건부 skill 적용 범위를 확인했습니다.
- `planning-gate-selector`: DART 모니터 UI/hooks 변경에 맞춰 targeted ESLint, 축소 테스트, lint/test/build/e2e, guard 검증 범위를 정했습니다.
- `dart-data-source-hardening`: DART 모니터의 저장 설정, 즐겨찾기, freshness/empty/failure 표시가 변경되지 않는지 리스크를 점검했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 명령, 결과, 잔여 리스크를 `/work` 종료 기록으로 정리했습니다.
- `route-ssot-check`, `planning-v3-batch-contract-narrowing`: route/href 또는 planning v3 batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 이유
- `DartDisclosureMonitorClient` 초기 hydrate effect가 저장된 설정, 화면 모드, 입력값, 관심 기업 목록을 effect 안에서 동기 setState로 반영해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- DART 공시 모니터는 `/public/dart`의 사용자 흐름에 포함되므로 API 계약, 실패/빈 결과 처리, freshness 표시를 유지한 채 hook 경고만 줄이는 최소 수정이 필요했습니다.

## 핵심 변경
- 저장된 공시 모니터 설정과 화면 모드 hydrate를 `window.setTimeout(..., 0)` 콜백으로 옮겼습니다.
- 같은 콜백에서 `from/to` 입력값과 관심 기업 목록 refresh를 함께 유지해 초기 동기 setState 경고만 제거했습니다.
- cleanup에서 `window.clearTimeout(timeoutId)`를 호출해 언마운트 후 지연 hydrate가 실행되지 않게 했습니다.
- `DART_FAVORITES_UPDATED_EVENT`와 `storage` 이벤트 리스너, 공시 목록 fetch, `NO_DATA`/fallback/freshness 로직, 사용자 문구, route/href는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/DartDisclosureMonitorClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`: `messages: []`, `warningCount: 0`
- `corepack pnpm exec vitest run tests/dart-disclosure-store.test.ts tests/dart-disclosure-monitor-helpers.test.ts tests/dart-list-route-mapping.test.ts tests/dart-store.test.ts`: PASS, 4 files / 17 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-dart-disclosure-monitor.json`: `31 warnings / 25 files`, target 없음
- `git diff --check`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: 1차 FAIL, `tests/planning-v2-api/persistence-routes.test.ts`의 `supports profiles CRUD through routes`에서 delete 응답이 일시적으로 404
- `corepack pnpm exec vitest run tests/planning-v2-api/persistence-routes.test.ts`: PASS, 1 file / 8 tests
- `corepack pnpm test`: 재실행 PASS, 663 files / 2035 tests
- `corepack pnpm build`: PASS
- `corepack pnpm e2e:rc:dart`: PASS, 3 tests
- `find . -maxdepth 1 -type d -name '.next-build-*' -print`: 잔여 `.next-build-*` 디렉터리 없음
- `corepack pnpm multi-agent:guard`: PASS, `tracked=23 coverage=16`

## 남은 리스크
- 초기 hydrate가 다음 macrotask로 이동해 첫 paint 직후 아주 짧게 기본 설정 또는 빈 관심 기업 목록이 보일 수 있습니다.
- DART 공시 목록 API, empty/failure/fallback, `lastCheckedAt`/freshness 표시 분기는 변경하지 않았으므로 해당 동작의 잔여 리스크는 기존 범위와 같습니다.

## 다음 라운드 우선순위
- 다음 one-off 후보는 `src/components/DebugUnifiedClient.tsx` 1건입니다.
