# 2026-03-22 N2 same-id coexistence legacy append verification audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-same-id-coexistence-legacy-append-verification-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id coexistence future mirror write의 마지막 blocker를 legacy append verification gap 하나로 좁혀 문서 계약만 보강했다.
- `planning-gate-selector`: docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 골랐다.
- `work-log-closeout`: 이번 audit 결론, 실행 검증, 남은 verification 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- same-id coexistence rollback ordering contract는 닫혔지만, second step인 legacy append-write가 실패했을 때 route가 실제 post-write 상태를 증명할 helper가 있는지는 아직 비어 있었다.
- `updateBatchAccount()`가 `appendNdjsonLine()` 기반 append-write를 쓰는 만큼, append 예외 뒤에 `전혀 안 써졌다`고 말할 수 있는지와 partial append ambiguity를 어떻게 분류할지를 코드 기준으로 다시 정리할 필요가 있었다.
- 이번 라운드는 mirror write 구현이 아니라 future mirror write 전에 필요한 verification contract를 문서로 잠그는 audit이 목표였다.

## 핵심 변경
- `analysis_docs/v2/13...`에 `same-id stored/legacy coexistence legacy append verification audit` 단락을 추가해 `updateBatchAccount()`의 second step이 `fs.appendFile()` 기반 append-write이며 stored side atomic rewrite와 다른 failure 성질을 가진다는 점을 명시했다.
- `readNdjsonRows()`가 parse 실패 line을 조용히 건너뛴다는 사실을 적고, 현재 route는 append 예외 뒤에 `legacy write 미적용 확정`이 아니라 `legacy append status unknown` 또는 `partial append ambiguity`로만 다룰 수 있다고 정리했다.
- post-write verification read source 후보는 두 개로 남겼다. `readBatches()`/`readBatchTransactions(batchId)`는 parsed latest row 기준 positive verification 후보이고, malformed tail을 잡으려면 `batches.ndjson` raw tail verification helper가 신규로 필요하다고 적었다.
- smallest safe next cut은 `mirror write implementation`이 아니라 `verification helper bootstrap`으로 고정했다. append 실패 후 `parsed row committed / malformed tail / no committed row observed`를 구분할 최소 helper 없이는 same-id coexistence mirror write를 열면 안 된다고 남겼다.
- `analysis_docs/v2/11...`에는 rollback ordering contract 다음 cut이 legacy append verification helper bootstrap이라는 연결 메모를 추가했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-same-id-coexistence-legacy-append-verification-audit.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 audit/docs-only라 post-write verification helper나 mirror write를 실제로 구현하거나 테스트하지 않았다.
- `readBatches()`와 `readBatchTransactions()`는 parsed latest row는 확인할 수 있지만 malformed trailing bytes를 surface로 올리지 못하므로, append ambiguity를 완전히 닫는 helper는 여전히 없다.
- `[검증 필요]` legacy append 예외가 실제로 어떤 partial append 모양을 남기는지와, raw tail verification helper가 route 안에서 no-write를 어디까지 증명할 수 있는지는 후속 구현에서 다시 확인해야 한다.
