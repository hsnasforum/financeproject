# 2026-03-12 home action summary report quickstart closeout

## 변경 파일
- `src/app/page.tsx`
- `src/components/home/TodayQueue.tsx`
- `src/components/HomePortalClient.tsx`
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `src/components/PlanningReportDetailClient.tsx`
- `src/app/planning/_lib/workspaceQuickStart.ts`
- `src/app/planning/_lib/planningQuickStart.ts`
- `src/components/planning/PlanningQuickStartGate.tsx`
- `tests/planning/ui/workspaceQuickStart.test.ts`
- `tests/planning/ui/planningQuickStart.test.ts`
- `tests/planning/reports/reportDashboardOverrides.test.tsx`

## 사용 skill
- `planning-gate-selector`: 홈/리포트 UI와 `/planning` 진입 흐름을 함께 건드리는 배치에서 `targeted vitest + eslint + build + e2e:rc`까지 필요한 검증만 고르기 위해 사용
- `work-log-closeout`: 이번 라운드의 실제 변경과 실제 검증 결과를 `/work` 형식에 맞춰 정리하기 위해 사용

## 변경 이유
- 홈은 최근 실행이 있어도 정적 큐 카드 비중이 높아 `지금 뭘 해야 하는지`가 약했고, 리포트 상단은 핵심 수치와 액션이 여러 카드로 분산돼 첫 이해 비용이 컸습니다.
- `/planning`은 beginner 흐름이 이미 있었지만, 월 수입/고정지출/목표 1개만으로 시작하는 더 얇은 front-door가 없어 기획서 기준의 `간단 시작` 진입을 바로 검증하기 어려웠습니다.

## 핵심 변경
- 홈 `TodayQueue`가 저장된 최신 run이 있을 때 `오늘의 액션 1개 + 월 잉여금/비상금 버팀력/경고 신호` 3개를 동적으로 보여주고, 없을 때만 기존 static quick path를 유지하도록 바꿨습니다.
- `HomePortalClient` 상단에도 같은 액션을 요약해 `최근 플랜 -> 리포트 -> 혜택` 흐름보다 먼저 `액션부터 보기`를 노출했습니다.
- `ReportDashboard` 첫 카드를 `4개 핵심 상태 + 액션 설명 + 계산 기준/가정` 구조로 올리고, detail 페이지 overview에서 중복되던 verdict 카드는 제거해 상단을 압축했습니다.
- `PlanningQuickStartGate`와 `planningQuickStart` 매퍼를 추가해 beginner 모드에서 월 수입, 고정지출, 목표 1개만 입력해 기존 wizard output으로 바로 주입할 수 있게 했습니다.
- 기존 `workspaceQuickStart` 문구도 `간단 시작 -> 실행 -> 저장` 흐름에 맞게 조정했습니다.

## 검증
- `pnpm exec vitest run tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStart.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx`
- `pnpm exec eslint src/app/page.tsx src/components/home/TodayQueue.tsx src/components/HomePortalClient.tsx src/app/planning/reports/_components/ReportDashboard.tsx src/components/PlanningReportDetailClient.tsx src/app/planning/_lib/workspaceQuickStart.ts src/app/planning/_lib/planningQuickStart.ts src/components/planning/PlanningQuickStartGate.tsx tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStart.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx`
- `pnpm build`
- `pnpm e2e:rc`
- `git diff --check -- src/app/page.tsx src/components/home/TodayQueue.tsx src/components/HomePortalClient.tsx src/app/planning/reports/_components/ReportDashboard.tsx src/components/PlanningReportDetailClient.tsx src/app/planning/_lib/workspaceQuickStart.ts src/app/planning/_lib/planningQuickStart.ts src/components/planning/PlanningQuickStartGate.tsx tests/planning/ui/workspaceQuickStart.test.ts tests/planning/ui/planningQuickStart.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx`

## 남은 리스크
- 홈 액션 요약은 현재 latest successful/partial run 기준이라, 저장 run이 없거나 실패 run만 있을 때는 기존 static 진입 카드로 fallback 됩니다. 이 fallback은 의도된 동작이지만 개인화는 아직 없습니다.
- `PlanningQuickStartGate`는 첫 라운드라서 저장 모델을 새로 만들지 않고 기존 wizard output에 기본값을 주입하는 방식입니다. 미리보기/수락 분리는 다음 라운드에서 별도 설계가 필요합니다.
- 이번 배치는 route/href 자체를 바꾸지 않아 `docs/current-screens.md`는 건드리지 않았습니다. 이후 quick preview 저장 흐름이 추가되면 route SSOT 검토가 다시 필요합니다.

## 다음 작업
- 홈 액션 요약과 리포트 상단 압축을 바탕으로 `today action -> report detail -> benefits follow-through`가 실제 사용자 클릭에서 더 자연스러운지 추가 관찰합니다.
- 다음 라운드에서는 `PlanningQuickStartGate`가 만든 초안에 quick rules 요약을 붙일지, 아니면 기존 simulate 결과를 더 앞에서 보여줄지 판단합니다.
