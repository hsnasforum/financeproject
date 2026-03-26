# 2026-03-26 v3 import-to-planning beta ops-readiness baseline and promotion policy closeout

## 변경 파일
- `docs/current-screens.md`
- `plandoc/v3plan1.md`
- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-ops-readiness-baseline-and-promotion-policy-closeout.md`

## 사용 skill
- `planning-gate-selector`: docs/current-screens overlay note와 ops baseline closeout에 맞는 최소 검증 세트를 `pnpm planning:current-screens:guard`와 `git diff --check`로 고르기 위해 사용.
- `route-ssot-check`: `docs/current-screens.md`의 actual Public Beta inventory와 official entry/deep-link/stable destination overlay가 충돌하지 않는지 확인하기 위해 사용.
- `work-log-closeout`: 실제 실행한 Stream C 명령, 문서 동기화 범위, residual risk를 `/work` 형식으로 남기기 위해 사용.

## 변경 이유
- `plandoc/v3plan1.md`는 Stage 3과 Stage 4를 닫는 서술이 일부 가정 기반으로 남아 있었고, 실제로는 Stream C baseline 실행 기록과 current-screens 정책 overlay를 같은 기준으로 정리한 closeout note가 아직 없었다.
- 이번 라운드는 live repo root `.data`를 건드리지 않는 안전한 조건에서 `v3:doctor/export/restore/support-bundle`를 실제로 실행하고, 그 결과를 Stage 3/4 문서와 route policy 문서에 동시에 반영해 `v3plan1` completion criterion을 끝까지 닫는 것이 목적이었다.

## 핵심 변경
- `/tmp/finance-v3-ops-audit` disposable sandbox를 만들고 whitelist 대상 `.data/{news,indicators,alerts,journal,exposure,planning_v3_drafts}`만 복사해 `pnpm v3:doctor`, `pnpm v3:export`, `pnpm v3:restore` preview/apply, `pnpm v3:support-bundle`를 실제로 실행했다.
- `plandoc/v3plan1.md`, `analysis_docs/v3/03...`, `analysis_docs/v2/11...`의 Stage 3 서술을 실제 실행 사실로 바로잡고, `restore --apply`가 이미 PASS했으며 warning inventory와 archive placement semantics만 operator residual risk라는 점으로 맞췄다.
- `docs/current-screens.md`에 `Planning v3 노출 overlay 메모`를 추가해 actual `Public Beta` inventory와 official beta entry/deep-link only/stable destination tier를 분리해 읽는 기준을 명시했다.
- promotion / exposure는 broad rewrite가 아니라 explicit policy trigger에서만 다시 연다는 결론을 `plandoc`, `analysis_docs`, `current-screens` 기준으로 동기화했다.
- `planning:current-screens:guard`와 `planning:ssot:check`의 conditional 위치는 그대로 유지하고, 이번 라운드에서는 current route catalog/guard 코드가 바뀌지 않았다는 점을 `/work`에 함께 남겼다.

## 검증
- `pnpm v3:doctor`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: `ok=true checks=8 files=652 errors=0 warnings=0`
- `pnpm v3:export`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: archive=`/tmp/finance-v3-ops-audit/.data/exports/v3-data-backup-20260326124207.zip`, `scanned=787 exported=787 skipped=0`
- `pnpm v3:restore -- --in=.data/exports/v3-data-backup-20260326124207.zip`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: `errors=0 warnings=124`
- `pnpm v3:restore -- --in=.data/exports/v3-data-backup-20260326124207.zip --apply`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: `restoredFiles=787`, backup=`/tmp/finance-v3-ops-audit/.data.bak-20260326124215`, post-restore `doctor ok=true errors=0 warnings=0`
- `pnpm v3:support-bundle -- --out=.data/exports/v3-support-bundle-20260326124216.zip`
  - 실행 위치: `/tmp/finance-v3-ops-audit`
  - 결과: PASS
  - 비고: `scan allowed=787`, `doctor ok=true`, `archiveBytes=3401`
- `pnpm planning:current-screens:guard`
  - 결과: PASS
  - 비고: `Test Files 5 passed`, `Tests 9 passed`
- `git diff --check -- docs/current-screens.md plandoc/v3plan1.md analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md analysis_docs/v2/11_post_phase3_vnext_backlog.md work/3/26/2026-03-26-v3-import-to-planning-beta-ops-readiness-baseline-and-promotion-policy-closeout.md`
  - 결과: PASS
- `[미실행] pnpm planning:ssot:check`
  - 이유: actual route set, href, redirect target, catalog guard 코드는 바꾸지 않았고 `docs/current-screens.md`의 overlay note만 추가했다.
- `[미실행] pnpm build`
  - 이유: route/page/runtime 코드는 바꾸지 않았다.
- `[미실행] pnpm lint`
  - 이유: TS/TSX/runtime 코드를 바꾸지 않았다.
- `[미실행] pnpm test`
  - 이유: route inventory 문서와 closeout 문서만 수정했다.

## 남은 리스크
- `pnpm v3:restore` warning 124건은 허용 경로 내 확장 파일을 structure-only inventory로만 읽는 현재 restore validator의 한계를 보여 준다. warning inventory를 더 줄일지, current behavior를 운영 문구로 고정할지는 [검증 필요]이다.
- archive를 `.data/exports` 아래에 둔 상태에서 `restore --apply`를 실행하면 현재 `.data`를 먼저 `.data.bak-*`로 rename하기 때문에 원래 archive path도 backup 쪽으로 이동한다. operator가 apply 뒤에도 같은 archive path를 유지하려면 archive placement policy를 별도로 정해야 한다. [검증 필요]
- Stream C baseline은 실제 CLI를 그대로 돌렸지만 live repo root 대신 disposable sandbox에서 실행했다. 명령 자체의 동작 증거는 확보됐으나, 실제 운영 데이터에 바로 apply하는 runbook은 여전히 더 보수적으로 다뤄야 한다.
