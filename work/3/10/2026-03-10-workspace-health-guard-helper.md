# 2026-03-10 workspace health guard helper

### 변경 파일

- `src/app/planning/_lib/workspaceRunResult.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceRunResult.test.ts`

### 변경 이유

- `PlanningWorkspaceClient`는 `runResult.meta.health`를 직접 읽어 `saveBlockedByHealth`, 경고 문구, feedback health payload를 위한 상태를 계산하고 있었다.
- run record의 실제 health shape는 `warningsCodes`인데 UI 쪽 타입은 `warningCodes`를 기대하고 있어, 이 경계를 helper에서 정규화하는 편이 안전하다.

### 핵심 변경

- `workspaceRunResult.ts`에 health meta 정규화 로직을 추가해 `warningsCodes`와 `warningCodes` 입력을 모두 `WorkspaceHealthSummary.warningCodes`로 수렴시켰다.
- `buildWorkspaceHealthGuardState()`를 추가해 `summary`, `warnings`, `hasCriticalHealth`, `saveBlockedByHealth`, `disabledReason`을 한 번에 계산한다.
- `PlanningWorkspaceClient`는 raw `runResult.meta.health` 직접 useMemo 대신 health guard helper 결과를 소비한다.
- `workspaceRunResult.test.ts`에 health meta 정규화와 `SNAPSHOT_VERY_STALE` 차단 문구를 고정했다.

### 검증

- `pnpm test tests/planning/ui/workspaceRunResult.test.ts tests/planning/ui/runPipeline.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceRunResult.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceRunResult.test.ts`

### 남은 리스크

- `PlanningWorkspaceClient`에는 아직 `runResult.meta.snapshot` 직접 소비가 feedback/debug/outcomes 쪽에 남아 있다.
- 직접 컴포넌트 렌더 테스트는 아직 없다.
- 전체 `pnpm build`, 전체 `pnpm test`, `pnpm planning:v2:compat`, `pnpm e2e:rc`는 아직 미실행이다.

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
