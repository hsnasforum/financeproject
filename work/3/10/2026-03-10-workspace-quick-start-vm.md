# 2026-03-10 workspace quick start vm

### 변경 파일

- `src/app/planning/_lib/workspaceQuickStart.ts`
- `src/components/PlanningWorkspaceClient.tsx`
- `tests/planning/ui/workspaceQuickStart.test.ts`

### 변경 이유

- `PlanningWorkspaceClient` 안에 남아 있던 `liveSummary` 계산과 quick start 상태/문구 조립은 순수 UI 파생값이라 helper로 분리하기 쉬운 다음 후보였다.
- 저장된 run/result parser를 helper로 옮긴 흐름에 맞춰, 초보자 가이드 카드도 컴포넌트 밖 계산 경계로 고정했다.

### 핵심 변경

- `buildWorkspaceLiveSummary()`를 추가해 월 잉여금, 월상환액, DSR, 비상금 목표/부족분 계산을 분리했다.
- `buildWorkspaceQuickStartVm()`를 추가해 quick start title/description/tone, 저장된 run 리포트 href, 단계 완료 상태를 조립하도록 분리했다.
- `PlanningWorkspaceClient`는 해당 helper 결과만 소비하도록 정리했다.
- quick start/live summary 동작은 전용 테스트로 고정했다.

### 검증

- `pnpm test tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/workspaceUiState.test.ts`
- `pnpm exec eslint src/app/planning/_lib/workspaceQuickStart.ts src/components/PlanningWorkspaceClient.tsx tests/planning/ui/workspaceQuickStart.test.ts`

### 남은 리스크

- scenario/monte/actions/debt debug section 조립은 아직 `PlanningWorkspaceClient` 내부에 남아 있다.
- beginner mode 관련 copy/tone은 helper로 옮겼지만, 섹션 렌더링 자체는 여전히 컴포넌트 내부 조건 분기에 의존한다.
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
