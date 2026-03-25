# 2026-03-21 N2 batch command surface contract doc sync

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/21/2026-03-21-n2-batch-command-surface-contract-doc-sync.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: 최근 N2 batch-family read/command 경계를 broad rewrite 없이 `3.2 ImportBatch / TransactionRecord` contract note에 맞춰 좁혀 적는 데 사용했다.
- `planning-gate-selector`: docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 선택했다.
- `work-log-closeout`: 실제 수정 파일, 실행한 검증, 남은 canonical writer 리스크를 표준 `/work` 형식으로 정리했다.

## 변경 이유
- 최근 N2 라운드에서 synthetic stored-only, same-id stored/legacy coexistence, pure legacy batch에 대한 command boundary가 코드에서 이미 explicit guard로 정리됐다.
- 하지만 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `3.2 ImportBatch / TransactionRecord`는 stored-first read facade와 latest command guard 상태를 충분히 반영하지 못하고 있었다.
- 구현을 다시 건드리지 않고, reader facade / writer owner / legacy bridge 관점의 현재 contract snapshot만 문서에 동기화할 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `3.2 ImportBatch / TransactionRecord`에 current command surface snapshot을 추가했다.
- synthetic stored-only batch의 read discoverability, `DELETE` 허용 범위, `POST /account` guard semantics를 현재 helper/route 기준으로 보강했다.
- same-id stored-meta + legacy coexistence에서 `DELETE`와 `POST /account`가 explicit guard라는 점과, pure legacy batch가 detail read는 되지만 `DELETE` owner는 아니라는 점을 문서에 명시했다.
- account write owner가 여전히 legacy batch owner이며 stored-first reader와 canonical writer가 아직 합쳐지지 않았다는 이유를 contract note에 추가했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에는 batch command surface 문서 동기화 완료와 남은 owner merge/write-back 범위를 연결 메모로 짧게 남겼다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/21/2026-03-21-n2-batch-command-surface-contract-doc-sync.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only라 code-side semantics를 다시 검증하거나 재구현하지 않았다.
- batch delete/account command의 explicit guard는 문서와 동기화됐지만, canonical writer merge, stored meta write-back, legacy write/delete contract 확장은 여전히 후속 범위다.
- `3.2` 문서는 current snapshot을 설명할 뿐이며, pure stored account writer 승격이나 broader rollback/export owner 재정의까지 닫은 것은 아니다.
