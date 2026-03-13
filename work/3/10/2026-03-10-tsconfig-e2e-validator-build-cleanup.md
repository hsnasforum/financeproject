# 2026-03-10 tsconfig e2e validator build cleanup

### 변경 파일

- `tsconfig.json`

### 변경 이유

- `pnpm build`가 앱 코드가 아니라 Playwright dev distDir에 남아 있는 `.next-e2e*/dev/types/*` generated 파일을 타입체크하다가 실패했다.
- `PLAYWRIGHT_DIST_DIR`용 include는 유지하되, stale dev validator가 production build를 막지 않도록 범위를 좁혀야 했다.

### 핵심 변경

- `tsconfig.json`의 `exclude`에 `.next-e2e*/dev/types/**/*`를 추가했다.
- `.next-e2e*/dev/types` include는 유지해 Next dev가 tsconfig를 다시 더럽히는 경로는 막되, production build에서는 Playwright용 dev generated type tree를 검사하지 않게 했다.

### 검증

- `pnpm build`
- `pnpm test tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/workspaceResultInsights.test.ts tests/planning/ui/workspaceAssumptionsEditor.test.ts tests/planning/ui/workspaceDebtOffersEditor.test.ts tests/planning/ui/profileFormModel.test.ts tests/planning/ui/runPipeline.test.ts tests/planning/ui/workspaceUiState.test.ts`

### 남은 리스크

- `.next-e2e*/dev/types/validator.ts` 자체가 왜 불완전하게 남는지는 별도 원인 추적이 필요하다.
- 현재 수정은 build blocker 제거에 집중했고, `PlanningWorkspaceClient`의 남은 local state 정리 작업은 아직 시작 전이다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
