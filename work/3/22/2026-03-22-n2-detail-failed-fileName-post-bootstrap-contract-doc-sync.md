# 2026-03-22 N2 detail failed-fileName post-bootstrap contract doc sync

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-detail-failed-fileName-post-bootstrap-contract-doc-sync.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail shell의 current source rule과 남은 legacy fallback class만 좁게 문서에 동기화하는 데 사용.
- `planning-gate-selector`: docs-only sync 라운드로 분류해 `git diff --check`만 실행 검증으로 선택하고, `pnpm test`/`build`/`lint`/`e2e:rc`는 미실행 검증으로 남기는 데 사용.
- `work-log-closeout`: 실제 수정 문서, 실행 검증, 다음 cut recommendation, 남은 리스크를 표준 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- detail shell의 `batch.failed`, `stats.failed`, `fileName`은 이미 `stored importMetadata -> legacy summary fallback` 순서로 좁혀졌지만, contract 문서의 일부 `smallest safe next cut`/backlog 메모는 아직 owner bootstrap 전 상태를 가리키고 있었다.
- 이번 라운드는 구현을 다시 열지 않고, 최신 code/work 상태와 다음 판단 기준을 문서 기준으로 다시 맞출 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/13...`의 `detail failed/fileName legacy fallback audit` 단락에서 current source rule이 `stored importMetadata -> legacy summary fallback` 순서라는 점과, `stats.failed`가 계속 `batch.failed` alias라는 점을 최신 상태로 고정했다.
- 같은 단락의 `smallest safe next cut`을 owner bootstrap이 아니라 `pure legacy`, `old stored meta without importMetadata`에 남은 fallback retirement boundary audit으로 갱신했다.
- `stored import diagnostics/provenance owner contract audit` 단락은 owner bootstrap이 이미 닫혔고, `parseCsvTransactions()` 결과 중 persisted되는 것은 `{ rows, parsed, skipped }` summary뿐이며 `errors[]`는 아직 persisted하지 않는다는 점을 반영했다.
- `analysis_docs/v2/11...`의 연결 메모는 다음 `N2` cut이 owner bootstrap이 아니라 historical batch class의 remaining legacy fallback retirement boundary를 어디까지 좁힐지 정하는 일이라고 정리했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-detail-failed-fileName-post-bootstrap-contract-doc-sync.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only sync라 route/helper/test behavior는 바꾸지 않았다.
- detail shell은 latest stored owner를 먼저 읽지만, `pure legacy`와 `old stored meta without importMetadata`는 여전히 fallback class로 남아 있다.
- 다음 cut에서 backfill/migration/explicit bridge retention 중 어떤 전략을 택할지 닫지 않으면, broad fallback 제거는 historical batch contract shrink 또는 silent zero/blank 위험을 계속 가진다.
