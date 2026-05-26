# 2026-05-27 Rules Client React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/categories/rules/_components/RulesClient.tsx`
- `work/5/27/2026-05-27-rules-client-react-compiler.md`

## 사용 skill
- planning-gate-selector: planning v3 route-local client 변경에 필요한 one-off lint, rules API/store/guard 테스트, 전체 lint/test/build 검증 세트를 골랐습니다.
- work-log-closeout: 실제 변경 파일, 실행한 명령, 잔여 리스크, 다음 라운드 후보를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `RulesClient`의 초기 `loadRules()` effect 1건이 남아 있었습니다.
- `/planning/v3/categories/rules`는 route-local client라 shared hook보다 영향 범위가 작고, category rules API/store/guard 테스트로 데이터 계약을 확인할 수 있었습니다.

## 핵심 변경
- category rules fetch와 응답 정규화를 `fetchRules`, `normalizeRuleRows`로 분리했습니다.
- 초기 mount effect는 `AbortController`와 `active` guard를 사용해 fetch 완료 뒤에만 rows/error/loading 상태를 갱신하도록 바꿨습니다.
- 수동 저장/삭제 후 새로고침에 쓰는 `loadRules`는 기존 버튼/CRUD 흐름을 유지하면서 같은 fetch helper를 재사용합니다.
- one-off 잔여 경고는 58 warnings / 51 files에서 57 warnings / 50 files로 줄었고, `RulesClient.tsx`는 0 warnings가 됐습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/categories/rules/_components/RulesClient.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-categoryRulesStore.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts` 통과: 4 files / 11 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-rules-client.json` 통과: 잔여 57 warnings / 50 files, `RulesClient.tsx` 0 warnings
- `corepack pnpm lint` 통과
- `corepack pnpm test` 통과: 663 files / 2035 tests
- `corepack pnpm build` 통과
- `corepack pnpm multi-agent:guard` 통과
- `git diff --check` 통과

## 남은 리스크
- [사실] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [미확인] `/planning/v3/categories/rules` 브라우저 조작 e2e는 이번 라운드에서 실행하지 않았습니다. 인접 API/store/guard 테스트와 전체 lint/test/build로 계약을 확인했습니다.
- [미확인] 원격 GitHub Actions는 계정 과금/사용 한도 문제로 최신 head의 원격 PASS를 확인하지 못할 수 있습니다.
- [사실] 이번 변경은 category rules client 초기 로딩 경로에 한정되며, rules API route/store 계약은 변경하지 않았습니다.

## 다음 라운드
- manager 권고에 따라 `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`를 우선 확인합니다.
- 후속 후보는 `src/app/planning/v3/accounts/_components/AccountsClient.tsx`이며, opening balance 연동 API 면적이 넓어 targeted 테스트 매핑을 먼저 유지합니다.
- shared workspace hook, ops dashboard controller, recommend page는 영향 범위가 넓어 route-local 후보를 줄인 뒤 재평가합니다.
