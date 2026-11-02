# Finance A → main selective apply 종료 기록

작업 기준일: 2026-09-08 (Asia/Seoul). 승인된 80개 A milestone과 main 전용 dashboard model 지원 1개를 통합했습니다. SOURCE_APPLIED=true, TASK_COMPLETED=true입니다. 전체 RC의 기존 실패 9개는 적용 전 main의 별도 production 빌드에서도 동일 항목으로 재현되어 승인 문서의 pre-existing failure 예외로 분리했습니다. RC 전체 PASS를 뜻하지 않습니다.

## 핵심 변경

1. profile corruption/startup 사전 검증, legacy 금액·기간 보존, atomic write 실패 시 자기 임시 파일 정리를 통합했습니다.
2. 목표 배분·기한·ResultDto 연결, legacy debt 호환, 저장된 시나리오/shortWhy 및 리포트 해석을 통합했습니다.
3. main dashboard model/8초 timeout/abort/부분 실패/다음 행동을 유지하며 현재 프로필 6지표와 current/stale/missing/unverified/failed, 한 번 클릭 재실행을 연결했습니다.
4. v3 초안의 같은 프로필 업데이트/CAS/월별 3개 필드 제한, 부채 지출 중복 차감 보정과 읽기 전용 Plan-vs-Actual 비교를 통합했습니다.
5. main 인증 계약에 맞춘 dashboard E2E를 dev/prod 통과 후 추가하고, 역사적 /work 12개는 A와 byte-identical로 보존했습니다.

## Preflight 및 실행 환경

- source: `/home/xpdlqj/code/finance`
- A: `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`
- Windows PowerShell에서 `wsl.exe -d Ubuntu`로 실행했습니다. authoritative Git은 `/usr/bin/git --no-optional-locks`입니다.
- 실행 도구: `/usr/bin/node` v22.23.2, corepack pnpm 9.15.9. package의 Node 22.22.2 pin과 patch 버전 차이 경고가 있었으며 기존 실행 환경을 유지했습니다.
- MODEL_REQUESTED=gpt-6-astra/high. runner 제공 모델 목록에서 지원 조합을 확인했으나 현재 turn의 effective model/effort는 런타임으로 확인할 수 없어 MODEL_EFFECTIVE=unverified입니다. 전역 설정은 변경하지 않았습니다.
- staged entries는 A/main 모두 0이었으며 아래 값이 승인 baseline과 모두 일치한 뒤 적용했습니다.

| 대상 | 항목 | 승인값과 일치한 실제 값 |
|---|---|---|
| main | branch | `main` |
| main | head | `6a51f8d3a24394ba239838a78c8c19aa590fc180` |
| main | index | `8964813b4f6d78a1b991d0d82d512b67956e100caa79046b2a6dfd205b92c309` |
| main | status | `b08c807c535ab164247fe0762a21a401cb9f2260b8c22375b16035cac78b6df8` |
| main | manifest | `6ef3551e6dd0ea5fa1fcaf8432bf07aacadc4b3121909fafa7d1e65b845b06c6` |
| A | branch | `stage1/accuracy-safety-clean-ci-20260902` |
| A | head | `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a` |
| A | index | `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c` |
| A | status | `e18faa8ca22a0eeda813733ccc0a3f620fb88739e556cd07940d60cfd7d13f77` |
| A | manifest | `942b4dc08a6ba66f93f400d2d62f403f465b7610f05328e84c0063b5069149d6` |

dirty manifest는 정렬된 상대 경로마다 `path + NUL + SHA256(file bytes) + LF`를 연결하여 계산했습니다. main dirty 파일 433개와 A frozen 파일 80개를 확인했습니다.

## 적용 분류와 reconcile

| 분류 | 최종 처리 |
|---|---|
| CLEAN_APPLY 75 | A 최종 HEAD→working-tree 증분만 통합. 74개는 hunk 그대로 적용했고 v3 ADR은 main writer-lease 문맥 때문에 같은 승인 문단을 수동 삽입했습니다. |
| RECONCILE 4 | DashboardClient, dashboard-view-model test, e2eTest helper, planning-v2-ops를 양쪽 계약을 보존하도록 통합했습니다. |
| main-only SUPPORT 1 | dashboardClientModel의 current profile/plan 타입·검증된 rerun 요약을 확장했습니다. |
| BLOCKED_UNKNOWN 1 | dashboard-current-state E2E를 main runtime에 맞춰 조정했고 dev/prod 실측 PASS 후 최종 source에 추가했습니다. 최종 blocked 항목은 없습니다. |

