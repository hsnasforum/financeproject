# 2026-03-16 P2-1 canonical planning-to-recommend contract 결정

## 이번 배치 대상 항목 ID
- `P2-1`

## 변경 파일
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `analysis_docs/v2/03_DTO_API_명세서.md`
- `analysis_docs/v2/06_planning_recommend_contract_decision.md`
- `work/3/16/2026-03-16-p2-1-contract-decision.md`

## 핵심 변경
- recommend 현행 계약과 planning run/report/share/store를 다시 읽어 Planning → Recommend handoff의 canonical source를 `PlanningRunRecord`가 소유하는 handoff projection으로 고정했다.
- `runId`, `stage`, `status`, `trace` owner를 planning run 쪽으로 정리하고, 현재 `planningContext` 4개 입력은 legacy bridge로만 유지하기로 문서 기준을 맞췄다.
- `PlanningSummaryDto`, `PlanningActionDto`, `PlanningToRecommendContextDto`, `RecommendRequestV2`, `RecommendExplanationDto` 초안을 새 결정 문서에 정리했다.
- `P2-2 ~ P2-5`는 `P2-2 -> P2-3 -> P2-4 -> P2-5` 순서로 여는 기준을 남겼고, 상태판에서 `P2-1`과 Phase 2를 `[진행중]`으로 올렸다.

## 실행한 검증
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md analysis_docs/v2/03_DTO_API_명세서.md analysis_docs/v2/06_planning_recommend_contract_decision.md work/3/16/2026-03-16-p2-1-contract-decision.md`

## 남은 리스크
- 현재 `PlanningRunRecord`에는 recommend가 바로 읽을 summary/action projection이 아직 없어서, 구현 라운드에서는 run-owned projection을 실제로 써 넣는 작업이 필요하다.
- planning trace는 현재 별도 `traceId`가 아니라 `outputs.engine.financialStatus.trace`, `reproducibility`, `meta.snapshot/health`, `resultDto.meta`에 나뉘어 있어 export/history용 ref 설계는 후속 판단이 필요하다.
- recommend saved run의 `runId`는 planning run id와 별개라서, `P2-5`에서 별도 참조 필드를 안전하게 추가해야 한다.

## 다음 우선순위
- `P2-2`: recommend request가 `planning.runId`와 `PlanningSummaryDto.stage`를 우선 해석하도록 stage inference 활성화 범위를 설계
- `P2-3`: `PlanningActionDto`를 기준으로 CTA preset과 recommend preset mapping 초안을 열기

## 사용한 skill
- `work-log-closeout`: 문서 결정 배치 결과와 남은 리스크, 다음 우선순위를 `/work` 형식으로 남기는 데 사용.
