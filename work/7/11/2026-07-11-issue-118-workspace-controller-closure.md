# 2026-07-11 Issue #118 workspace controller 종료 audit

## 변경 파일

- `work/7/11/2026-07-11-issue-118-workspace-controller-closure.md`

## 사용 skill

- `planning-gate-selector`: React hook, planning UI controller, presenter와 사용자 흐름에 맞는 focused test·lint 및 기존 전체 gate 근거 선택
- `work-log-closeout`: 기존 구현, 최신 audit, 실행한 검증과 잔여 위험을 현재 날짜 종료 기록으로 정리

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/118
- closure audit 범위: https://github.com/hsnasforum/financeproject/issues/118#issuecomment-4942285896
- 기준 main: `910a5f05623031a757171ab981296e2f43195f55`
- 기존 구현 기록: `work/7/1/2026-07-01-planning-workspace-presenter-split.md`
- 2026-05-25 commit `2a0e4852f13c6e8a4a4b07deb4927acf93d6c475`에서 planning workspace를 controller, panel, profile, execution, snapshot, runtime bundle로 분리했습니다.
- 2026-07-02 commit `27e8152484e82afe2172e4d0aecd9481e4d26dc2`에서 execution guard, quick start, result/debug/tab view model을 pure presenter와 focused tests로 추가 분리했습니다.
- Issue가 계속 open이어서 현재 main의 실제 책임과 수용 기준을 다시 대조했습니다.

## 핵심 변경

- runtime state는 `useWorkspaceRuntimeStateBundle.ts`가 소유하고 controller는 이를 조립합니다.
- runtime action bundle은 run execution, optimize, profile sync, feedback submit action hook에 실제 lifecycle을 위임합니다.
- execution guard, quick start, result/debug/tab 파생값은 `workspacePresenters.ts`의 pure builder가 소유합니다.
- `PlanningWorkspaceClient`는 기존 `quickStart/profile/execution/results/dialogs/actions` 6개 group과 동일 panel 계층을 사용합니다.
- controller에 남은 health/normalization/snapshot/profile-sync 파생값, presenter 호출, 탭 보정 effect와 group 조립은 상위 orchestration 책임으로 판정했습니다.
- 새 측정 실패 없이 파일 크기만으로 wrapper를 추가하지 않았으며 runtime 코드는 변경하지 않았습니다.

## 검증

- `corepack pnpm vitest run tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspacePresenters.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts`: PASS, 7 files / 24 tests
- `corepack pnpm exec eslint src/components/PlanningWorkspaceClient.tsx src/components/planning/workspace/usePlanningWorkspaceController.tsx src/components/planning/workspace/useWorkspaceRuntimeBundle.ts src/components/planning/workspace/useWorkspaceRuntimeStateBundle.ts src/components/planning/workspace/useWorkspaceRunExecutionActions.ts src/components/planning/workspace/workspacePresenters.ts tests/planning/ui/workspaceControllerUtils.test.ts tests/planning/ui/workspaceExecutionOptionsBundle.test.ts tests/planning/ui/workspaceGroups.test.ts tests/planning/ui/workspacePresenters.test.ts tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts`: PASS
- 현재 main과 동일한 tree를 검증한 직전 라운드의 `corepack pnpm lint`: PASS
- 현재 main과 동일한 tree를 검증한 직전 라운드의 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- 현재 main과 동일한 tree를 검증한 직전 라운드의 `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- 현재 main과 동일한 tree를 검증한 직전 라운드의 `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 26 passed / 1 skipped
- 현재 main과 동일한 tree를 검증한 직전 라운드의 `corepack pnpm planning:v2:complete`: PASS
- 현재 main과 동일한 tree를 검증한 직전 라운드의 `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-I5OCQs`
- 현재 main과 동일한 tree를 검증한 직전 라운드의 `corepack pnpm planning:v2:regress`: PASS
- manager audit: Issue 수용 기준 충족, 추가 코드 변경 없이 종료 가능
- 독립 reviewer: actionable finding 없음, Issue 종료 가능 판정

## 남은 리스크

- `usePlanningWorkspaceController.tsx`는 755줄이지만 대부분 bundle 입력 조립, presenter 호출과 panel group adapter입니다. 현재 크기 자체를 결함으로 보지 않습니다.
- `useWorkspaceRuntimeActionsBundle`에는 baseline 조회, profile hash 동기화, 입력 파싱과 run polling lifecycle이 남아 있습니다. 측정된 변경 충돌이나 테스트 실패가 생기면 run polling을 다음 실제 분리 후보로 검토합니다.
- 독립 reviewer는 시간 제한으로 모든 action/presenter/test 파일을 끝까지 재검토하지 못했습니다. 메인 에이전트가 관련 파일을 직접 확인하고 focused 24 tests와 ESLint를 실행해 이 제한을 보완했습니다.
- controller public return shape, 사용자 selector와 흐름, public URL/API/응답 shape, DB schema/migration, Prisma query semantics, cache/revalidation은 변경하지 않았습니다.
- 이 PR은 closure 근거 문서만 추가하며 runtime rollback 대상은 없습니다. 문서 근거가 현재 코드와 달라지면 이 closeout만 수정하고 Issue를 다시 엽니다.

## 다음 라운드

1. docs-only PR과 GitHub Actions 상태를 확인하고 Issue #118에 수용 기준별 근거를 남겨 종료합니다.
2. 다음 open 구조 Issue는 #123 public API error/ops diagnostic이 현재 mapper와 tests로 이미 충족됐는지 먼저 audit합니다.