Dashboard는 current-profile run을 다음 행동에 우선 사용하고 global latest fallback의 실행/프로필 대상을 명시합니다. 현재 월 지표는 current profile에서만 계산합니다. main의 fetchDashboardJson, abort, resource 상태, parsing/formatting 및 기존 export는 유지했습니다. 통합 dashboard 테스트 40개가 통과했습니다.

E2E helper에는 기존 main HMR 예외 목록을 유지하며 `/dashboard`만 추가했습니다. Ops 문서는 profile 개별 저장 오류 계약과 backup replace rollback 계약을 구분하고 desktop-local writer 경계를 유지했습니다. ADR/README/dev/user 문서의 기존 main 문단도 보존했습니다.

Plan-vs-Actual의 median 반올림은 main SSOT guard에 맞춰 기존 `roundToInteger`를 사용하도록 좁게 조정했습니다. 정수 중간 인덱스는 `Math.trunc`이며 유효 숫자와 비유한 값의 기존 의미를 유지합니다. SSOT baseline이나 금융 guard를 수정하지 않았습니다.

## Dashboard E2E 인증·fixture

- development는 기존 header 기반 사용자 격리를 유지합니다.
- production은 wrapper/config가 제공하는 `planning.desktop-session` cookie를 사용하며 일반 fixture에 raw identity header를 추가하지 않습니다.
- profile seed는 stable `/api/planning/v2/profiles`를 사용합니다. direct-store seed는 필수 `PLANNING_DATA_DIR` 및 API `meta.userId`를 사용한 user scope 안에서만 실행합니다.
- production에서 `x-planning-user-id`, `x-auth-user-id` 각각 HTTP 403을 반환하는 검사를 통과했습니다. 제품의 RAW_IDENTITY_HEADERS_FORBIDDEN 경계를 유지했습니다.
- 같은 프로필 업데이트, 충돌 후 검토, debt=0/500000, Plan-vs-Actual, stale→current, 이중 클릭/응답 유실 idempotency, snapshot 누락 시 no-write/retry를 실제 브라우저로 확인했습니다.
- 최종 spec SHA-256: `3dafd96166b31d672ae88fd0f6f01118145594d6d71dec8857f9138c2a540274`. 검증한 execution 파일과 source가 byte-identical입니다.

## 검증 방법과 실제 결과

실제 사용자 데이터와 dirty source를 보호하기 위해 `/tmp/finance-selective-apply-20260908/execution`에 source 복사본을 만들고 bwrap에서 `/mnt`로 실행했습니다. 원본 source, Git/index 및 기존 node_modules는 read-only mount이며 build/cache/DB/test data는 scratch에만 생성했습니다. 설치 없이 기존 Linux 의존성을 사용했습니다. 검증 복사본과 main의 코드/테스트/문서 hash를 최종 대조했고 차이가 없었습니다. `next-env.d.ts`의 빌드 생성 변화는 execution에만 남겼습니다.

아래 명령은 기존 package.json script를 corepack pnpm으로 실행했습니다. 각 실행의 전체 argv, exit code, 시간은 scratch의 `<label>.json`, 출력은 `<label>.log`에 있습니다.

| 검증 | 실제 결과 | 로그 label |
|---|---|---|
| focused storage/legacy/goals/rerun/draft/Plan-vs-Actual | 17 files / 354 tests PASS | focused-storage-retry |
| auth/user/backup/profile/report 회귀 | 29 files / 296 tests PASS | focused-regression |
| dashboard 통합 | 40 tests PASS | dashboard-focused |
| Plan-vs-Actual 반올림 | 2 files / 37 tests PASS | plan-actual-rounding |
| `pnpm run test --maxWorkers=2` | 903 files / 3910 PASS / 4 skipped | full-test-verified |
| `pnpm typecheck` | PASS | typecheck |
| `pnpm lint` | PASS | lint |
| `pnpm build` | PASS, production standalone build | build |
| `pnpm planning:v2:compat` | PASS; 내부 planning:v2:complete/report/guide/fast E2E 8개 PASS 포함 | compat-final |
| `pnpm planning:ssot:check` | PASS; route catalog 5 files / 11 tests | ssot-final |
| `pnpm planning:user-scope:check` | 15 files / 91 tests PASS | scope-final |
| `pnpm sec:check` | PASS; mutation 132개 전부 분류 | security-final |
| dashboard + v3-draft-apply + import-to-cashflow, development | 10 PASS / production-only 1 skipped | core-e2e-dev |
| 동일 core subset, production | 11 PASS | core-e2e-prod |
| existing `pnpm e2e:rc --runtime=production --retries=0` | 41 PASS / 9 FAIL / 1 skipped | e2e-rc-prod |
| 적용 전 main production build | PASS | baseline-build |
| 적용 전 main에서 RC 실패 9개만 재현 | 동일한 9개 항목 실패; 아래 분리 근거 참조 | baseline-rc-failures |
| `git --no-optional-locks diff --check` | PASS | source 직접 실행 |

