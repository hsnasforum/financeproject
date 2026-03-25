# 2026-03-19 N3 release evidence examples and operator runbook alignment

## 변경 파일
- `docs/release.md`
- `docs/release-checklist.md`
- `docs/maintenance.md`
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
- `work/3/19/2026-03-19-n3-release-evidence-examples-runbook-alignment.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 docs-only로 유지하고 `git diff --check`만 실행하는 최소 검증 세트를 선택했다.
- `work-log-closeout`: release example/runbook 정합성 보정 내용, 실행한 검증, 다음 후속 배치를 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 라운드에서 stable release closeout 템플릿과 evidence handoff 역할은 문서로 정리됐지만, 실제 운영 예시(`/work` note)와 바로 어떻게 대응되는지는 운영자가 다시 해석해야 했다.
- 이번 라운드는 기존 성공 예시와 blocker/smoke 예시를 template/runbook 문구에 연결해, 실제 운영자가 어떤 note를 기준선으로 보면 되는지 더 쉽게 읽히게 만드는 것이 목적이었다.

## 핵심 변경
- `docs/release.md`의 stable release closeout 템플릿 아래에 실제 성공 예시(`work/3/16/2026-03-16-release-v1.0.4-main-verify.md`)와 blocker/smoke 예시(`work/3/13/2026-03-13-runtime-release-verify-smoke.md`)를 연결하는 `Example Mapping`을 추가했다.
- example mapping에는 `primary / companion final gate`, `conditional minor guard`, `advisory record`, raw ops evidence 경로 처리, blocker와 미실행 gate 분리 방식을 실제 note 패턴과 맞춰 적었다.
- `docs/release-checklist.md`에는 release closeout 작성 시 어떤 기존 note 패턴을 우선 따르면 되는지 짧게 추가했다.
- `docs/maintenance.md`에는 release closeout 성공 예시와 blocker/smoke 예시를 기준선으로 삼는 운영 메모를 추가했다.
- `analysis_docs/v2/14...`에는 gate 분류 문서에서 운영 예시를 찾을 때 참조할 concrete example note만 짧게 연결했다.

## example / runbook 정합성 정리
- 성공 예시
  - `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - release bound 변경과 final gate 재실행이 함께 있는 closeout 기준선
- blocker/smoke 예시
  - `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
  - 코드 수정 없이 release smoke를 돌리고 첫 blocker와 미실행 검증을 남긴 기준선
- template 연결 규칙
  - `pnpm release:verify`, `pnpm build`, 필요 시 `pnpm e2e:rc`는 `primary / companion final gate`로 묶는다.
  - conditional minor guard는 실제로 실행한 경우에만 적고, 실행하지 않았으면 새 항목을 만들지 않는다.
  - advisory-only 결과는 blocker와 합치지 않고 `advisory record`로 분리한다.
  - raw ops evidence는 `.data/planning/ops/logs/`, `.data/planning/ops/reports/` 경로만 남기고 본문에는 복사하지 않는다.
  - blocker가 있으면 `첫 blocker`와 `미실행 gate`를 분리하고, 성공 케이스면 `residual risk / next owner`만 남긴다.

## 문서 보정 내용
- `docs/release.md`
  - stable release closeout 템플릿 아래에 concrete example mapping을 추가했다.
- `docs/release-checklist.md`
  - closeout 작성 시 따라야 할 실제 `/work` 예시 note를 짧게 연결했다.
- `docs/maintenance.md`
  - 운영자가 참고할 성공형/blocked형 release closeout 기준선을 추가했다.
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
  - gate/evidence 분류 문서에서 concrete example note를 짧게 연결했다.

## 검증
- 실행한 검증
- `git diff --check -- docs/release.md docs/release-checklist.md docs/maintenance.md analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md work/3/19/2026-03-19-n3-release-evidence-examples-runbook-alignment.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 docs-only라 사용자 지시대로 `git diff --check`만 실행했다.

## 남은 리스크
- success example와 blocker example를 기준선으로 연결했지만, 이후 다른 release note가 더 좋은 대표본이 되면 기준 예시를 다시 갱신해야 할 수 있다.
- release closeout 템플릿은 고정됐지만, advisory record의 상세도는 여전히 운영자 재량이 일부 남아 있다.
- 현재 워크트리에는 unrelated dirty 변경이 남아 있으므로, 실제 커밋/PR에서는 이번 docs-only 범위를 분리해 확인해야 한다.

## 다음 N3 후속 배치 제안
- `N3 release evidence note quality gate and tracked exemplar policy`
