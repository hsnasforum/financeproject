# 2026-03-19 N3 release closeout template and evidence handoff convention

## 변경 파일
- `docs/release.md`
- `docs/release-checklist.md`
- `docs/maintenance.md`
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
- `work/3/19/2026-03-19-n3-release-closeout-template-evidence-handoff.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 docs-only로 고정하고 `git diff --check`만 실행하는 최소 검증 세트를 유지했다.
- `work-log-closeout`: release closeout 템플릿, evidence handoff 역할, 실행한 검증, 다음 후속 배치를 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 `N3` 라운드에서 guard/minor gate와 evidence logging 위치는 분류했지만, stable release closeout note에 실제로 무엇을 어떤 순서로 남겨야 하는지는 아직 운영자 해석에 의존했다.
- stable release closeout, advisory record, scheduler/ops log, `/work` handoff가 서로 어떤 역할을 맡는지 문서 기준으로 잠가 후속 실행자의 handoff drift를 줄일 필요가 있었다.

## 핵심 변경
- `docs/release.md`에 `Evidence Handoff Roles`와 `Stable Release Closeout Template`를 추가해 tracked `/work` release closeout note의 기본 구조를 고정했다.
- 템플릿에는 `primary/companion final gate`, `conditional minor guard`, `advisory record`, `evidence 위치`, `미실행 gate`, `residual risk / next owner`를 순서대로 남기도록 적었다.
- `docs/release-checklist.md`에는 release closeout 작성 체크리스트를 추가해 어떤 evidence를 closeout에 남기고 어떤 evidence는 raw log 경로만 남겨야 하는지 보강했다.
- `docs/maintenance.md`에는 stable release closeout을 tracked `/work` source of truth로 두고, advisory-only와 scheduler/ops raw evidence를 분리하는 운영 원칙을 추가했다.
- `analysis_docs/v2/14...`에는 `docs/release.md` 템플릿과 raw ops evidence source of truth가 어긋나지 않도록 짧은 연결 메모만 추가했다.

## release closeout 템플릿 정리
- 대표 기록물
  - tracked `/work` release closeout note
- 필수 항목
  - 대상 릴리즈
  - primary / companion final gate
  - conditional minor guard
  - advisory record
  - evidence 위치
  - 미실행 gate
  - residual risk / next owner
- 파일명 패턴
  - `work/<월>/<일>/YYYY-MM-DD-release-vX.Y.Z-main-verify.md`

## evidence handoff 역할 분리
- release closeout
  - stable release bound 실행의 대표 handoff
  - final gate와 conditional minor guard 결과를 기록
- advisory record
  - `pnpm planning:ssot:check`, `pnpm planning:v2:freeze:guard`, subset gate 같은 non-blocking 결과 기록
- scheduler/ops log
  - `.data/planning/ops/logs/scheduler.ndjson`
  - `.data/planning/ops/logs/*.log`
  - `.data/planning/ops/reports/*.json`
  - raw ops cadence evidence의 source of truth
- `/work` handoff
  - release bound가 아닌 수동 change batch 요약
  - ops cadence 결과를 raw log 대신 요약과 경로만 연결

## 문서 보정 내용
- `docs/release.md`
  - release closeout 템플릿과 evidence handoff 역할을 추가했다.
- `docs/release-checklist.md`
  - release closeout 작성 체크 항목을 추가했다.
- `docs/maintenance.md`
  - stable release closeout source of truth, advisory record 분리, scheduler/ops raw evidence 경로 규칙을 추가했다.
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
  - gate/evidence 분류 문서와 운영 handoff 문서가 어긋나지 않도록 연결 메모를 보강했다.

## 검증
- 실행한 검증
- `git diff --check -- docs/release.md docs/release-checklist.md docs/maintenance.md analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md work/3/19/2026-03-19-n3-release-closeout-template-evidence-handoff.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 docs-only라 사용자 지시대로 `git diff --check`만 실행했다.

## 남은 리스크
- 템플릿과 역할 분리는 문서로 고정했지만, 실제 stable release closeout 파일을 생성하는 운영자/에이전트가 이 템플릿을 일관되게 따르는지는 후속 검증이 더 필요하다.
- advisory record를 release closeout 안에서 어느 정도까지 자세히 적을지에는 여전히 약간의 재량이 남아 있다.
- 현재 워크트리에는 unrelated dirty 변경이 남아 있으므로, 실제 커밋/PR에서는 이번 docs-only 범위를 분리해 확인해야 한다.

## 다음 N3 후속 배치 제안
- `N3 release evidence examples and operator runbook alignment`
