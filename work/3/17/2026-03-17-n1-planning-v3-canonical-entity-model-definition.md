# 2026-03-17 N1 planning/v3 canonical entity model definition

## 수정 대상 파일

- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`

## 변경 이유

- `planning/v3` route inventory와 store/service가 넓게 퍼져 있어 API/import-export/rollback 논의를 같은 owner 기준으로 이어가기 어려웠다.
- `PlannerSnapshot` 같은 stable planning v2 owner와 `planning/v3` file/local owner를 문서에서 먼저 분리해 둘 필요가 있었다.
- `N2`를 열기 전에 first-class entity / derived model / transient artifact 구분을 먼저 잠가야 했다.

## 실행할 검증 명령

- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md work/3/17/2026-03-17-n1-planning-v3-canonical-entity-model-definition.md`

## 작업 내용

- `planning/v3` canonical entity inventory를 새 문서로 추가했다.
- first-class canonical entity, derived/read model, transient/support artifact를 분리했다.
- account, opening balance, transaction, import batch, category rule, override family, draft family, news settings/alert/exposure/scenario override의 owner와 key를 정리했다.
- `PlannerSnapshot`와 stable planning profile owner를 `planning/v3` canonical owner와 섞지 않는 경계를 명시했다.
- `N2`로 넘겨야 할 key, override precedence, export/import/rollback 단위 쟁점을 별도 섹션으로 남겼다.

## 무엇이 바뀌었는지

- `N1` backlog 항목에 canonical model 문서 연결 메모를 추가했다.
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`를 신설했다.
- `planning/v3` first-class entity / derived model / transient artifact 구분과 route-to-entity mapping을 문서로 고정했다.

## 재현 또는 검증 방법

- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에서 entity별 owner, key, lifecycle, reader/writer route를 확인한다.
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`의 `N1` 항목에서 새 canonical model 문서 연결 메모를 확인한다.
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md work/3/17/2026-03-17-n1-planning-v3-canonical-entity-model-definition.md`로 문서 포맷 이상 여부를 확인한다.

## 남은 리스크와 엣지케이스

- `TransactionRecord`의 canonical key는 현재 `(batchId, txnId)`로 보는 것이 안전하지만, global id 승격 여부는 `N2`에서 다시 잠가야 한다.
- `OpeningBalance`는 store key가 `accountId` 하나뿐이라 timeline owner로 바로 승격되지 않는다.
- draft family는 `DraftV1`, `V3DraftRecord`, `DraftProfileRecord`가 공존해 root dir / contract 정리가 `N2` 핵심 쟁점으로 남아 있다.
- news alert event/state는 generated artifact와 UI overlay가 섞여 있어 canonical owner로 올리지 않고 support artifact로 남겼다.

## 사용 skill

- `work-log-closeout`: 이번 라운드의 문서 변경, 검증, 잔여 리스크를 `/work` 형식으로 기록하는 데 사용.
