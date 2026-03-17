# P2-1 canonical planning-to-recommend contract 정의 보류

## 이번 배치 대상 항목 ID
- `P2-1`

## 변경 파일
- `analysis_docs/v2/financeproject_next_stage_plan.md`

## 핵심 변경
- `P2-1`을 `[보류]`로 전환했다.
- 현행 recommend 계약이 `planningContext` 4개 입력과 `stageInference: "disabled"`에 머물러 있음을 기준 문서에 남겼다.
- canonical `runId`, planning stage/status/trace 없이 DTO를 확장하면 `P2-2`, `P2-4`, `P2-5`가 한 번에 열리는 구조라는 점을 정리했다.
- 이번 라운드에서는 실제 DTO/API 구현을 열지 않고 범위 충돌을 먼저 고정했다.

## 실행한 검증
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md work/3/16/2026-03-16-p2-1-contract-definition-hold.md`

## 남은 리스크
- Phase 1의 `P1-1`은 RC E2E 광범위 실패 때문에 여전히 `[진행중]`이다.
- P2 단계는 canonical planning result source, runId 연결 기준, stage/status/trace 소유 위치를 먼저 결정하지 않으면 항목 경계가 무너진다.

## 다음 우선순위
- `[추가 결정 필요]` canonical planning result source(`runId` 중심인지, report VM 중심인지) 먼저 확정
- 그 다음 `P2-1` 재개

## 사용한 skill
- `planning-gate-selector`: 범위 대비 과도한 구현/검증 확장 여부 판단
- `work-log-closeout`: `/work` closeout 기록 형식 유지