타입/린트/빌드 시점에도 최종 dashboard spec이 execution에 포함돼 있었습니다. source에는 dev/prod E2E 완료 후 동일 bytes를 추가했습니다. 별도 수동 5분 self-test나 실제 사용자 데이터로 실행한 검증은 주장하지 않습니다.

초기 검증의 환경 오류도 숨기지 않습니다. pnpm 인자 위치 오류, `/tmp` 경로의 Playwright ignore, 격리 환경의 GIT_WORK_TREE 상속, unmapped root owner, node_modules realpath, EXDEV, WSL resolv.conf mount 누락, temp fixture의 상위 Git 탐색을 scratch runner에서 수정했습니다. unit/API 실패는 수정 전 main 복사본에서도 재현했고, 환경을 바로잡은 뒤 최종 전체 test가 통과했습니다. 제품 테스트·security guard·설정·의존성은 완화하지 않았습니다. 최초 SSOT 실패는 위에 명시한 승인 범위 Plan-vs-Actual 반올림 호출 조정으로 해결했습니다.

## 기존 RC 실패 분리 근거

승인 전 파일 bytes로 baseline-execution을 재구성하고 별도 production 빌드에 성공한 뒤, 실패한 9개만 다시 실행했습니다. 통합본은 workers=1, baseline 재현은 독립 fixture 대상으로 workers=2이며 runtime/auth/config/test 원문은 같습니다. DART·data-source·recommendation 관련 source와 아래 spec들은 이번 apply에서 변경하지 않았습니다. 통합 E2E helper 변경은 `/dashboard` 예외 추가뿐입니다.

| 실패 위치 | 통합본 / 적용 전 main에서 확인한 원인·증상 |
|---|---|
| `tests/e2e/dart-flow.spec.ts:3` | 양쪽 모두 검색 인덱스가 없어 같은 검색 준비 안내를 표시함. 비동기 isVisible 분기에 따라 통합본은 search-item, baseline은 build-index-button assertion에서 실패했으며 두 error-context의 화면 상태를 대조함. |
| `tests/e2e/data-sources-settings.spec.ts:3` | metadata block이 보이지 않을 때 테스트가 기대하는 “집계된 카드 요약 정보가 없습니다.” 문구가 없음(37행). |
| `tests/e2e/smoke.spec.ts:163`, `:202` | production owner=default와 기존 fixture의 playwright-local storage key 불일치로 기대 key 값이 null. |
| `tests/e2e/smoke.spec.ts:239`, `:258`, `:303`, `:330` | mock 응답 owner=playwright-local이 desktop-session owner=default와 달라 결과를 거부함. 결과 패널/상세/옵션 검사가 연쇄 실패. |
| `tests/e2e/smoke.spec.ts:383` | 위 owner의 저장 key 불일치로 동일 signature의 autorun 저장 결과를 찾지 못함. |

각 실패의 통합본/baseline error signature는 `rc-baseline-comparison.json`으로 대조했습니다. 임시 포트 번호를 정규화하면 8개가 일치하고, DART 1개는 위에 적은 조건 분기 차이와 동일한 인덱스 미준비 화면으로 분리했습니다. 전체 RC PASS로 바꾸기 위한 unrelated 코드·fixture 수정은 승인 범위 밖이므로 수행하지 않았습니다. 승인 목표의 core dev/prod E2E, 보고서/히스토리 RC 항목, profile corruption RC 항목은 PASS입니다. 이에 따라 승인 문서의 “unrelated pre-existing failure가 구체적으로 분리·입증되고 승인 목표의 흐름은 PASS” 완료 조건을 적용했습니다.

## 보존 및 최종 diff

