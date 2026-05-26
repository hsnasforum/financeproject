# 2026-05-26 Balances React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/balances/_components/BalancesClient.tsx`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기록 기준으로 기본 구현/검증 skill 조합 확인
- planning-gate-selector: planning v3 balances UI 변경에 필요한 lint/test/build 검증 세트 선정
- planning-v3-batch-contract-narrowing: balances/monthly 소비 경로의 stored-first/legacy fallback 계약을 건드리지 않는 범위 확인
- work-log-closeout: `/work` 종료 기록 형식 확인

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `BalancesClient`의 초기 배치/계좌 조회와 월별 잔액 조회 effect 2건이 남아 있었습니다.
- public planning v3 balances 화면의 데이터 조회 흐름은 유지하면서 React Compiler 친화적인 effect 호출 패턴으로 정리할 필요가 있었습니다.

## 핵심 변경
- `loadBatchesAndAccounts()` effect 호출을 0ms timer와 cleanup으로 감싸 effect 내 즉시 상태 갱신 경고를 제거했습니다.
- `loadBalances()` effect 호출도 같은 timer cleanup 패턴으로 정리했습니다.
- API 계약, payload shape, route, href, selector, UI 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/balances/_components/BalancesClient.tsx --rule react-hooks/set-state-in-effect:error`
- `corepack pnpm exec vitest run tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-import-followthrough-ui.test.tsx`
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-balances.json`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- [미확인] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [검증 필요] 커밋/푸시 후 원격 GitHub Actions 결과를 별도로 확인해야 합니다.

## 다음 라운드
- 잔여 `react-hooks/set-state-in-effect` 경고는 74건/59파일입니다. 다음 후보는 `ImportCsvClient.tsx`, `JournalClient.tsx`, `src/app/recommend/page.tsx`처럼 파일당 2건이 남은 사용자 경로 중 테스트 커버리지가 있는 화면부터 선정합니다.
