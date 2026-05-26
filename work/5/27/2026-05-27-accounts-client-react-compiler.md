# 2026-05-27 Accounts Client React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/accounts/_components/AccountsClient.tsx`
- `work/5/27/2026-05-27-accounts-client-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: planning v3 accounts client 변경에 필요한 one-off lint, 계좌/초기잔액 store/API 테스트, 전체 lint/test/build 검증 세트를 골랐습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 명령, 잔여 리스크, 다음 라운드 후보를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `AccountsClient`의 초기 `loadAccounts()` effect 1건이 남아 있었습니다.
- `/planning/v3/accounts`는 route-local client라 shared hook보다 영향 범위가 작고, accounts/opening balances store/API/remote-host 테스트로 데이터 계약을 확인할 수 있었습니다.
- 계좌 생성, 수정, 삭제, 초기잔액 저장 후 새로고침 흐름은 유지하면서 초기 로드 경고만 줄이는 방식으로 수정했습니다.

## 핵심 변경
- 계좌와 초기잔액 응답을 화면 state로 변환하는 `AccountsSnapshot` helper를 추가했습니다.
- fetch와 응답 검증만 담당하는 `fetchAccounts()` callback을 추가했습니다.
- 수동 새로고침에 쓰이는 `loadAccounts()`는 기존 loading/message 동작을 유지하면서 `fetchAccounts()` 결과를 적용합니다.
- 초기 mount effect는 `AbortController`와 `active` guard를 사용해 fetch 완료 뒤에만 계좌/초기잔액 state를 갱신합니다.
- one-off 잔여 경고는 56 warnings / 49 files에서 55 warnings / 48 files로 줄었고, `AccountsClient.tsx`는 0 warnings가 됐습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/accounts/_components/AccountsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` 확인: 변경 전 1 warning
- `corepack pnpm exec eslint src/app/planning/v3/accounts/_components/AccountsClient.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/planning-v3-accountsStore.test.ts tests/planning-v3-openingBalancesStore.test.ts tests/planning-v3-opening-balances-api.test.ts tests/planning-v3-accounts-profile-remote-host-api.test.ts tests/planning-v3-accounts-write-remote-host-api.test.ts` 통과: 5 files / 10 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-accounts-client.json` 통과: 잔여 55 warnings / 48 files, `AccountsClient.tsx` 0 warnings
- `corepack pnpm lint` 통과
- `corepack pnpm test` 1차 실패: 이전 build timeout에서 남은 `.next-build-3683689/standalone` 산출물이 Vitest 대상에 포함됐고, `tests/planning/ops/backup-api.test.ts` delta timestamp assertion 1건이 함께 실패
- `corepack pnpm cleanup:next-artifacts` 통과: stale `.next-build-3683689` 제거
- `corepack pnpm exec vitest run tests/planning/ops/backup-api.test.ts` 재실행 통과: 1 file / 11 tests
- `corepack pnpm test` 재실행 통과: 663 files / 2035 tests
- `corepack pnpm build` 통과
- `corepack pnpm multi-agent:guard` 통과
- `git diff --check` 통과

## 남은 리스크
- [사실] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [미확인] `/planning/v3/accounts` 브라우저 조작 e2e는 이번 라운드에서 실행하지 않았습니다. route-local state 구조 변경이며 href/redirect/selector 변경은 없어 targeted store/API 테스트와 전체 lint/test/build로 확인했습니다.
- [사실] 1차 전체 test 실패는 stale `.next-build-3683689` 산출물과 backup timestamp 단건이었고, 산출물 제거와 단건/전체 재실행에서 통과했습니다.
- [미확인] 원격 GitHub Actions는 계정 과금/사용 한도 문제로 최신 head의 원격 PASS를 확인하지 못할 수 있습니다.

## 다음 라운드
- one-off scan 상단의 `src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx`를 우선 확인합니다.
- 후속 후보는 `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`와 `src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx`입니다.
- planning v3 news/settings client와 shared workspace hooks는 route-local 후보를 더 줄인 뒤 별도 라운드로 다룹니다.
