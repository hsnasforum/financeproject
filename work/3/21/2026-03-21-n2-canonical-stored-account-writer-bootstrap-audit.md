# 2026-03-21 N2 canonical stored account writer bootstrap audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/21/2026-03-21-n2-canonical-stored-account-writer-bootstrap-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: account command/write owner와 stored-first reader가 어긋나는 지점을 broad 구현 없이 audit cut으로 좁히는 데 사용했다.
- `planning-gate-selector`: audit/docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 골랐다.
- `work-log-closeout`: 실제로 읽은 코드 기준의 writer owner map, 영향 reader, 다음 구현 컷, 비범위를 `/work` 형식으로 정리했다.

## 변경 이유
- `stored-meta only` batch는 이제 explicit guard로 막히지만, 왜 canonical stored account writer를 아직 열지 못하는지 코드 기준의 영향 범위 정리가 부족했다.
- broad owner merge나 write-back 구현 전에, legacy writer owner와 stored-first reader가 어디서 갈라지고 어떤 consumer가 영향을 받는지 먼저 좁혀야 다음 구현 컷을 안전하게 고를 수 있다.
- 이번 라운드는 구현보다 bootstrap audit과 handoff 문서화가 목적이다.

## 핵심 변경
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `3.2 ImportBatch / TransactionRecord`에 `canonical stored account writer bootstrap audit` subsection을 추가했다.
- current writer owner map으로 `updateBatchAccount()` legacy append-write와 `saveBatch()` full stored batch write를 분리해 적고, stored account binding 전용 partial writer helper가 아직 없음을 명시했다.
- affected reader로 `getStoredFirstBatchBindingAccountId()`, `applyStoredFirstBatchAccountBinding()`, cashflow, balances monthly, draft profile, `generateDraftPatchFromBatch.ts`, detail route batch shell precedence를 기록했다.
- 가장 작은 다음 구현 컷은 `stored-meta-only bootstrap`으로 정리했다.
- same-id stored/legacy coexistence account writer 통합, legacy writer migration, stored transaction row rewrite/index repair/owner merge는 비범위로 명시했다.
- 지금 broad 구현이 위험한 이유로, consumer마다 account binding precedence가 다르고 legacy public writer가 그대로 남아 canonical owner가 둘로 보일 수 있다는 점을 문서에 남겼다.

## 검증
- 실행:
  - `git diff --check -- work/3/21/2026-03-21-n2-canonical-stored-account-writer-bootstrap-audit.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 audit/docs-only라 canonical stored account writer를 실제로 구현하거나 검증하지 않았다.
- `stored-meta-only bootstrap`이 가장 작은 cut으로 보이지만, detail batch shell과 cashflow/balances/draft consumer의 precedence 차이는 구현 직전 다시 한 번 확인이 필요하다.
- legacy writer public route를 같이 다루지 않으면 coexistence/migration 단계에서 command semantics가 다시 흔들릴 수 있다.
