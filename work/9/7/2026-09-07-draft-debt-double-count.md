# 2026-09-07 거래 draft 부채상환 이중계상 수정

## 변경 파일

- `src/lib/planning/v3/service/generateDraftPatchFromBatch.ts`: stable 필수생활지출에서 월별 debt를 제외합니다.
- `src/lib/planning/v3/service/profileDraftExpenseSemantics.ts`: 월별 비부채 fixed 중앙값과 저장 초안의 적용 전 검사를 공유합니다.
- `src/lib/planning/v3/service/preflightDraftPatch.ts`, `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`: 저장 evidence로 무부채 대상 경고와 과거 초안 오류를 반환합니다.
- `src/lib/planning/v3/service/applyDraftPatchToProfile.ts`: create/update 모두 잘못된 과거 초안의 적용을 쓰기 전에 거부합니다.
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`: 변경 수가 0이어도 경고를 안내하고, 적용 불가 원인을 표시합니다.
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`: evidence 고정지출에 부채상환이 포함된다는 표시와 stable 생활지출 설명을 추가합니다.
- `tests/planning-v3-generateDraftPatchFromBatch.test.ts`, `tests/planning-v3-preflightDraftPatch.test.ts`, `tests/planning-v3-profile-drafts-ui.test.tsx`: 통계·기존 집계·경고·차단 회귀입니다.
- `tests/planning-v3-draft-debt-cashflow.test.ts`: 실제 batch/draft/store/API → dashboard view model → simulateMonthly 통합, 보존 및 no-write 회귀입니다.
- `tests/e2e/dashboard-current-state.spec.ts`: 기존 무부채 거래 사례를 유지하고 실제 거래 debt를 포함한 생성·적용·rerun 사례를 추가합니다.
- `README.md`, `docs/planning-v3-boundary-adr.md`, 이 기록: 사용 흐름과 계산·호환 경계를 설명합니다.

## 사용 skill

- `planning-v3-batch-contract-narrowing`: stored-first/current-user 읽기와 evidence/public shape를 유지했습니다.
- `planning-gate-selector`: 집중·P0·전체·build·compat/complete·E2E 검증을 선택했습니다.
- `finance-skill-routing`: 보조 조사에서 필요한 로컬 skill 범위를 선택했습니다.
- `work-log-closeout`: 실제 재현, 실행 결과와 보존 증거를 기록했습니다.

## 변경 이유

분류는 CORE입니다. 대상은 `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`, 기준 branch는 `stage1/accuracy-safety-clean-ci-20260902`, HEAD는 `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`입니다. 시작 시 최신 기록 `2026-09-07-draft-update-existing-profile.md`와 검증 결과를 확인하고 현재 승인 변경을 snapshot으로 보관했습니다.

제품 코드를 수정하기 전에 실제 거래 batch → `generateDraftPatchFromBatch` → 저장 profile draft → preflight/apply → 기존 profile → dashboard → stale rerun → stable simulateMonthly 경로에서 이중 차감을 재현했습니다. 대표 기존 profile의 월 값은 500만원/200만원/80만원, 양수 부채 잔액과 최소상환액 50만원입니다. 거래는 소득 520만원, 비부채 fixed 210만원, variable 70만원, debt 50만원입니다.

| 항목 | 수정 전 실제 결과 | 수정 후 실제 결과 |
| --- | ---: | ---: |
| evidence fixedExpenseKrw | 2,600,000 | 2,600,000 |
| evidence debtExpenseKrw | 500,000 | 500,000 |
| profile monthlyEssentialExpenses | 2,600,000 | 2,100,000 |
| profile monthlyDiscretionaryExpenses | 700,000 | 700,000 |
| 기존 debt.minimumPayment | 500,000 | 500,000 |
| dashboard 월 생활지출 | 3,300,000 | 2,800,000 |
| dashboard 월 잉여금 | 1,400,000 | 1,900,000 |
| rerun 첫 operatingCashflow | 1,400,000 | 1,900,000 |

관측 순현금흐름은 `5,200,000 - 2,100,000 - 700,000 - 500,000 = 1,900,000`입니다. 수정 전 API/store 통합(`before-confirmed`) 및 production E2E(`before-e2e-complete`)가 기대값 190만원에 대해 실제 140만원을 반환한 실패 증거입니다.

## 핵심 변경

