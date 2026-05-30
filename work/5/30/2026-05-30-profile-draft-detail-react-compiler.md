# 2026-05-30 Profile draft detail React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- `work/5/30/2026-05-30-profile-draft-detail-react-compiler.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: planning v3 draft/profile 소비자 surface만 좁게 다루고 API payload 계약이나 writer owner를 바꾸지 않도록 범위를 확인했습니다.
- `planning-gate-selector`: React 훅/클라이언트 상세 화면 변경에 맞춰 target ESLint, profile draft UI/API 테스트, 전체 lint/test/build 검증을 선택했습니다.
- `work-log-closeout`: 실제 실행한 검증과 잔여 리스크를 `/work/5/30` closeout 형식으로 정리했습니다.

## 변경 이유
- `ProfileDraftDetailClient`의 mount effect가 `loadDetail()`을 호출했고, 해당 함수가 첫 await 전에 `setLoading`/`setMessage`를 실행해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/planning/v3/profile/drafts/[id]` 상세 화면의 초안 로딩, profile 목록 로딩, preflight/apply 초기화 동작은 유지하면서 effect 안의 동기 state commit 경계를 줄일 필요가 있었습니다.

## 핵심 변경
- `loadDetailData()`를 fetch 전용 함수로 분리해 draft detail과 profile 목록을 `DetailLoadResult`로 반환하게 했습니다.
- `applyDetailLoadResult()`를 추가해 성공 응답의 state commit과 preflight/apply 결과 초기화를 한곳에서 처리했습니다.
- mount effect는 `AbortController`와 active flag로 stale/unmount 응답을 방어하고, 결과를 받은 뒤에만 state를 반영하도록 바꿨습니다.
- 사용자 새로고침 버튼은 `reloadDetail()`을 통해 기존 loading/error 표시와 실패 fallback을 유지합니다.
- API payload shape, preflight/apply POST 경로, route/link 구조는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint 'src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx' --rule react-hooks/set-state-in-effect:warn -f json` — 변경 전 WARN 1건, line 288 `void loadDetail()`
- `corepack pnpm exec eslint 'src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx' --rule react-hooks/set-state-in-effect:warn -f json` — 변경 후 PASS, messages `[]`
- `corepack pnpm exec vitest run tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts` — PASS, 3 files / 28 tests
- `mkdir -p tmp && corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-profile-draft-detail.json` — PASS, 전체 스캔 43 warnings / 36 files, 대상 파일 0건
- `git diff --check` — PASS
- `corepack pnpm lint` — PASS
- `find . -maxdepth 1 -type d -name ".next-build-*" -print` — PASS, 잔여 `.next-build-*` 없음
- `corepack pnpm test` — PASS, 663 files / 2035 tests
- `corepack pnpm build` — PASS
- `corepack pnpm exec vitest run tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts` — PASS, 4 files / 19 tests
- `corepack pnpm multi-agent:guard` — PASS, latestWorkNote=`work/5/30/2026-05-30-profile-draft-detail-react-compiler.md`
- `git diff --check` — PASS

## 남은 리스크
- `react-hooks/set-state-in-effect` 전체 스캔은 아직 43 warnings / 36 files가 남아 있습니다. 이번 라운드 대상 `ProfileDraftDetailClient.tsx`는 목록에서 제거됐습니다.
- 브라우저 e2e는 실행하지 않았습니다. selector나 route/link 구조를 바꾸지 않았고, 관련 UI/API 테스트와 전체 build로 이번 변경 범위를 검증했습니다.
- 실제 네트워크가 느린 상태에서 새로고침 버튼을 연속 클릭하는 케이스는 request sequence guard까지는 추가하지 않았습니다. 이번 변경은 mount effect 경고 제거와 unmount abort 방어에 초점을 맞췄습니다.

## 다음 라운드
- manager 분해를 먼저 실행한 뒤 planning v3 잔여 경고 중 `src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx` 또는 `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx` 1건을 우선 검토합니다.
- batch/list 계열을 건드릴 경우 `planning-v3-batch-contract-narrowing` 적용 여부를 먼저 확인하고, 관련 route-local 테스트와 build 필요성을 다시 고릅니다.
