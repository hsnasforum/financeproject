# 2026-03-19 N3 release evidence note quality gate and tracked exemplar policy

## 변경 파일
- `docs/release.md`
- `docs/release-checklist.md`
- `docs/maintenance.md`
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
- `work/3/19/2026-03-19-n3-release-evidence-note-quality-gate.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 docs-only로 유지하고 `git diff --check`만 실행하는 최소 검증 세트를 유지했다.
- `work-log-closeout`: release closeout quality gate와 tracked exemplar policy 보정 내용을 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 라운드에서 release closeout 템플릿과 concrete example 연결은 됐지만, 후속 tracked `/work` note가 어느 수준까지 써야 충분한지와 어떤 exemplar를 따라야 하는지는 아직 운영자 해석에 의존했다.
- 이번 라운드는 성공형/blocked형 exemplar를 역할별로 잠그고, tracked release closeout note가 지나치게 짧아지거나 blocker/advisory/evidence 경계를 섞어 쓰지 않도록 최소 품질 기준을 문서로 고정하는 것이 목적이었다.

## 핵심 변경
- `docs/release.md`에 `Tracked Release Note Quality Gate`를 추가해 필수 섹션, blocker와 advisory 분리, raw evidence 본문 복사 금지, 미실행 gate 표기, residual risk/next owner 기록을 최소 기준으로 잠갔다.
- 같은 문서에 `Tracked Exemplar Selection`을 추가해 primary/companion final gate 통과 시 성공형 exemplar를, 첫 blocker와 미실행 gate를 함께 남기는 smoke/triage 라운드에서는 blocker/smoke exemplar를 따르도록 정리했다.
- `docs/release-checklist.md`에는 release closeout 작성자가 바로 따라 볼 수 있는 quality gate 체크 항목을 추가했다.
- `docs/maintenance.md`에는 tracked exemplar를 너무 자주 교체하지 않고, success exemplar와 blocker exemplar를 역할별 기준선으로 유지하는 운영 원칙을 추가했다.
- `analysis_docs/v2/14...`에는 tracked exemplar 정책과 release note quality gate의 단일 기준 문서가 `docs/release.md`라는 연결 메모를 덧붙였다.

## 문서 보정 내용
- `docs/release.md`
  - tracked release closeout note의 최소 품질 기준과 exemplar 선택 규칙을 추가했다.
- `docs/release-checklist.md`
  - release note quality gate 체크 항목을 추가했다.
- `docs/maintenance.md`
  - tracked exemplar 교체 원칙과 success/blocker exemplar의 역할 분리를 추가했다.
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
  - tracked exemplar policy 연결 메모를 짧게 추가했다.

## 검증
- 실행한 검증
- `git diff --check -- docs/release.md docs/release-checklist.md docs/maintenance.md analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md work/3/19/2026-03-19-n3-release-evidence-note-quality-gate.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 docs-only라 사용자 지시대로 `git diff --check`만 실행했다.

## 남은 리스크
- quality gate와 exemplar policy는 잠겼지만, 기존 오래된 release closeout note들이 새 기준을 모두 만족하는지에 대한 backfill audit은 아직 하지 않았다.
- exemplar 교체 기준은 추가했지만, 실제 운영에서 더 나은 대표 note가 생겼을 때 교체 판단이 일관되게 이뤄지는지는 후속 audit이 필요하다.
- 현재 워크트리에는 unrelated dirty 변경이 남아 있으므로, 실제 커밋/PR에서는 이번 docs-only 범위를 분리해 확인해야 한다.

## 다음 N3 후속 배치 제안
- `N3 tracked release closeout backlog audit and exemplar refresh candidates`