- stable essential은 `median(monthly fixedExpenseKrw - monthly debtExpenseKrw)`입니다. discretionary는 부채를 포함한 기존 fixed를 총지출에서 뺀 variable 그대로입니다. 전역 category 정책과 evidence의 값·필드·저장 의미는 변경하지 않았습니다.
- 부채가 관측된 생성 결과에 evidence fixed와 stable 생활지출의 차이를 설명하는 assumption을 추가합니다. 비부채 거래의 기존 patch/evidence/assumptions는 유지됩니다. 월별 fixed `[10m, 2m, 4m]`, debt `[9m, 0, 1m]`에서 올바른 결과는 2m이며, 중앙값끼리 빼면 3m가 되는 회귀를 고정했습니다.
- 대상 `debts=[]` 또는 기준 없는 생성은 관측 월 중 하나라도 debt가 있으면 `OBSERVED_DEBT_WITHOUT_PROFILE_DEBT` 경고를 표시합니다. 중앙값 0인 일부 월 상환도 포함합니다. 부채를 자동 생성하거나 기존 최소상환액을 고치지 않으며, warning-only 적용 계약을 유지합니다.
- 과거 초안의 유효한 월별 fixed/debt 근거와 stable essential이 다르면 preflight 및 create/update 적용을 거부하고 원 batch에서 재생성하도록 안내합니다. 자동 변환·저장 rewrite는 없습니다. 월별 근거가 없거나 비정형인 legacy evidence는 기존 검증 계약을 유지하며 계산을 추정하지 않습니다.
- 실제 update의 ID/default/profile count 및 자산·투자·부채·목표·세금·연금·일정을 보존했습니다. create-copy도 같은 stable 생활지출을 사용하며 base bytes는 유지합니다. 관측 상환 50만원과 모델 최소상환 30만원이 다른 두 mode에서도 기존 30만원을 보존하고 모델 잉여금 210만원을 확인했습니다.

## 검증

Windows PowerShell에서 Ubuntu Linux Git/Node와 기존 캐시 pnpm 9.15.9를 사용했습니다. `/tmp/finance-a-draft-debt-20260907/execution` 및 `full-suite/execution`에 소스 복사본을 만들고 bwrap으로 원본 `/home`와 node_modules를 읽기 전용으로 보호했습니다. 최종 full test와 build는 별도 복사본에서 같은 소스·도구체인으로 실행했습니다. 최종 build/E2E/compat/RC는 메인 에이전트가 소유했습니다. 설치·의존성 업데이트는 없습니다.

명령별 `.log`/`.json`, 시작 snapshot, `incremental.diff`, `audit.json`은 위 scratch에 있습니다. 최종 full의 증거는 `full-suite/full-test.log`/`.json`입니다. 최종 full/build/lint/typecheck/production E2E/compat/RC의 소스 집합 SHA-256은 모두 `07630dc6c530f4dbafe5c24cf2acc8c426a7f9a1d24424dd676b185e05b9c0e5`입니다. 종료 문서는 이 검사 이후 추가했습니다. scratch의 장기 보관은 보장하지 않습니다.

| 실제 실행 명령 | 결과 / 증거 label |
| --- | --- |
| `pnpm run test tests/planning-v3-draft-debt-cashflow.test.ts --maxWorkers=2 -t applies` | 수정 전 update/create 모두 140만원 재현, 의도된 2 FAIL / `before-confirmed` |
| `pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts --runtime=production --workers=1 --retries=0 --grep debt=500000` | 수정 전 실제 생성/API/화면/rerun에서 이중계상 재현, 의도된 1 FAIL / `before-e2e-complete` |
| `pnpm run test tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-draft-debt-cashflow.test.ts tests/planning-v3-preflightDraftPatch.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-update-api.test.ts tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-store.test.ts tests/planning/profileCorruption.test.ts tests/planning-v2-api/profile-corruption-route.test.ts tests/dashboard-view-model.test.tsx tests/planning-v2/simulateMonthly.test.ts tests/planning-v2/simulateMonthly.edge.test.ts tests/planning-v3-aggregateMonthlyCashflow-v2.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts tests/planning-v3-draft-profile-api.test.ts --maxWorkers=2` | 16 files / 309 PASS / `focused-final` |
| `pnpm run test tests/planning-v3-draft-debt-cashflow.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-preflightDraftPatch.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-update-api.test.ts tests/planning-v3-profile-drafts-ui.test.tsx --maxWorkers=2` | 과거 초안 차단 보완 후 7 files / 91 PASS / `old-draft-focused` |
| `pnpm run test --maxWorkers=2` | 최종 875 files / 3,756 PASS / `full-suite/full-test`; 비정형 evidence 4사례까지 포함 |
| `pnpm typecheck` | 최종 runtime 종료 후 PASS / `last-typecheck` |
| `pnpm lint` | 최종 PASS / `last-lint` |
| `pnpm build` | 최종 PASS / `final-build` |
| `pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts tests/e2e/v3-draft-apply.spec.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts --runtime=production --workers=1 --retries=0 --grep 'transaction profile draft\|planning v3 profile draft\|planning v3 transactions'` | production 6 PASS / `production-e2e` |
| `pnpm planning:v2:compat` | PASS, 내부 `planning:v2:complete` PASS 및 fast E2E 8 PASS / `compat-complete`; 별도 complete 중복 실행 없음 |
| `pnpm e2e:rc --runtime=production --grep 'dashboard\|planning workspace\|planning quickstart\|planning reports\|planning report detail\|planning runs\|history' --retries=0` | 관련 RC 17 PASS / 1 skip / `rc-production` |
| `git --no-optional-locks diff --check` | PASS |

