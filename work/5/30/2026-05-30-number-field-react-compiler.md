# 2026-05-30 NumberField React Compiler 경고 축소

## 변경 파일
- `src/components/forms/NumberField.tsx`
- `work/5/30/2026-05-30-number-field-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록의 다음 우선순위와 이번 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: 공용 TSX 입력 컴포넌트 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `NumberField`가 외부 `value`를 formatted 문자열로 바꾼 뒤 `useEffect`에서 `setText(formatted)`를 즉시 호출해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- 이 컴포넌트는 `/housing/afford`의 숫자 입력 여러 곳에서 쓰이므로 입력 파싱, 빈 값 처리, blur 정규화는 유지하면서 경고만 줄이는 것이 목표였습니다.

## 적용 변경
- 내부 React state를 제거하고 `inputRef` 기반 uncontrolled input으로 바꿨습니다.
- 외부 `value` 변경 시에는 effect에서 input DOM value를 formatted 값으로 동기화합니다.
- 사용자가 숫자를 입력하거나 blur하면 기존처럼 쉼표 포맷을 즉시 반영하고 `onValueChange`를 호출합니다.
- route, href, selector, API contract, env, 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/forms/NumberField.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `setText(formatted)` 위치에서 경고 1건 확인.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec vitest run tests/housing-afford.test.ts tests/planner-compute.test.ts`
  - PASS. 2개 파일 / 15개 테스트 통과.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-number-field.json`
  - PASS. 전체 잔여 경고: 8건 / 5개 파일.
  - 이번 대상 파일 `src/components/forms/NumberField.tsx` 경고 없음.
- `git diff --check`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/housing/afford` 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- `NumberField`는 controlled input에서 uncontrolled input + ref 동기화로 바뀌었습니다. 기존 즉시 쉼표 포맷, 빈 값 null 처리, invalid raw 입력 보존은 유지되지만, 브라우저 selection/caret 위치는 실제 입력 조합에 따라 미세하게 다를 수 있습니다.
- 주 사용처는 `HousingAffordClient`이며, 숫자 입력 이벤트를 직접 다루는 전용 DOM 테스트는 아직 없습니다.

## 다음 라운드 우선순위
- `src/components/opsDashboard/useOpsDashboardController.ts`의 `react-hooks/set-state-in-effect` 경고 2건을 기준선으로 확인합니다.
- ops dashboard controller 변경이면 관련 ops dashboard/metrics 테스트와 `pnpm lint`, `pnpm test`, `pnpm build`를 최소 검증 후보로 검토합니다.
