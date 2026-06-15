# 2026-05-27 Profile Drafts List React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `work/5/27/2026-05-27-profile-drafts-list-set-state-plan.md`
- `work/5/27/2026-05-27-profile-drafts-list-react-compiler.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: profile drafts 표면에서 저장/적용 계약을 바꾸지 않고 route-local client 초기 로드만 조정할 범위를 확인했습니다.
- `planning-gate-selector`: profile draft list UI/API/write guard, one-off lint, 전체 lint/test/build 검증 세트를 골랐습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 잔여 리스크, 다음 라운드 후보를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `ProfileDraftsListClient`의 초기 `loadDrafts()` effect 1건이 남아 있었습니다.
- 이 화면은 `/planning/v3/profile/drafts` route-local client이며, profile draft 목록/생성/삭제/적용 API shape와 저장 계약은 별도 테스트로 확인되는 영역입니다.
- 이번 라운드는 API, route, href, payload shape를 바꾸지 않고 초기 mount effect의 fetch/commit 경계만 분리했습니다.

## 핵심 변경
- profile draft 목록 GET 요청을 `fetchDraftRows()` callback으로 분리하고, `AbortSignal`을 주입할 수 있게 했습니다.
- 초기 mount effect는 `AbortController`와 `active` guard를 사용해 fetch 완료 뒤에만 rows/loadFailed/message/loading state를 갱신합니다.
- 수동 새로고침, 생성 후 상세 이동, 삭제 후 목록 재조회는 기존 `loadDrafts()` 흐름을 유지하면서 `fetchDraftRows()`를 재사용합니다.
- 생성 POST, 삭제 DELETE, CSRF 처리, 링크, profile draft API 응답 계약은 변경하지 않았습니다.
- one-off 잔여 경고는 52 warnings / 45 files에서 51 warnings / 44 files로 줄었고, `ProfileDraftsListClient.tsx`는 targeted rule 기준 0 warnings가 됐습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` 경고 1건 확인
- `corepack pnpm exec eslint src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-write-route-guards.test.ts` 통과: 5 files / 33 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-profile-drafts-list-client.json` 통과: 잔여 51 warnings / 44 files
- `corepack pnpm lint` 통과
- `corepack pnpm test` 통과: 663 files / 2035 tests
- `corepack pnpm build` 통과
- `corepack pnpm multi-agent:guard` 1차 실패: 최신 `/work`가 계획 노트라 next round 항목이 없었습니다.
- `git diff --check` 통과

## 남은 리스크
- [사실] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [사실] 이번 변경은 client-side load timing에 한정되며, profile draft 저장/적용 API 계약과 링크는 변경하지 않았습니다.
- [미확인] `/planning/v3/profile/drafts` 브라우저 조작 e2e는 이번 라운드에서 실행하지 않았습니다. href/redirect/selector/API shape 변경은 없어 targeted UI/API/guard 테스트와 전체 lint/test/build로 확인했습니다.
- [미확인] 원격 GitHub Actions는 계정 과금/사용 한도 문제로 최신 head의 원격 PASS를 확인하지 못할 수 있습니다.

## 다음 라운드
- one-off scan 상단의 planning v3 news route-local clients를 우선 확인합니다.
- `src/components/RulesOpsClient.tsx`처럼 planning v3 외부 공용/ops client 경고는 route-local planning v3 후보를 더 줄인 뒤 별도 라운드로 다룹니다.
