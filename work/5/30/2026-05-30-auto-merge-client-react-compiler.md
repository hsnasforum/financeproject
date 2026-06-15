# 2026-05-30 AutoMergeClient React Compiler 경고 축소

## 요약
- `src/components/AutoMergeClient.tsx`의 `react-hooks/set-state-in-effect` 경고 1건을 제거했습니다.
- sessionStorage에 저장된 ARM 상태 복원 결과를 microtask 이후 active guard 안에서 state에 반영하도록 조정했습니다.
- `/ops/auto-merge` route, `/api/ops/auto-merge/eligibility` 계약, 서버 액션, DOM 문구, selector는 바꾸지 않았습니다.
- 전체 one-off scan 기준 잔여 경고는 35 warnings / 29 files입니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 skill 범위와 조건부 skill 제외 여부를 확인했습니다.
- `planning-gate-selector`: ops page client hook 변경에 맞는 최소/공통 검증 세트를 선택했습니다.
- `work-log-closeout`: 변경 내역, 검증, 리스크를 `/work` 종료 기록으로 남겼습니다.
- `route-ssot-check`, `dart-data-source-hardening`, `planning-v3-batch-contract-narrowing`: route/DART/batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 파일
- `src/components/AutoMergeClient.tsx`

## 검증
- `corepack pnpm exec eslint src/components/AutoMergeClient.tsx --rule react-hooks/set-state-in-effect:warn -f json` PASS, messages `[]`
- `corepack pnpm exec vitest run tests/auto-merge-arm-state.test.ts tests/auto-merge-eligibility-route.test.ts tests/auto-merge-action.test.ts tests/auto-merge.test.ts` PASS, 4 files / 37 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-auto-merge-client.json` PASS
- one-off scan 결과: 35 warnings / 29 files, target 포함 여부 `false`
- `git diff --check` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm test` PASS, 663 files / 2035 tests
- `corepack pnpm build` PASS
- `.next-build-*` 잔여 디렉터리 없음

## 남은 리스크
- ARM 복원 state 반영이 microtask 뒤로 이동하므로 `/ops/auto-merge` 첫 paint 직후 ARM 표시가 아주 짧게 늦어질 수 있습니다.
- 복원 계산과 sessionStorage pruning 입력은 유지했고, unmount 후 stale state 반영은 active guard로 차단했습니다.
- DOM, selector, route 계약 변경이 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- 잔여 `react-hooks/set-state-in-effect` 첫 후보는 `src/components/BenefitsClient.tsx` 1건입니다.
