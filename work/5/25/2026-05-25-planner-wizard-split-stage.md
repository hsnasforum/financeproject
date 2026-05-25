# 2026-05-25 planner wizard split stage

## 변경 파일
- `src/components/PlannerWizard.tsx`
- `src/components/plannerWizard/shared.ts`
- `src/components/plannerWizard/steps.tsx`
- `src/components/plannerWizard/surfaces.tsx`
- `tests/planner-wizard-ui.test.tsx`

## 사용 skill
- `planning-gate-selector`: planner wizard 컴포넌트 분리에 맞춰 lint, focused UI test, typecheck 검증을 선택하는 데 사용.
- `work-log-closeout`: 실제 변경 파일과 실행 검증을 이번 stage 기록 형식에 맞추는 데 사용.

## 변경 이유
- `PlannerWizard.tsx`가 입력 상태, 단계별 화면, 사이드바, 히스토리/트렌드 UI, quick view 연결을 모두 포함해 변경 영향 범위가 컸다.
- 단계별 UI와 공용 helper를 분리해 wizard shell은 상태 조립과 action wiring만 담당하도록 줄일 필요가 있었다.

## 핵심 변경
- wizard 기본값, step metadata, quick view 해석, 금액 포맷 helper를 `plannerWizard/shared.ts`로 분리했다.
- 목표/분석/대안/실행/모니터링 단계 UI를 `plannerWizard/steps.tsx`로 이동했다.
- 사이드바, 하단 내비게이션, mascot guide, snapshot history/trend 표면을 `plannerWizard/surfaces.tsx`로 이동했다.
- `PlannerWizard.tsx`는 상태, plan 파생값, snapshot 저장/삭제, modal wiring 중심의 shell로 축소했다.
- SSR static markup 기반의 wizard shell 및 monitoring surface 테스트를 추가했다.

## 검증
- PASS: `corepack pnpm exec eslint src/components/PlannerWizard.tsx src/components/plannerWizard/shared.ts src/components/plannerWizard/steps.tsx src/components/plannerWizard/surfaces.tsx tests/planner-wizard-ui.test.tsx`
- PASS: `corepack pnpm test tests/planner-wizard-ui.test.tsx tests/planning/ui/planningQuickStart.test.ts tests/planning/ui/workspaceQuickStartHandoff.test.ts`
- PASS: `corepack pnpm exec tsc --noEmit`

## 남은 리스크
- `/planner` redirect와 legacy planner 전체 e2e는 이번 stage에서 별도 실행하지 않았다. 이 stage는 현재 사용 중인 wizard 컴포넌트 분리와 static render 계약에 한정했다.
- worktree에는 v3 news/balances/batches, scripts/docs, recovery/recommend 등 범위 밖 변경이 남아 있어 다음 stage에서도 pathspec 분리가 필요하다.
