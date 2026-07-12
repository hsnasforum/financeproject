# 2026-07-12 Issue #249 components→app import 경계 정리

## 변경 파일

- Issue: https://github.com/hsnasforum/financeproject/issues/249
- Draft PR: https://github.com/hsnasforum/financeproject/pull/266
- 기준 branch/commit: `codex/231-single-persisted-run` / `22d7b7dc117cfd253dd0f99bd8cf2b05a891134d` (Draft PR #256 위 stacked 작업)
- Planning 공용 모델: `src/app/planning/_lib/**`의 순수 UI 모듈 16개를 `src/lib/planning/ui/**`로 이동
- Report 공용 모델·UI: `src/app/planning/reports/_lib/**` 5개를 `src/lib/planning/reports/**`로, 공용 client section 4개를 `src/components/planning/reports/**`로 이동
- Workspace 공용 UI: `SnapshotPicker.tsx`, `PlanningMiniCharts.tsx`를 `src/components/planning/workspace/**`로 이동
- Route-private UI: auto-merge, auto-merge policy, planning-cleanup client를 각 `src/app/ops/**/_components`로 이동
- 경계 guard: `scripts/components_app_import_guard.mjs`, `tests/components-app-import-guard.test.ts`, `package.json`, `.github/workflows/ci.yml`
- 계약·경로 문서: `docs/package-scripts.md`, `docs/planning-v2-architecture.md`, `docs/planning-report-recommendation.md`, `docs/planning-stage-policy-mapping.md`, `docs/planning-pr-b-checklist.md`, `docs/browser-storage-inventory.json`
- import 경로 characterization: 관련 `src/components/**`, route/API/server service, Planning test 파일

## 사용 skill

- `finance-skill-routing`: 변경 범위에 필요한 Finance Project skill만 선택했습니다.
- `planning-gate-selector`: Planning UI·API import 경계 변경에 맞는 focused/전체/build/RC 검증 세트를 선택했습니다.
- `work-log-closeout`: 실제 변경, 검증 결과, 계약 영향과 잔여 위험을 이 종료 기록으로 정리했습니다.

## 변경 이유

- 구현 전 AST inventory에서 production `src/components/**` 184개 파일의 `src/app/**` reverse dependency가 27 importer, 69 edge, 27 target으로 확인됐습니다.
- 공용 component가 App Router route-private 구현을 직접 소비해 route 이동, 재사용, server/client 경계 변경 시 영향이 하위 계층으로 역전되는 구조였습니다.
- Issue #249 수용 기준에 따라 pure contract만 공용 owner로 옮기고, filesystem loader·page adapter·ops action과 page-only presentation은 `src/app/**`에 유지해야 했습니다.

## 핵심 변경

- 순수 Planning workspace/onboarding/snapshot model을 `src/lib/planning/ui/**`로 이동하고, Node filesystem을 사용하는 `snapshotList.ts`는 app/server 경계에 유지했습니다. 공용 `SnapshotListItem` 타입만 별도 pure module로 분리하고 기존 loader에서 type re-export를 유지했습니다.
- Report view model·해석·경고 집계·standalone artifact builder를 `src/lib/planning/reports/**`로 이동했습니다. 중복 `warningCatalog` façade는 삭제하고 canonical catalog를 직접 사용합니다.
- 여러 route가 쓰는 report section과 workspace UI만 `src/components/planning/**`로 이동했습니다. page-specific `ReportDashboard`, dashboard helper, report hub row builder는 app 경계에 남겼습니다.
- ops 전용 client 3개는 shared component tree에서 각 route-private `_components`로 되돌렸습니다. action과 server 소유권은 변경하지 않았습니다.
- TypeScript AST guard가 static/type-only/re-export/import type/import-equals/dynamic import/CommonJS/createRequire와 alias·relative 경로를 검사합니다. allowlist 없이 production component 187개를 검사하며 새 reverse edge는 CI에서 실패합니다.
- 기존 app 위치에서는 SSOT scan 대상이 아니었던 `Math.round` 사용 4개는 이동 전 동작을 유지하기 위해 정확한 파일 단위 baseline exclude로만 기록했습니다. 계산 로직이나 광범위 폴더 allowlist는 추가하지 않았습니다.

## 계약 영향

| 구분 | 영향 |
| --- | --- |
| Public API URL | 없음 |
| HTTP status·응답 shape | 없음 |
| Public TypeScript type | 기존 `snapshotList.ts` type re-export를 유지하며 의미 변경 없음 |
| Stored data | 없음 |
| DB schema·query | 없음 |
| Cache·revalidation | 없음 |
| Migration | 없음 |
| UI 동작·문구 | 의도된 변경 없음. import owner와 파일 위치만 변경 |
| CI | `src/components/** -> src/app/**` 신규 dependency를 fail-closed로 차단하는 guard 추가 |

## 검증

- baseline characterization focused test: 42 files / 180 tests PASS
- 이동 후 focused Planning/workspace/report test: 53 files / 244 tests PASS
- 독립 reviewer 3명: report 이동, reverse-edge inventory, AST guard 검토 후 최종 P0/P1 없음
- `pnpm test tests/components-app-import-guard.test.ts tests/planning/auth/planningPageUserScopeCoverage.test.ts`: 2 files / 19 tests PASS
- `pnpm components:app-import:guard`: PASS, production component 187개, reverse edge 0
- `pnpm exec eslint scripts/components_app_import_guard.mjs tests/components-app-import-guard.test.ts tests/planning/auth/planningPageUserScopeCoverage.test.ts`: PASS
- `pnpm typecheck`: PASS
- `pnpm planning:v2:guard`: PASS
- `pnpm planner:deprecated:guard`: PASS
- `pnpm planning:user-scope:check`: PASS, 15 files / 88 tests
- `pnpm planning:ssot:check`: PASS, 5 files / 9 tests
- `pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db pnpm test`: PASS, 808 files / 2,736 tests
- `DATABASE_URL=file:./prisma/dev.db pnpm build`: PASS, TypeScript 검사와 250개 static page 생성
- `DATABASE_URL=file:./prisma/dev.db pnpm e2e:rc`: PASS, 26 passed / production-only 조건부 1 skipped
- `pnpm multi-agent:guard`: PASS, 최신 변경 기록·skill·검증·남은 위험·다음 라운드 계약 확인
- `git diff --check`: PASS
- GitHub Actions implementation head `aec6afbe5df52c98eed3e8d61abdee8ff0f1e014`: repository code step 시작 전 외부 인프라 실패
  - CI run `29179444928`: 최초와 재시도(attempt 2) 모두 `verify.steps=[]`
  - E2E Smoke run `29179444923`: 최초와 재시도(attempt 2)의 3개 job 모두 `steps=[]`
- restore/apply 또는 실제 사용자 데이터 대상 작업은 실행하지 않았습니다.

## 남은 리스크

- 이 branch는 Issue #231 Draft PR #256의 파일 15개와 계약을 이어받아 stacked 구성했습니다. #256 없이 main에 바로 병합하면 충돌하거나 #231의 canonical run 변경이 누락될 수 있으므로 base PR을 먼저 병합하거나 명시적으로 rebase해야 합니다.
- 경로 이동량이 많아 동시에 같은 Planning 파일을 수정하는 PR과 충돌할 수 있습니다. 동작 변경은 없지만 rename detection을 유지한 상태로 병합해야 합니다.
- `planning_ssot_guard`의 파일 단위 rounding baseline 4개는 이동 전 계산식을 그대로 허용합니다. 해당 계산을 별도 정규화할 때 exclude를 함께 제거해야 합니다.
- 롤백은 Planning UI model, report model/UI, ops route-private client, AST guard·CI 연결의 네 묶음으로 되돌립니다. reverse-import guard만 제거해 fail-open으로 복귀하지 말고 문제가 있는 이동 묶음을 app owner로 함께 되돌립니다.
- GitHub Actions 계정/runner 상태가 복구되기 전에는 원격 CI/E2E 결과를 repository code PASS/FAIL로 판정할 수 없습니다. 로컬 전체 gate와 분리해 PR에 기록했습니다.

## 다음 라운드 우선순위

1. Draft PR #256을 먼저 병합한 뒤 #266을 main으로 rebase/retarget하고 import 경계 guard를 다시 실행합니다.
2. GitHub Actions 계정/runner 상태를 복구한 뒤 #266의 CI와 E2E Smoke를 재실행합니다.
3. rename conflict가 없다면 네 rollback 단위와 계약 영향 표를 기준으로 review를 진행합니다.
