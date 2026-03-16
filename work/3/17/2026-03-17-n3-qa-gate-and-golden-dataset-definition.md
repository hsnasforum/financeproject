# 2026-03-17 N3 QA gate and golden dataset definition

## 수정 대상 파일

- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`

## 변경 이유

- 현재 저장소에는 검증 명령과 테스트 자산이 이미 많지만, `public stable`, `public beta`, `ops/dev`를 같은 게이트로 보면 다음 사이클에서 `planning/v3` beta와 stable release가 서로의 blocker가 된다.
- `N1`, `N2`에서 owner와 API contract를 잠근 뒤에는, 어떤 route policy가 어떤 검증 세트를 요구하는지 문서로 먼저 고정할 필요가 있었다.
- 새 테스트를 만드는 것보다 existing command와 fixture를 gate tier와 golden dataset category로 다시 묶는 것이 이번 라운드 핵심이었다.

## 실행할 검증 명령

- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md work/3/17/2026-03-17-n3-qa-gate-and-golden-dataset-definition.md`

## 작업 내용

- existing command를 `required`, `conditional required`, `advisory`, `final single-owner gate`로 재배치했다.
- `public stable`, `public beta`, `ops/dev` 세 tier별 gate matrix를 문서로 고정했다.
- `verify`, `planning:ssot:check`, `planning:current-screens:guard`, `planning:v2:complete`, `planning:v2:compat`, `e2e:rc`, `release:verify`의 위치를 각각 판정했다.
- golden dataset을 `canonical entity`, `route contract`, `projection/regression`, `e2e scenario`, `ops/repair/compatibility` 다섯 category로 나눴다.
- `N4` visibility policy가 재사용할 gate/visibility 전제조건도 별도 섹션으로 남겼다.

## 무엇이 바뀌었는지

- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`를 신설했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N3` 항목에 새 QA gate 문서 연결 메모를 추가했다.
- stable/beta/ops-dev를 같은 검증 세트로 보지 않는 next-cycle 기준을 문서로 고정했다.

## 재현 또는 검증 방법

- `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`에서 tier별 required/advisory gate와 golden dataset category를 확인한다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N3` 항목에서 새 문서 연결 메모를 확인한다.
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md work/3/17/2026-03-17-n3-qa-gate-and-golden-dataset-definition.md`로 문서 포맷 이상 여부를 확인한다.

## 남은 리스크와 엣지케이스

- `planning/v3` beta 전용 e2e는 existing file targeting으로 충분하다고 정리했지만, 추후 beta route가 더 늘면 별도 script 묶음이 다시 필요할 수 있다.
- `verify`는 repo-wide hygiene gate라 public stable RC 외에는 과도한 gate가 될 수 있어, 실제 적용 시 범위를 엄격히 지켜야 한다.
- `journal`, `routines`, `indicators/specs` 같은 ops/support route는 owner가 아직 완전히 닫히지 않아 ops/dev gate로만 남겼다.
- golden dataset은 category 정의까지만 잠갔고, fixture cleanup이나 naming 표준화는 이번 라운드 범위 밖이다.

## 사용 skill

- `work-log-closeout`: 이번 라운드의 문서 변경, 검증, 잔여 리스크를 `/work` 형식으로 기록하는 데 사용.
