# 2026-03-19 N3 guard/minor gate classification and evidence logging matrix

## 변경 파일
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
- `docs/maintenance.md`
- `docs/release-checklist.md`
- `docs/release.md`
- `work/3/19/2026-03-19-n3-guard-minor-gate-classification-evidence-matrix.md`

## 사용 skill
- `planning-gate-selector`: docs-only 라운드로 고정하고 `git diff --check`만 실행하는 최소 검증 세트를 유지했다.
- `work-log-closeout`: guard/minor gate 분류, evidence logging 위치, 실행한 검증, 다음 후속 배치를 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 `N3` 라운드에서 stable final gate, subset gate, beta targeted gate, repair/bootstrap evidence는 정리했지만 `planning:v2:guard`, `planning:v2:engine:guard`, `planning:v2:freeze:guard`, `planning:v2:ops:*` 계열의 위치와 logging 위치는 아직 broad inventory 수준이었다.
- 이번 라운드에서는 실제 운영 문서와 script를 기준으로 `stable conditional gate / advisory gate / ops cadence gate / evidence-only command`를 더 세밀하게 잠그고, 결과를 어디에 남길지 바로 따라 할 수 있게 해야 했다.

## 핵심 변경
- `analysis_docs/v2/14...`에 `planning:v2:guard`, `planning:v2:engine:guard`, `planning:v2:freeze:guard`, `planning:v2:ops:*` 계열을 command role table에 추가하고, `minor guard`, `ops cadence`, `evidence logging` 기준 설명을 보강했다.
- 같은 문서에 `명령 / 분류 / 언제 실행 / 어디에 기록 / stable blocker 여부` 5열의 짧은 evidence logging matrix를 추가했다.
- `docs/maintenance.md`에는 stable release에서 자동 포함되는 명령과 아닌 명령, scheduler/ops log와 `/work`의 기록 위치를 짧게 맞췄다.
- `docs/release-checklist.md`, `docs/release.md`에는 release closeout에 남겨야 하는 conditional minor guard와 advisory-only, ops cadence/evidence-only 명령의 경계를 추가했다.

## guard/minor gate 분류 정리
- stable conditional gate
  - `pnpm planning:v2:guard`
  - `pnpm planning:v2:engine:guard`
- advisory gate
  - `pnpm planning:v2:ops:scheduler:health`
- ops cadence gate
  - `pnpm planning:v2:ops:run`
  - `pnpm planning:v2:ops:run:regress`
  - `pnpm planning:v2:ops:safety`
  - `pnpm planning:v2:ops:safety:weekly`
  - `pnpm planning:v2:ops:safety:regress`
- evidence-only command
  - `pnpm planning:v2:freeze:guard`
  - `pnpm planning:v2:ops:prune`

## evidence logging 위치 정리
- release closeout
  - `pnpm planning:v2:guard`, `pnpm planning:v2:engine:guard`를 release bound 변경에서 실행했을 때 결과를 남긴다.
- advisory record
  - `pnpm planning:v2:freeze:guard`
  - `pnpm planning:v2:ops:scheduler:health`
- scheduler/ops log
  - `pnpm planning:v2:ops:safety:weekly`
  - `pnpm planning:v2:ops:safety:regress`
  - `pnpm planning:v2:ops:scheduler:health`
  - `pnpm planning:v2:ops:prune`
  - `pnpm planning:v2:ops:run*`, `pnpm planning:v2:ops:safety`
- `/work`
  - change batch에서 위 guard/ops 명령을 수동 실행했을 때 요약을 남긴다.
  - scheduled cadence 기본 증적 저장소를 대체하지 않고, 배치성 변경의 handoff 요약만 맡는다.

## 문서 보정 내용
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`
  - minor guard/ops cadence/evidence-only 분류와 logging matrix를 추가했다.
- `docs/maintenance.md`
  - stable release final gate에 자동 포함되지 않는 guard/ops 명령과 scheduler/ops log, `/work` 기록 위치를 명시했다.
- `docs/release-checklist.md`
  - release closeout에 남기는 conditional minor guard와 advisory/evidence-only 명령의 경계를 보강했다.
- `docs/release.md`
  - release flow에서 conditional minor guard와 ops cadence/evidence의 위치를 별도 단락으로 정리했다.

## 검증
- 실행한 검증
- `git diff --check -- analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md docs/maintenance.md docs/release-checklist.md docs/release.md work/3/19/2026-03-19-n3-guard-minor-gate-classification-evidence-matrix.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 docs-only라 사용자 지시대로 `git diff --check`만 실행했다.

## 남은 리스크
- evidence logging matrix는 기록 위치를 잠갔지만, release closeout 자체의 템플릿/저장 위치는 여전히 운영 절차 문맥에 의존한다.
- `planning:v2:ops:run`과 `planning:v2:ops:safety`의 수동 실행 결과를 어느 정도까지 `/work`에 요약할지 세부 포맷은 아직 자유도가 있다.
- 현재 워크트리에는 unrelated dirty 변경이 남아 있으므로, 실제 커밋/PR에서는 이번 docs-only 범위를 분리해 확인해야 한다.

## 다음 N3 후속 배치 제안
- `N3 release closeout template and evidence handoff convention`
