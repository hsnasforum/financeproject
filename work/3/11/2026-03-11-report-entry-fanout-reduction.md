# 2026-03-11 reports 진입 fan-out 축소

## 수정 대상 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- `work/3/11/2026-03-11-multi-agent-parallel-e2e-task-list.md`

## 변경 이유
- `/planning/reports` 첫 진입에서 비핵심 섹션이 자동 mount 되며 `/api/products/candidates`, 혜택 API, 실시간 상품 탐색 API가 한 번에 붙었습니다.
- 현재 e2e는 첫 진입에서 heading, `report-dashboard`, `report-summary-cards`, `report-warnings-table`, `report-top-actions`, `report-advanced-toggle`만 직접 확인합니다.
- 따라서 병렬 dev/webpack 불안정을 줄이려면 비핵심 비교 자료를 기본 지연하는 쪽이 가장 작은 안전한 수정이었습니다.

## 실행한 검증 명령
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm build` [blocked: `.next/lock` 경합으로 확정 검증 실패]

## 무엇이 바뀌었는지
1. `/planning/reports`의 상품 비교 자료, 혜택 후보, 실시간 상품 탐색을 기본 자동 로드에서 사용자 직접 열기 방식으로 바꿨습니다.
2. `/api/products/candidates` 공유 payload는 상품 비교 자료를 열 때만 요청되도록 조건을 걸었습니다.
3. 보고서 핵심 섹션은 그대로 유지하고, 보조 섹션만 후순위로 미뤄 첫 진입 fan-out를 줄였습니다.
4. 멀티 에이전트 작업리스트에서 Task 1, 2를 완료 처리하고 다음 우선순위를 병렬 재현 셋 고정으로 옮겼습니다.

## 재현 또는 검증 방법
1. `pnpm e2e:rc`
2. `pnpm lint`
3. `/planning/reports` 진입 후 "추가 비교 자료" 카드에서 필요한 버튼을 눌러 보조 섹션을 연다.
4. `pnpm build` 는 상주 `next dev` 또는 남아 있는 build 프로세스가 `.next/lock` 을 쥐고 있지 않을 때 다시 확인한다.

## 남은 리스크와 엣지케이스
- `pnpm build` 는 이번 턴에서 `.next/lock` 경합 때문에 확정 PASS를 다시 받지 못했습니다.
- 보조 섹션이 기본 닫힘이므로, 이후 e2e가 해당 섹션을 직접 검증하게 되면 먼저 버튼 클릭 단계를 추가해야 합니다.
- 병렬 Playwright 자체의 shared `next dev --webpack` flake는 아직 남아 있어, 다음 단계에서 병렬 재현 셋과 실행 모드 분리가 필요합니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
