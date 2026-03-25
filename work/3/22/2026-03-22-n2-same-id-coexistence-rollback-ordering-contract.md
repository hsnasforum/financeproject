# 2026-03-22 N2 same-id coexistence rollback ordering contract

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-same-id-coexistence-rollback-ordering-contract.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id stored/legacy coexistence의 mirror write 후보를 최소 계약 단위로 좁혀 write 순서와 rollback 순서만 문서로 고정했다.
- `planning-gate-selector`: docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 골랐다.
- `work-log-closeout`: 이번 라운드의 계약 변경, 실행 검증, 남은 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 audit에서 same-id coexistence의 다음 컷은 mirror write bootstrap이 아니라 rollback ordering contract를 먼저 닫는 것이라고 정리됐다.
- future mirror write를 열기 전에 first write owner, second write 실패 시 rollback 순서, rollback 실패 시 user-facing failure semantics를 문서 기준으로 먼저 잠글 필요가 있었다.
- 이번 라운드는 code 수정 없이 same-id coexistence 전용 rollback ordering contract만 docs-first로 고정하는 것이 목표였다.

## 핵심 변경
- `analysis_docs/v2/13...`의 same-id coexistence explicit mirror write audit 단락을 `recommended sequence`, `rejected sequence`, `rollback ordering contract`, `partial failure state taxonomy`, `route-level user-facing failure 원칙`, `operator/manual repair` 기준으로 다시 정리했다.
- recommended sequence는 `stored -> legacy` 하나만 남겼다. visible reader가 stored-first인 상태와 first write owner를 맞출 수 있고, stored side가 rewrite owner라 pre-write snapshot 복원 여지가 있기 때문이다.
- `legacy -> stored`와 `[미확인] best-effort dual-write`는 기각했다. legacy-first는 visible reader와 first write가 어긋나고 hidden fallback drift를 남기기 쉽고, best-effort dual-write는 ordered rollback source-of-truth가 없다.
- rollback ordering contract는 `stored pre-write snapshot 확보 -> stored write -> legacy write -> legacy 실패 시 stored rollback 시도 -> rollback 성공 여부와 무관하게 success 금지`로 고정했다.
- partial failure taxonomy는 `first-write-failed`, `second-write-failed-rollback-recovered`, `repair-required` 세 상태로 정리했고, write 시작 이후 failure family는 `INPUT`/`NO_DATA`가 아니라 `INTERNAL`로 유지한다고 명시했다.
- `analysis_docs/v2/11...`에는 same-id coexistence의 다음 cut이 mirror write bootstrap이 아니라 rollback ordering contract라는 연결 메모를 한 줄 추가했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-same-id-coexistence-rollback-ordering-contract.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only라 mirror write, rollback helper, post-failure verification helper를 실제로 구현하거나 테스트하지 않았다.
- `stored -> legacy`를 추천 순서로 고정했지만, legacy append-write failure가 partial append ambiguity를 남길 수 있는지와 이를 route 안에서 증명할 verification helper는 여전히 `[검증 필요]`다.
- same-id coexistence는 여전히 canonical writer owner가 하나로 닫히지 않았으므로, rollback ordering contract만으로 operator repair 필요 상태를 자동 복구하지는 못한다.