실제 안전/회귀 확인:

- debt 없는 거래 및 debtExpense 0에서 생활지출과 기존 evidence가 동일합니다. v3 aggregate의 fixed는 debt 포함 260만원, variable은 70만원으로 유지됩니다.
- 무부채 대상의 update/create/template preflight는 경고를 반환하고 적용 후에도 `debts=[]`입니다. 변경 항목 0일 때에도 UI 경고가 표시되며 정상 안내로 바뀌지 않습니다.
- 과거 debt 포함 초안은 create(생략 포함)/update/template 및 부채 유무 조합에서 400/no-write입니다. preflight도 오류를 반환하며 전체 fixture bytes가 동일합니다. 기존 P0 손상·legacy·Vault·충돌 회귀는 focused/full에서 통과했습니다.
- production 새 사례는 합성 CSV를 실제 batch에 저장하고 category override 후 실제 draft 생성 API를 호출합니다. 미선택 차단 → preflight → 동시 이름 수정으로 409/no-write → 재점검 → 기존 A 갱신 → dashboard stale → 명시 rerun → report → dashboard current를 실행했습니다. profile ID 목록과 default는 유지되며 과거 run record/meta bytes는 동일합니다.
- rerun 검사는 별도 재계산 추정이 아니라 실제 저장 simulate blob의 `keyTimelinePoints`에서 `monthIndex=0`의 첫 engine row를 읽어 `operatingCashflow=1,900,000`을 검증합니다.
- 원본 branch/HEAD와 raw Git index SHA-256 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`를 유지했습니다. 시작 snapshot 대비 이번 15개 파일의 증분만 존재합니다. 전역 category policy, stable engine/dashboard 계산, profileStore, package/lock/config/skills 및 그 밖의 승인 변경은 보존했습니다. dependency 검사 대상 hash/mtime도 동일하며 새 preservation exception은 없습니다.

검증 중 수정한 사항:

- 초기 합성 일정은 현재 월을 포함하지 않아 기존 엔진 규칙에 따라 월 소득/생활지출이 0이었습니다. 제품을 변경하지 않고 0-based 현재 구간에서 profile 월 값을 사용하는 override fixture로 교정했습니다. create-copy의 기존 목표 기본값 정규화도 fixture에 명시했습니다.
- E2E 저장 결과는 전체 timeline이나 timelineSampled가 아니라 `runArtifacts`의 keyTimelinePoints를 사용합니다. 첫 두 E2E의 잘못된 검사 경로를 고친 뒤 `before-e2e-complete`로 수정 전 전체 경로를 재현했습니다.
- 새 warning 도입 중 legacy 월별 evidence 누락에서 preflight 500 3건이 발생해 수정했습니다. 정적 리뷰에서 과거 저장 초안 우회 적용과 비정형 evidence 예외를 추가로 보완하고 최종 full/typecheck/lint/build/E2E를 모두 다시 확인했습니다.
- 중간 `before-build`/`final-full-test`의 source_preserved=false는 검사 복사본 실행 중 원본에 테스트 또는 후속 보완을 작성했기 때문입니다. 이 결과를 최종 소스 검증으로 재사용하지 않았고 최종 표식 07630dc6…의 검사들은 모두 source_preserved=true입니다.

## 남은 리스크

- 월별 근거가 없는 legacy partial evidence로는 과거 초안의 부채 포함 여부를 판정할 수 없습니다. 원 batch에서 새 초안을 생성해 확인해야 하며 자동 추정·이전은 하지 않습니다. 기존 profile/run의 잘못된 과거 값도 자동 수정하지 않습니다.
- stable 부채가 없거나 관측값과 최소상환액이 다르면 stable 결과는 거래의 실제 순현금흐름과 다를 수 있습니다. 무부채 경고 정책을 적용했으며 새 부채 생성, matching solver, 최소상환액 자동 수정은 없습니다.
- 검증은 합성 거래·프로필·snapshot입니다. 실제 개인 거래 데이터와 수동 5분 self-test는 실행하지 않았습니다. 관련 RC의 `planning reports keeps an unauthenticated response distinct and retries it`은 기존 fixture 조건으로 skip됐으며 PASS로 집계하지 않았습니다. RC 전체가 아닌 영향 범위의 선택 실행입니다.
- 격리 fixture DB에서 `ExternalSourceSnapshot` 테이블 누락 로그가 있었지만 해당 외부 데이터 연동을 수정하지 않았고 요청한 production 흐름들은 통과했습니다.
- 이번 라운드는 부채상환 이중계상 정확성 수정·검증·기록으로 완료합니다. 다음 우선순위는 별도 CORE의 plan-vs-actual이며 이번 task에는 구현하지 않았습니다.
