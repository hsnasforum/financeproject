# 2026-05-27 Batches Center React Compiler 경고 축소

## 수정 대상 파일
- `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`
- `work/5/27/2026-05-27-batches-center-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: planning v3 batch center 변경에 필요한 최소 검증 세트를 선정했습니다.
- `work-log-closeout`: 변경 파일, 검증, 잔여 리스크를 `/work` 종료 기록으로 정리했습니다.

## 변경 이유
- one-off React Compiler scan에서 `BatchesCenterClient`의 mount effect가 `loadRows()`를 호출하며 `set-state-in-effect` 경고 1건을 만들었습니다.
- 해당 컴포넌트는 `/planning/v3/batches` route-local client이고, batch center UI/API 테스트가 있어 작은 단위로 검증 가능한 범위였습니다.
- 수동 새로고침, 초안 생성, 배치 상세 링크, 기존 selector 계약은 유지하면서 초기 로드 경고만 줄이는 방식으로 수정했습니다.

## 핵심 변경
- 배치 목록 응답 정규화와 정렬을 `normalizeBatchRows()` helper로 분리했습니다.
- fetch와 응답 검증만 담당하는 `fetchRows()` callback을 추가했습니다.
- mount effect는 `AbortController`와 `active` guard를 사용해 초기 로드 완료 후에만 state를 갱신합니다.
- 수동 새로고침용 `loadRows()`는 기존 로딩/메시지 동작을 유지하되 `fetchRows()`를 재사용합니다.
- one-off scan 결과는 57건/50파일에서 56건/49파일로 줄었고, 대상 파일 경고는 0건입니다.

## 검증
- PASS: `corepack pnpm exec eslint src/app/planning/v3/batches/_components/BatchesCenterClient.tsx --rule react-hooks/set-state-in-effect:error`
- PASS: `corepack pnpm exec vitest run tests/planning-v3-batch-center-ui.test.tsx tests/planning-v3-batch-center-api.test.ts`
- PASS: `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-batches-center.json`
- PASS: one-off scan 집계 `total=56`, `files=49`, `target=[]`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm test` (`663 files`, `2035 tests`)
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm multi-agent:guard`
- PASS: `git diff --check`

## 남은 리스크
- `react-hooks/set-state-in-effect` one-off rule은 기본 lint gate가 아니므로, 후속 라운드에서 계속 별도 스캔으로 추적해야 합니다.
- href, redirect, selector, 사용자 플로우를 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.
- GitHub Actions remote checks는 이전 최신 head와 동일하게 billing/spending limit 계열 실패로 보이며, 로컬 검증 결과와 별도로 PR 본문에 상태를 유지해야 합니다.

## 다음 라운드 우선순위
- `src/app/planning/v3/accounts/_components/AccountsClient.tsx`의 남은 경고 1건을 우선 확인합니다.
- 그 다음 `src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx` 또는 `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`처럼 planning v3 route-local client를 작은 단위로 축소합니다.
- 공유 hook 계열은 blast radius가 크므로 route-local 경고를 더 줄인 뒤 별도 라운드로 다룹니다.
