# 2026-03-22 N2 detail remaining legacy fallback retirement boundary audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-detail-remaining-legacy-fallback-retirement-boundary-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail fallback surface만 좁게 보고 `pure legacy`와 `old stored meta without importMetadata`의 경계를 문서 기준으로 분리하는 데 사용.
- `planning-gate-selector`: 이번 라운드를 docs-only audit으로 분류해 `git diff --check`만 실행 검증으로 선택하고, 테스트/빌드/린트/e2e는 미실행 검증으로 남기는 데 사용.
- `work-log-closeout`: 표준 `/work` 섹션 순서와 실제 실행 사실만 남기는 closeout 형식에 맞춰 기록하는 데 사용.

## 변경 이유
- latest detail helper는 `batch.failed`, `stats.failed`, `fileName`을 `stored importMetadata -> legacy summary fallback` 순서로 읽지만, 다음 컷 후보로 남은 historical fallback class 두 종류를 아직 같은 문제처럼 묶어 두고 있었다.
- `pure legacy`는 stored owner 부재 때문에 detail compat surface를 유지하는 문제이고, `old stored meta without importMetadata`는 stored owner는 있으나 historical metadata slot이 비어 있어 helper bridge가 남는 문제라서, 이 둘을 분리하지 않으면 다음 코드 컷이 과도하게 커질 위험이 있었다.

## 핵심 변경
- `analysis_docs/v2/13...`의 `detail failed/fileName legacy fallback audit`에 historical fallback class split을 추가해 `legacy-only`와 `importMetadata` 없는 hybrid old stored meta를 별도 class로 나눠 설명했다.
- 같은 문서에서 `smallest safe next cut`을 class별 선행조건으로 다시 고정했다. old stored meta는 backfill/migration 또는 helper-owned retention window 결정이 먼저고, pure legacy는 compat surface/visibility retirement 판단이 먼저다.
- `analysis_docs/v2/13...`의 broad fallback 제거 위험 설명에 두 historical class를 같은 migration 대상으로 문서화하면 다음 컷이 과도해진다는 리스크를 추가했다.
- `analysis_docs/v2/11...` backlog 연결 메모는 다음 `N2` cut에서 old stored meta와 pure legacy를 서로 다른 판단 축으로 분리해야 한다는 점만 좁게 동기화했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-detail-remaining-legacy-fallback-retirement-boundary-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only audit이라 detail helper나 test contract는 바꾸지 않았다.
- `old stored meta without importMetadata`에 대해 actual backfill/migration을 할지, helper-owned explicit bridge retention으로 남길지는 아직 결정하지 않았다.
- `pure legacy` detail surface를 언제까지 사용자 compat로 유지할지 닫히지 않으면, 이후 fallback 제거 라운드가 visibility/guard 정책까지 한 번에 건드릴 수 있다.
- smallest safe next cut: `old stored meta without importMetadata`를 helper-owned compat bridge로 얼마나 오래 유지할지, batch metadata backfill이 필요한지부터 docs-first로 더 좁게 판단한다.
