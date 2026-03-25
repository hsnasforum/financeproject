# 2026-03-22 N2 same-id stored-legacy coexistence account writer audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-same-id-coexistence-account-writer-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: same-id stored/legacy coexistence에서 reader facade, writer owner, legacy bridge가 어디서 충돌하는지 현재 helper 기준으로 좁혀 정리했다.
- `planning-gate-selector`: audit/docs-only 라운드로 분류하고 `git diff --check`만 실행 검증으로 남기도록 최소 게이트를 골랐다.
- `work-log-closeout`: 이번 라운드의 audit 결론, 실행 검증, 비범위와 잔여 리스크를 `/work` 형식으로 정리했다.

## 변경 이유
- `/api/planning/v3/transactions/batches/[id]/account`는 same-id stored-meta + legacy coexistence에서 여전히 explicit guard를 반환한다.
- stored-meta-only bootstrap은 열렸지만 coexistence는 stored writer와 legacy writer가 서로 다른 persistence boundary를 가지므로, 왜 success semantics를 아직 열지 않는지 별도 audit 메모가 필요했다.
- 이번 라운드는 broad writer merge나 migration 구현이 아니라, coexistence 전용 다음 구현 컷을 안전하게 고르기 위한 코드 기준 audit이 목적이었다.

## 핵심 변경
- current coexistence writer/reader map을 정리했다. visible reader는 `getStoredFirstBatchBindingAccountId()`를 통해 stored meta `accounts[0].id`를 우선 읽고, detail shell/derived, `cashflow`, `getBatchSummary.ts`, `balances/monthly`, `draft/profile`이 이 precedence를 공유한다.
- account write owner는 여전히 둘로 나뉜다는 점을 명시했다. stored 쪽은 `updateStoredBatchAccountBinding()`, legacy 쪽은 `updateBatchAccount()`이며 persistence boundary와 rollback 단위가 다르다.
- 위험한 success 의미를 따로 정리했다. legacy write만 열면 visible reader가 계속 stored binding을 먼저 보여 줄 수 있고, stored write만 열면 legacy batch `accountId`/`accountHint`와 fallback이 예전 값을 남길 수 있다.
- smallest safe next cut은 `coexistence explicit mirror write`가 아니라 `reader-visible boundary tightening`으로 정리했다. 즉 same-id coexistence를 canonical account writer 미확정 상태로 더 명시적으로 고정하는 쪽이 안전하다.
- broad merge의 비범위도 함께 고정했다. coexistence explicit mirror write, legacy writer deprecation execution, stored/legacy owner merge, row rewrite, index repair는 이번 audit 범위에 포함하지 않았다.

## 검증
- 실행:
  - `git diff --check -- work/3/22/2026-03-22-n2-same-id-coexistence-account-writer-audit.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- 미실행 검증:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 audit/docs-only라 same-id coexistence writer를 실제로 구현하거나 테스트하지 않았다.
- dual-write partial failure, rollback order, 어떤 owner를 canonical success로 볼지에 대한 contract는 여전히 닫히지 않았다.
- stored-first reader parity는 많이 정리됐지만 persistence owner와 historical legacy fallback이 둘로 남아 있어, migration 없이 broad merge를 열면 visible state와 write success 의미가 다시 흔들릴 수 있다.
