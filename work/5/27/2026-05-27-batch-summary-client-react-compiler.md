# 2026-05-27 Batch Summary Client React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx`
- `work/5/27/2026-05-27-batch-summary-client-react-compiler.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: batch detail/summary reader 계약을 건드리지 않고 route-local client 초기 로드만 조정할 범위를 확인했습니다.
- `planning-gate-selector`: batch summary UI/API/service 테스트, one-off lint, 전체 lint/test/build 검증 세트를 골랐습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 잔여 리스크, 다음 라운드 후보를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `BatchSummaryClient`의 초기 `loadSummary()` effect 1건이 남아 있었습니다.
- 이 화면은 `/planning/v3/batches/[id]` route-local client이며, API payload shape와 `getBatchSummary()`의 stored-first/legacy fallback 계약은 이미 별도 테스트로 확인되는 영역입니다.
- 이번 라운드는 summary API나 service contract를 수정하지 않고, 초기 mount effect의 fetch/commit 경계만 분리했습니다.

## 핵심 변경
- summary 조회와 응답 검증을 `fetchSummary()` callback으로 분리했습니다.
- 수동 새로고침용 `loadSummary()`는 기존 loading/message 동작을 유지하면서 `fetchSummary()`를 재사용합니다.
- 초기 mount effect는 `AbortController`와 `active` guard를 사용해 fetch 완료 뒤에만 summary/message/loading state를 갱신합니다.
- 초안 생성 POST, summary payload shape, `initialSummary` 렌더링, batch summary API/service 계약은 변경하지 않았습니다.
- one-off 잔여 경고는 55 warnings / 48 files에서 54 warnings / 47 files로 줄었고, `BatchSummaryClient.tsx`는 0 warnings가 됐습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/planning-v3-batch-center-ui.test.tsx tests/planning-v3-batch-center-api.test.ts tests/planning-v3-getBatchSummary.test.ts tests/planning-v3-batches-import-csv-service.test.ts` 통과: 4 files / 25 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-batch-summary-client.json` 통과: 잔여 54 warnings / 47 files, `BatchSummaryClient.tsx` 0 warnings
- `corepack pnpm lint` 통과
- `corepack pnpm test` 통과: 663 files / 2035 tests
- `corepack pnpm build` 통과
- `corepack pnpm multi-agent:guard` 통과
- `git diff --check` 통과

## 남은 리스크
- [사실] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [사실] 이번 변경은 client-side load timing에 한정되며, stored-first reader, explicit legacy fallback, raw-versus-derived projection semantics는 변경하지 않았습니다.
- [미확인] `/planning/v3/batches/[id]` 브라우저 조작 e2e는 이번 라운드에서 실행하지 않았습니다. href/redirect/selector/API shape 변경은 없어 targeted UI/API/service 테스트와 전체 lint/test/build로 확인했습니다.
- [미확인] 원격 GitHub Actions는 계정 과금/사용 한도 문제로 최신 head의 원격 PASS를 확인하지 못할 수 있습니다.

## 다음 라운드
- one-off scan 상단의 `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`를 우선 확인합니다.
- 후속 후보는 `src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx`와 planning v3 news route-local clients입니다.
- shared hooks와 news settings controller는 route-local 후보를 더 줄인 뒤 별도 라운드로 다룹니다.
