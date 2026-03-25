# 2026-03-22 N2 batch read owner narrowing audit

## 변경 파일
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/22/2026-03-22-n2-batch-read-owner-narrowing-audit.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: public/user-facing batch read surface에서 stored-first reader owner와 legacy bridge fallback 경계를 가장 작은 범위로 정리하는 데 사용.
- `planning-gate-selector`: docs-only audit 라운드로 분류해 `git diff --check`만 실행 검증으로 고정하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식으로 실제 수정 파일, 실행 검증, 다음 owner-narrowing cut과 남은 리스크를 정리하는 데 사용.

## 변경 이유
- same-id coexistence success/failure copy contract는 방금 닫혔으므로, 다음 `N2` cut은 writer semantics를 더 넓히기보다 public read owner를 어디까지 stored-first facade로 좁힐 수 있는지 먼저 정리할 필요가 있었다.
- 특히 여러 read surface는 이미 stored-first facade를 source-of-truth로 쓰지만, detail shell은 legacy summary fallback이 public payload에 직접 남아 있어 후속 narrowing cut 후보를 문서 기준으로 더 분명히 적어 둘 필요가 있었다.

## 핵심 변경
- `analysis_docs/v2/13...`에 `batch read owner narrowing audit` 단락을 추가해 current public reader owner map을 정리했다.
- detail, summary, categorized, transfers, balances/monthly, draft/profile, `generateDraftPatchFromBatch.ts`가 대부분 `loadStoredFirstBatchTransactions()` 또는 stored-first projection helper를 source-of-truth로 쓴다는 점을 문서에 고정했다.
- public payload에 허용되는 legacy fallback은 현재 detail shell의 `total` / `ok` / `failed` / `fileName` 같은 좁은 boundary뿐이고, 그 fallback도 shared helper 내부 bridge로만 남겨야 한다는 split을 명시했다.
- 다음 owner-narrowing cut은 broad owner merge가 아니라 detail shell legacy summary fallback boundary를 더 좁히는 것이라고 추천했다.

## 검증
- 실행:
  - `git diff --check -- analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/22/2026-03-22-n2-batch-read-owner-narrowing-audit.md`
- 미실행:
  - `pnpm test`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm e2e:rc`

## 남은 리스크
- 이번 라운드는 docs-only라 read facade나 detail shell fallback을 실제 코드에서 더 줄이지는 않았다.
- detail shell public fallback 제거 또는 축소는 아직 후속 구현 컷이며, `balances/monthly` / `draft/profile` / summary family의 internal bridge containment도 코드 기준으로 다시 열릴 수 있다.
- broad owner merge, row rewrite, index repair, writer semantics 확대는 이번 audit 범위 밖이다.