- main branch/HEAD, raw index SHA-256, staged=0 유지. A branch/HEAD/index/status/frozen 80-file bytes 유지.
- main 승인 범위 밖 기존 dirty 파일과 package/lock/config 보호 파일의 bytes 유지. 기존 node_modules를 read-only로 사용했으며 dependency install/update 없음.
- main 기존 Button/ButtonLink, DART/products/benefits/recommendation/release/desktop/backup infrastructure 변경 보존.
- 역사 /work 12개는 A와 byte-identical. 당시 A의 PASS 기록을 main 검증 결과로 고쳐 쓰지 않았습니다.
- preservation audit: issues=[]; 신규 보존 예외 없음.
- 실제 baseline→main 81개 파일 diff: `/tmp/finance-selective-apply-20260908/actual-selective-apply.patch`, SHA-256 `5f4c4ad0168aeb6eec0881c4e918e4db88b51753ed1e404aedcc55fb6d1afa1b`.
- 최종 적용 파일 hash 목록: `/tmp/finance-selective-apply-20260908/applied-manifest.json`, SHA-256 `cd68b609a023168593c1acbf53504f07e96bc2fd06b1c8e04d73abaa9a3981e9`.
- 정적 통합 검토에서 actionable finding 없음. 원본 A를 source로 기계적 전체 덮어쓰기하지 않고 hunk/문맥 단위로 통합했습니다.

## 실제 적용 파일 목록

승인 manifest 80개와 main SUPPORT 1개, 총 81개입니다. 이 종료 기록은 별도 1개입니다.

- `README.md`
- `docs/planning-v2-dev.md`
- `docs/planning-v2-ops.md`
- `docs/planning-v2-user.md`
- `docs/planning-v3-boundary-adr.md`
- `src/app/api/planning/profiles/[id]/route.ts`
- `src/app/api/planning/profiles/route.ts`
- `src/app/api/planning/v2/profiles/[id]/route.ts`
- `src/app/api/planning/v2/profiles/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
- `src/app/dashboard/_lib/dashboardViewModel.ts`
- `src/app/dashboard/page.tsx`
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/_components/PlanVsActualSection.tsx`
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- `src/components/DashboardClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/lib/planning/api/storageErrorResponse.ts`
- `src/lib/planning/core/v2/qa.ts`
- `src/lib/planning/core/v2/report.ts`
- `src/lib/planning/core/v2/simulateMonthly.ts`
- `src/lib/planning/reports/reportViewModel.ts`
- `src/lib/planning/reports/standaloneHtmlReport.ts`
- `src/lib/planning/server/runs/createRunCommandParser.ts`
- `src/lib/planning/server/runs/createRunInputContext.ts`
- `src/lib/planning/storage/atomicWrite.ts`
- `src/lib/planning/store/profileStore.ts`
- `src/lib/planning/store/runMetaRecord.ts`
- `src/lib/planning/v2/loadCanonicalProfile.ts`
- `src/lib/planning/v2/profileNormalize.ts`
- `src/lib/planning/v2/report/mapGoals.ts`
- `src/lib/planning/v2/resultDto.ts`
- `src/lib/planning/v3/service/applyDraftPatchToProfile.ts`
- `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`
- `src/lib/planning/v3/service/planVsActual.ts`
- `src/lib/planning/v3/service/preflightDraftPatch.ts`
- `src/lib/planning/v3/service/profileDraftExpenseSemantics.ts`
- `src/lib/planning/v3/service/profileRepository.ts`
- `tests/dashboard-view-model.test.tsx`
- `tests/e2e/dashboard-current-state.spec.ts`
- `tests/e2e/error-state-retry.spec.ts`
- `tests/e2e/flow-history-to-report.spec.ts`
- `tests/e2e/helpers/e2eTest.ts`
- `tests/planning-v2-api/create-run-input-context.test.ts`
- `tests/planning-v2-api/create-run-service-modules.test.ts`
- `tests/planning-v2-api/persistence-routes.test.ts`
- `tests/planning-v2-api/profile-corruption-route.test.ts`
- `tests/planning-v2-api/reports-export-html-route.test.ts`
- `tests/planning-v2/__snapshots__/simulateMonthly.snapshot.test.ts.snap`
- `tests/planning-v2/goalAllocation.test.ts`
- `tests/planning-v2/goalDeadline.test.ts`
- `tests/planning-v2/goalDeadlineConsumers.test.ts`
- `tests/planning-v2/simulateMonthly.snapshot.test.ts`
- `tests/planning-v3-draft-debt-cashflow.test.ts`
- `tests/planning-v3-generateDraftPatchFromBatch.test.ts`
- `tests/planning-v3-plan-vs-actual-api.test.ts`
- `tests/planning-v3-plan-vs-actual.test.tsx`
- `tests/planning-v3-preflightDraftPatch.test.ts`
- `tests/planning-v3-profile-draft-apply-api.test.ts`
- `tests/planning-v3-profile-draft-update-api.test.ts`
- `tests/planning-v3-profile-drafts-ui.test.tsx`
- `tests/planning/legacyDebtStorage.test.ts`
- `tests/planning/profileCorruption.test.ts`
- `tests/planning/reports/stableReportScenarios.test.tsx`
- `tests/planning/scenarioShortWhyStorage.test.ts`
- `tests/planning/v2/legacyDebtCompatibility.test.ts`
- `tests/planning/v2/resultDto.test.ts`
- `work/9/6/2026-09-06-dashboard-current-state.md`
- `work/9/6/2026-09-06-goal-allocation-order-independence.md`
- `work/9/6/2026-09-06-goal-deadline-accuracy.md`
- `work/9/6/2026-09-06-legacy-debt-compatibility.md`
- `work/9/6/2026-09-06-stage1-profile-p0-selective-apply.md`
- `work/9/7/2026-09-07-dashboard-current-plan-freshness.md`
- `work/9/7/2026-09-07-dashboard-stale-one-click-rerun.md`
- `work/9/7/2026-09-07-draft-debt-double-count.md`
- `work/9/7/2026-09-07-draft-update-existing-profile.md`
- `work/9/7/2026-09-07-plan-vs-actual-v1.md`
- `work/9/7/2026-09-07-report-scenario-to-action.md`
- `work/9/7/2026-09-07-scenario-shortwhy-storage.md`
- `src/components/dashboard/dashboardClientModel.ts`

