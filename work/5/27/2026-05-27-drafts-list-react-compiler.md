# 2026-05-27 Drafts List React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
- `work/5/27/2026-05-27-drafts-list-client-react-hooks-plan.md`
- `work/5/27/2026-05-27-drafts-list-react-compiler.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: draft/profile 계열 계약을 변경하지 않고 route-local client 초기 로드 경계만 조정할 범위를 확인했습니다.
- `planning-gate-selector`: draft 목록 UI/API 흐름, one-off lint, 전체 lint/test/build, multi-agent guard 검증 세트를 골랐습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 잔여 리스크, 다음 라운드 후보를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `DraftsListClient`의 초기 `loadDrafts()` effect 1건이 남아 있었습니다.
- 이 화면은 `/planning/v3/drafts` route-local client이며, 초안 목록/삭제/업로드 API shape와 draft/profile 저장 계약은 별도 테스트로 확인되는 영역입니다.
- 이번 라운드는 API, route, href, payload shape를 바꾸지 않고 초기 mount effect의 fetch/commit 경계만 분리했습니다.

## 핵심 변경
- 초안 목록 조회를 `fetchDrafts()` callback으로 분리하고, `AbortSignal`을 주입할 수 있게 했습니다.
- 수동 새로고침용 `loadDrafts()`는 기존 loading/message 동작을 유지하면서 `fetchDrafts()`를 재사용합니다.
- 초기 mount effect는 `AbortController`와 `active` guard를 사용해 fetch 완료 뒤에만 rows/message/loading state를 갱신합니다.
- 업로드 preview/import, 삭제, CSRF 처리, 초안 목록 API 응답 계약은 변경하지 않았습니다.
- one-off 잔여 경고는 54 warnings / 47 files에서 53 warnings / 46 files로 줄었고, `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`는 targeted rule 기준 0 warnings가 됐습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/drafts/_components/DraftsListClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` 경고 1건 확인
- `corepack pnpm exec eslint src/app/planning/v3/drafts/_components/DraftsListClient.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts tests/planning-v3/api-drafts-route.test.ts tests/planning-v3/api-drafts-id-route.test.ts tests/planning-v3/api-drafts-create-from-import.test.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts` 통과: 7 files / 22 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-drafts-list-client.json` 통과: 잔여 53 warnings / 46 files
- `corepack pnpm lint` 1차 실행은 120초 제한으로 결과 없이 timeout, 2차 실행 통과
- `corepack pnpm test` 통과: 663 files / 2035 tests
- `corepack pnpm build` 통과
- `corepack pnpm multi-agent:guard` 통과
- `git diff --check` 통과

## 남은 리스크
- [사실] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [사실] `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`에는 별도 경고 1건이 남아 있습니다.
- [미확인] `/planning/v3/drafts` 브라우저 조작 e2e는 이번 라운드에서 실행하지 않았습니다. href/redirect/selector/API shape 변경은 없어 targeted UI/API 테스트와 전체 lint/test/build로 확인했습니다.
- [미확인] 원격 GitHub Actions는 계정 과금/사용 한도 문제로 최신 head의 원격 PASS를 확인하지 못할 수 있습니다.

## 다음 라운드
- one-off scan 상단의 `src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx` 또는 `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`를 우선 확인합니다.
- planning v3 news route-local clients는 route-local 후보를 더 줄인 뒤 묶어서 다룹니다.
- shared hooks와 news settings controller는 화면별 client 경고를 더 줄인 뒤 별도 라운드로 분리합니다.
