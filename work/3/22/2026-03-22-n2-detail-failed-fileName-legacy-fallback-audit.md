# 2026-03-22 N2 detail failed-fileName legacy fallback audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/22/2026-03-22-n2-detail-failed-fileName-legacy-fallback-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: detail route의 마지막 public legacy fallback 경계인 `batch.failed`, `stats.failed`, `fileName`만 좁게 audit하고 비범위를 고정하는 데 사용.
- `planning-gate-selector`: docs-only audit 라운드로 분류해 `git diff --check`만 실행 검증으로 선택하고, `pnpm test`/`build`/`lint`/`e2e:rc`는 미실행 검증으로 남기는 데 사용.
- `work-log-closeout`: 실제 수정 문서, 실행 검증, 다음 cut 추천, 남은 리스크를 표준 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- detail route의 `batch.total/ok`, `stats.total/ok`는 이미 stored-first/current snapshot 기준으로 좁혀졌지만, `batch.failed`, `stats.failed`, `fileName`은 아직 public payload에 남아 있는 마지막 legacy summary fallback 경계였다.
- 이번 라운드는 구현보다 audit-first가 목표이므로, 어떤 필드가 실제로 legacy bridge를 직접 읽는지와 지금 바로 더 줄일 수 있는 fallback이 있는지 문서 기준으로 먼저 잠글 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 `detail failed/fileName legacy fallback audit` 단락을 추가해 `batch.failed`, `stats.failed`, `fileName`의 current source map을 명시했다.
- 같은 단락에 `stats.failed`는 `batch.failed` alias라 별도 source가 없고, `batch.failed`/`fileName`은 current stored schema에 trusted replacement source가 없다는 점을 문서로 고정했다.
- public payload explicit bridge fallback(`batch.failed`, `stats.failed`, `fileName`)과 shared helper 내부 bridge fallback(`pickLegacyBatchFallback()`, `getStoredFirstLegacyDetailSummaryFallback()`, `buildStoredFirstVisibleBatchShell()`)의 구분을 추가했다.
- smallest safe next cut은 code change가 아니라 contract memo 정리이며, future cut이 필요하면 먼저 stored writer owner가 import diagnostics/file provenance를 어떤 persistence boundary로 소유할지 닫아야 한다는 메모를 남겼다.
- `analysis_docs/v2/11...`에는 다음 `N2` cut이 broad fallback 제거가 아니라 detail failed/fileName owner contract-first 정리라는 연결 메모를 2줄 추가했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-detail-failed-fileName-legacy-fallback-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only audit이라 detail route 코드나 test contract를 더 바꾸지 않았다.
- `batch.failed`와 `stats.failed`는 여전히 legacy summary의 parse-skip count에 의존하고, `fileName`도 여전히 legacy import provenance만 읽는다.
- current stored schema에는 이 셋을 바로 대체할 trusted source가 없으므로, broad fallback 제거는 value drift나 silent contract shrink를 일으킬 수 있다.
