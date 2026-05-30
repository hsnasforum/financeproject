# 2026-05-30 Transactions batch list React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: batch list 표면에서 `createdAt`, stored-first 조회 의미, 목록 payload 모양을 유지해야 하는 범위를 확인했습니다.
- `planning-gate-selector`: route/page 변경 없이 React effect 경고 축소에 필요한 최소 검증 세트를 골랐습니다.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크, 다음 라운드를 기록하는 종료 노트 형식에 맞췄습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` 경고가 `TransactionsBatchListClient`의 mount effect에서 `loadRows()`를 직접 호출하는 흐름에 남아 있었습니다.
- mount effect 안의 동기 상태 업데이트를 줄이면서 배치 목록 데이터 계약과 사용자 노출 흐름은 유지해야 했습니다.

## 핵심 변경
- 배치 목록 조회를 `loadRowsData()` fetch-only 함수와 `applyRowsResult()`/`applyRowsFailure()` 상태 반영 함수로 분리했습니다.
- 계좌 조회를 `loadAccountsData()` fetch-only 함수와 `applyAccountsResult()` 상태 반영 함수로 분리했습니다.
- mount effect는 `AbortController`와 `active` guard를 사용해 await 이후에만 상태를 반영하도록 바꿨습니다.
- 배치 row projection은 기존처럼 `createdAt`, `kind: "csv"`, 선택적 `fileName`, `total/ok/failed` 숫자 변환을 유지했습니다.
- 수동 새로고침과 업로드 후 갱신 경로는 기존 `loadRows()` 흐름을 유지했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: 경고 1건, `void loadRows()` 호출부.
  - 변경 후: PASS, messages `[]`.
- `corepack pnpm exec vitest run tests/planning-v3-transactions-batches-ui.test.tsx tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts`
  - PASS, 4 files / 42 tests.
- `mkdir -p tmp && corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-transactions-batch-list.json`
  - PASS, 남은 경고 41건 / 34파일, 현재 target 없음.
  - 다음 상위 잔여 파일: `src/app/products/catalog/page.tsx`, `src/app/products/compare/page.tsx`, `src/app/recommend/page.tsx`, `src/components/AuditLogCard.tsx`, `src/components/AutoMergeClient.tsx`.
- `git diff --check`
  - PASS.
- `corepack pnpm lint`
  - PASS.
- `corepack pnpm test`
  - PASS, 663 files / 2035 tests.
- `corepack pnpm build`
  - PASS.
- `find . -maxdepth 1 -type d -name '.next-build-*' -print`
  - PASS, 남은 임시 build 디렉터리 없음.
- `corepack pnpm multi-agent:guard`
  - PASS, latestWorkNote=`work/5/30/2026-05-30-transactions-batch-list-react-compiler.md`.

## 남은 리스크
- [가정] 현재 page route는 `initialRows`/`initialAccounts`를 실사용 초기 데이터로 주입하지 않으므로 mount refresh 시작 시 로딩 상태를 즉시 true로 되돌리지 않아도 사용자 흐름 변화가 없습니다.
- [검증 필요] 향후 SSR initial data를 주입하는 경로가 추가되면 background refresh 중 로딩 표시 정책을 별도로 정해야 합니다.
- 원격 GitHub Actions는 이전 커밋들에서 billing/spending-limit로 보이는 즉시 실패 패턴이 반복되어, 이번 커밋도 로컬 검증이 주된 근거가 될 가능성이 높습니다.

## 다음 라운드
- `react-hooks/set-state-in-effect` 잔여 상위 파일인 `src/app/products/catalog/page.tsx`부터 별도 manager 라운드로 조사합니다.
