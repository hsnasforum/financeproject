# 2026-03-22 N2 route response assembly audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-route-response-assembly-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence success/failure split 이후 response source-of-truth를 stored-first read contract 기준으로 좁히는 데 사용.
- `planning-gate-selector`: docs-only 라운드에 맞는 최소 검증 세트를 유지하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식을 맞추고 실행/미실행 검증을 분리하는 데 사용.

## 변경 이유
- same-id coexistence는 failure helper stack과 success split worker까지는 쌓였지만, verified success에서 어떤 `batch` payload와 `updatedTransactionCount`를 반환할지 route contract가 닫히지 않았다.
- 이번 라운드는 `/account` route behavior를 바꾸지 않고 response assembly source-of-truth만 문서로 잠그는 docs-first audit이다.

## 핵심 변경
- `stored-meta-only` success body와 `legacy-only` success body의 현재 shape를 비교해 same-id coexistence verified success가 어느 필드를 재사용할 수 있는지 정리했다.
- verified success의 `batch` payload source-of-truth는 raw stored write 결과나 legacy write 결과 단독이 아니라, post-write `loadStoredFirstBatchTransactions(batchId)` 재조회 후 detail-shell 규칙으로 조립한 stored-first visible batch shell로 잠갔다.
- coexistence success의 `updatedTransactionCount`는 legacy second write가 실제로 바꾼 transaction row count 의미만 유지하고, stored-side change count나 visible reader 전체 drift count로 재정의하지 않도록 못 박았다.
- `writes-completed` 이후에도 `runSameIdCoexistencePostWriteSuccessSplitWorker()`에서 `verified-success-candidate`일 때만 success assembly 후보가 되고, `visible-verification-failed`는 다시 conservative `INTERNAL` failure branch로 되돌아가야 한다는 split boundary를 문서에 추가했다.
- 가장 작은 다음 구현 컷은 route open이 아니라, `verified-success-candidate`를 입력으로 받아 reloaded stored-first batch shell과 legacy `updatedTransactionCount`를 합치는 response assembly helper라는 점을 남겼다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-route-response-assembly-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- same-id coexistence verified success response helper와 실제 `/account` route wiring은 아직 구현되지 않았다.
- `[검증 필요]` visible binding은 target `accountId`로 보이는데 legacy `updatedTransactionCount`가 `0`인 경우를 사용자 성공 응답에서 어떻게 설명할지는 후속 컷에서 닫아야 한다.
- current `/account` route는 여전히 guard-only라, 이번 라운드 문서 계약만으로는 success semantics를 실제로 열지 않는다.
