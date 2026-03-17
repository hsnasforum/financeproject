# 2026-03-17 N2 planning/v3 API import-export rollback contract definition

## 수정 대상 파일

- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`

## 변경 이유

- `N1`에서 canonical entity owner는 잠겼지만, `planning/v3` route가 어떤 owner를 읽고 쓰는지와 export/rollback 단위는 아직 한 문서로 고정되지 않았다.
- route path 기준으로 API를 읽으면 `batch`, `draft`, `news` 아래에서 owner가 섞여 보여 후속 import-export/rollback 논의가 흔들릴 위험이 있었다.
- `N3` QA gate와 `N4` beta exposure를 열기 전에 owner-based contract를 먼저 잠가 둘 필요가 있었다.

## 실행할 검증 명령

- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/17/2026-03-17-n2-planning-v3-api-import-rollback-contract-definition.md`

## 작업 내용

- `planning/v3` API route를 owner 기준으로 다시 묶고 `command/write`, `read/projection`, `support/internal`으로 분류했다.
- account/opening balance, import batch/transaction, category rule/override family, draft family, news config family별로 request intent와 export/rollback 범위를 정리했다.
- `PlannerSnapshot`, stable profile store, projection route, support/internal route를 canonical export/rollback owner와 섞지 않는 경계를 명시했다.
- `(batchId, txnId)` key, legacy override, opening balance boundary, draft apply boundary, news artifact 분리 같은 `N2` 핵심 쟁점을 별도 섹션으로 남겼다.
- `N3`, `N4`가 재사용할 QA gate / visibility 전제조건을 문서 마지막에 연결했다.

## 무엇이 바뀌었는지

- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`를 신설했다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N2` 항목에 새 contract 문서 연결 메모를 추가했다.
- route를 path가 아니라 owner family 기준으로 읽는 규칙과 export/rollback 비대상 route 기준을 문서로 고정했다.

## 재현 또는 검증 방법

- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`에서 owner family별 route 분류와 export/rollback 단위를 확인한다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N2` 항목에서 새 contract 문서 연결 메모를 확인한다.
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/17/2026-03-17-n2-planning-v3-api-import-rollback-contract-definition.md`로 문서 포맷 이상 여부를 확인한다.

## 남은 리스크와 엣지케이스

- `transactions/batches/merge`의 batch lineage와 deterministic rollback 규칙은 이번 문서에서 `[검증 필요]`로 남겼다.
- `transactions/overrides`는 legacy unscoped shape와 batch-scoped shape가 섞여 있어 stable public contract로 바로 승격할 수 없다.
- `news/exposure`와 `exposure/profile`은 같은 owner family로 묶었지만 response wrapper는 아직 다르다.
- `journal`, `routines`, `indicators/specs`는 owner가 완전히 닫히지 않아 support/internal route로만 분류했다.

## 사용 skill

- `work-log-closeout`: 이번 라운드의 문서 변경, 검증, 잔여 리스크를 `/work` 형식으로 기록하는 데 사용.
