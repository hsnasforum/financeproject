# 2026-05-30 Workspace Execution Options React Compiler 경고 축소

## 변경 파일
- `src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts`
- `work/5/30/2026-05-30-workspace-execution-options-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록의 다음 우선순위와 이번 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: planning workspace hook/controller 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `useWorkspaceExecutionOptionsBundle`가 서버 비활성화/헬스 상태에 따른 실행 옵션 강제 보정 effect와 beginner mode localStorage 복원 effect에서 즉시 state update를 수행해 `react-hooks/set-state-in-effect` 경고 2건을 만들었습니다.
- `/planning` 워크스페이스의 실행 옵션, beginner mode, 저장소 복원 의미는 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 실행 옵션 강제 보정 effect에서 변경 여부를 먼저 계산하고, 실제 setter 호출은 `window.setTimeout(..., 0)`으로 다음 macrotask에 예약했습니다.
- beginner mode localStorage 복원과 loaded 표시도 다음 macrotask로 예약하고 cleanup에서 취소하도록 바꿨습니다.
- planning 실행 payload, feature flag 판정, beginner/advanced 전환 helper, route, href, selector, env, 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: 실행 옵션 강제 보정 effect와 beginner mode 복원 effect에서 경고 2건 확인.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec vitest run tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/planningWorkspaceClientMode.test.ts tests/planning/ui/workspaceUiState.test.ts tests/planning/ui/workspaceControllerUtils.test.ts`
  - PASS. 4개 파일 / 14개 테스트 통과.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-workspace-execution-options-bundle.json`
  - PASS. 전체 잔여 경고: 3건 / 2개 파일.
  - 이번 대상 파일 `src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts` 경고 없음.
- `git diff --check`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/planning` 경로 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- 실행 옵션 강제 보정과 beginner mode 복원이 다음 macrotask로 지연됩니다. 사용자 노출 의미는 유지되지만, mount 직후 동기 상태 보정을 가정하는 새 테스트가 추가되면 비동기 대기가 필요합니다.
- planning 실행 payload 구성, route, href, env, feature flag 정책, beginner/advanced 전환 helper 자체는 변경하지 않았습니다.

## 다음 라운드 우선순위
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`의 `react-hooks/set-state-in-effect` 경고 2건을 기준선으로 확인합니다.
- profile bundle 변경이면 planning workspace profile 관련 테스트와 `pnpm lint`, `pnpm test`, `pnpm build`를 최소 검증 후보로 검토합니다.
