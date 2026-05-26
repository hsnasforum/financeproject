# 2026-05-27 Exposure Profile React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx`
- `work/5/27/2026-05-27-exposure-profile-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: exposure profile client/API/write guard 영향에 맞는 target eslint, API 테스트, 전체 lint/test/build 검증 세트를 골랐습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 잔여 리스크, 다음 라운드 후보를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `ExposureProfileClient`의 초기 `load()` effect 1건이 남아 있었습니다.
- 이 화면은 `/planning/v3/exposure` route-local client이며, `/api/planning/v3/exposure/profile` GET/POST payload shape와 write guard 계약은 별도 테스트로 확인되는 영역입니다.
- 이번 라운드는 API, route, href, payload shape를 바꾸지 않고 초기 mount effect의 fetch/commit 경계만 분리했습니다.

## 핵심 변경
- 노출 프로필 GET 요청을 `fetchProfile()` callback으로 분리하고, `AbortSignal`을 주입할 수 있게 했습니다.
- 초기 mount effect는 `AbortController`와 `active` guard를 사용해 fetch 완료 뒤에만 draft/initialDraft/savedAt/error/loading state를 갱신합니다.
- 저장 POST, CSRF 처리, profile/draft 변환, summary card 계산, 사용자 경로는 변경하지 않았습니다.
- one-off 잔여 경고는 53 warnings / 46 files에서 52 warnings / 45 files로 줄었고, `ExposureProfileClient.tsx`는 targeted rule 기준 0 warnings가 됐습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` 경고 1건 확인
- `corepack pnpm exec eslint src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/planning-v3-exposure-api.test.ts tests/planning-v3-write-route-guards.test.ts` 통과: 2 files / 8 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-exposure-profile-client.json` 통과: 잔여 52 warnings / 45 files
- `corepack pnpm lint` 통과
- `corepack pnpm test` 통과: 663 files / 2035 tests
- `corepack pnpm build` 통과
- `corepack pnpm multi-agent:guard` 통과
- `git diff --check` 통과

## 남은 리스크
- [사실] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [사실] 이번 변경은 client-side load timing에 한정되며, exposure profile API/저장 계약은 변경하지 않았습니다.
- [미확인] `/planning/v3/exposure` 브라우저 조작 e2e는 이번 라운드에서 실행하지 않았습니다. href/redirect/selector/API shape 변경은 없어 targeted API/guard 테스트와 전체 lint/test/build로 확인했습니다.
- [미확인] 원격 GitHub Actions는 계정 과금/사용 한도 문제로 최신 head의 원격 PASS를 확인하지 못할 수 있습니다.

## 다음 라운드
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx` 또는 planning v3 news route-local clients의 남은 one-off 경고를 우선 확인합니다.
- shared hooks와 news settings controller는 화면별 client 경고를 더 줄인 뒤 별도 라운드로 분리합니다.
