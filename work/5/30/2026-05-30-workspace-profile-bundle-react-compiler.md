# 2026-05-30 Workspace Profile Bundle React Compiler 경고 축소

## 변경 파일
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `work/5/30/2026-05-30-workspace-profile-bundle-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록의 다음 우선순위와 이번 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: planning workspace profile hook 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `useWorkspaceProfileBundle`가 초기 선택 프로필 복원 effect와 beginner mode 목표 자동 보강 effect에서 즉시 state update를 수행해 `react-hooks/set-state-in-effect` 경고 2건을 만들었습니다.
- `/planning` 워크스페이스의 프로필 선택, 프로필 hydration, beginner 목표 보강 의미는 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 초기 프로필 ID 결정, 선택 프로필 warmup, 프로필 목록 로드를 `window.setTimeout(..., 0)`으로 다음 macrotask에 예약하고 cleanup에서 취소하도록 바꿨습니다.
- beginner mode 목표 자동 보강도 다음 macrotask로 예약했습니다.
- 예약된 beginner 목표 보강 전에 사용자가 프로필을 편집하면 낡은 자동 보강이 적용되지 않도록 local edit version guard를 추가했습니다.
- 프로필 API, 저장/삭제 흐름, profile JSON/editor 변환, route, href, selector, env, 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/planning/workspace/useWorkspaceProfileBundle.ts --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: 초기 선택 프로필 복원 effect와 beginner 목표 자동 보강 effect에서 경고 2건 확인.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec vitest run tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/profileFormModel.test.ts tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceControllerUtils.test.ts`
  - PASS. 4개 파일 / 38개 테스트 통과.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-workspace-profile-bundle.json`
  - PASS. 전체 잔여 경고: 1건 / 1개 파일.
  - 이번 대상 파일 `src/components/planning/workspace/useWorkspaceProfileBundle.ts` 경고 없음.
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
- 초기 프로필 선택 복원과 beginner 목표 자동 보강이 다음 macrotask로 지연됩니다. 사용자 노출 의미는 유지되지만, mount 직후 동기 선택/보강을 가정하는 새 테스트가 추가되면 비동기 대기가 필요합니다.
- 프로필 API, 저장/삭제 플로우, 프로필 JSON 변환, route, href, env, profile payload 의미는 변경하지 않았습니다.

## 다음 라운드 우선순위
- `src/components/planning/workspace/useWorkspaceSnapshotSelectionBundle.ts`의 마지막 `react-hooks/set-state-in-effect` 경고 1건을 기준선으로 확인합니다.
- snapshot selection bundle 변경이면 planning workspace snapshot 관련 테스트와 `pnpm lint`, `pnpm test`, `pnpm build`를 최소 검증 후보로 검토합니다.