## 사용 skill

- `finance-skill-routing`: 이번 selective apply의 최소 skill 조합 선택.
- `planning-gate-selector`: focused/full/planning/E2E 검증 범위 선정.
- `route-ssot-check`: 기존 사용자 경로/링크/route catalog 확인.
- `planning-v3-batch-contract-narrowing`: 정적 reviewer의 stored-first/current-user/draft-profile 경계 검토.
- `work-log-closeout`: 본 한국어 종료 기록 작성.

## 남은 리스크와 후속 범위

- 기존 production RC fixture/화면 기대 불일치 9건이 남습니다. 이 보고서는 RC 전체 또는 전체 production 적합성을 보증하지 않습니다.
- compact legacy DTO의 synthetic 0 provenance, runs API pagination, process-local CAS lock 범위는 기존 한계로 유지합니다.
- 실제 사용자 데이터, 실제 외부 API credentials, 별도 수동 5분 점검은 사용/수행하지 않았습니다.
- 이번 승인 목표는 종료합니다. 향후 필요 시 RC fixture 정합성은 별도 승인 범위로 다룰 항목이며 자동으로 확장하지 않습니다.

## 상태

```text
MODEL_REQUESTED=gpt-6-astra/high
MODEL_EFFECTIVE=unverified
A_PREFLIGHT_MATCHED=true
MAIN_PREFLIGHT_MATCHED=true
A_MILESTONE_APPLIED=true
DASHBOARD_RECONCILED=true
MAIN_DASHBOARD_MODEL_PRESERVED=true
DASHBOARD_E2E_MAIN_RUNTIME=PASS_DEV_AND_PRODUCTION
PROFILE_STORAGE_SAFETY=PASS
GOAL_ACCURACY=PASS
LEGACY_DEBT_COMPAT=PASS
SCENARIO_REPORT_FLOW=PASS
STALE_RERUN=PASS
DRAFT_UPDATE_EXISTING_PROFILE=PASS
DEBT_DOUBLE_COUNT_FIXED=PASS
PLAN_VS_ACTUAL=PASS
FOCUSED_GATES=PASS
FULL_TEST=PASS
TYPECHECK=PASS
LINT=PASS
BUILD=PASS
PLANNING_COMPLETE=PASS
PLANNING_COMPAT=PASS
PLANNING_SSOT=PASS
USER_SCOPE_CHECK=PASS
SEC_CHECK=PASS
E2E_RC=FAIL_PREEXISTING_9_REPRODUCED_ON_BASELINE
CORE_E2E=PASS_DEV_AND_PRODUCTION
MAIN_EXISTING_CHANGES_PRESERVED=true
MAIN_INDEX_PRESERVED=true
A_WORKTREE_PRESERVED=true
DEPENDENCIES_MODIFIED=false
NEW_PRESERVATION_EXCEPTION=none
TASK_COMPLETED=true
SOURCE_APPLIED=true
COMMITTED=false
PUSHED=false
PR_CHANGED=false
MERGED=false
RELEASED=false
```
