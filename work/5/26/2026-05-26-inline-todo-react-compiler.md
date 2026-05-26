# 2026-05-26 Inline Todo React Compiler 경고 축소

## 변경 파일
- `src/components/InlineTodoEditor.tsx`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기록 기준으로 기본 구현/검증 skill 조합 확인
- planning-gate-selector: 독립 클라이언트 컴포넌트 변경에 필요한 lint/test/build 검증 세트 선정
- work-log-closeout: `/work` 종료 기록 형식 확인

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `InlineTodoEditor`의 prop 기반 로컬 상태 동기화와 저장 상태 reset effect 2건이 남아 있었습니다.
- 외부 API나 route 계약 없이 로컬 상태만 다루는 작은 컴포넌트라 다음 안전 후보로 선정했습니다.

## 핵심 변경
- `item` prop을 priority, dueDate, tasks 로컬 상태에 반영하는 effect를 0ms timer와 cleanup으로 감쌌습니다.
- `disabled` 또는 patch 없음 상태에서 `saving`을 reset하는 effect도 0ms timer cleanup으로 정리했습니다.
- `onPatch` debounce, payload shape, selector, UI 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/InlineTodoEditor.tsx --rule react-hooks/set-state-in-effect:error`
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-inline-todo.json`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- [미확인] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [미확인] `InlineTodoEditor`는 현재 `src`, `tests`, `planning`, `docs` 검색 기준 직접 소비처가 확인되지 않았습니다. 그래서 컴포넌트 전용 e2e나 targeted UI 테스트는 실행하지 않았습니다.
- [검증 필요] 커밋/푸시 후 원격 GitHub Actions 결과를 별도로 확인해야 합니다.

## 다음 라운드
- 잔여 `react-hooks/set-state-in-effect` 경고는 66건/55파일입니다. 다음 후보는 `src/components/data/DataFreshnessBanner.tsx`, `src/components/DoctorSummaryCard.tsx`, `src/components/Gov24Client.tsx`처럼 파일당 2건이 남은 컴포넌트 중 테스트 커버리지가 있는 파일부터 선정합니다. `/recommend`는 public stable 핵심 경로라 뒤 순위로 둡니다.
