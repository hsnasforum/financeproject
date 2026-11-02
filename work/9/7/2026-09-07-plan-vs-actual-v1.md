# 2026-09-07 거래 관측 기반 Plan-vs-Actual v1

## 변경 파일

- `src/lib/planning/v3/service/planVsActual.ts`: 기준 run 선정, 월별 evidence 계산, 독립 중앙값과 차이, 기존 run 목록 GET 조회입니다.
- `src/app/planning/v3/profile/drafts/[id]/_components/PlanVsActualSection.tsx`: 비교 표, 기간과 근거 안내, loading/비교 불가/조회 실패/재시도입니다.
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`: 선택한 profileId와 저장 draft evidence를 비교 컴포넌트에 전달합니다.
- `src/lib/planning/v2/resultDto.ts`: raw-only legacy 결과를 canonical DTO로 만들 때 누락된 현금흐름 숫자를 0으로 채우지 않습니다. 기존 optional 필드와 schema version을 유지합니다.
- `tests/planning-v3-plan-vs-actual.test.tsx`, `tests/planning-v3-plan-vs-actual-api.test.ts`: 계산·선정·표시·legacy·목록 페이지·사용자 범위·no-write 회귀입니다.
- `tests/e2e/dashboard-current-state.spec.ts`: 기존 두 거래 draft 사례를 보존하고 과거 플랜→이후 거래→비교→update→stale→rerun→current 실제 경로를 추가했습니다.
- `README.md`, `docs/planning-v3-boundary-adr.md`, 이 기록: 사용자 흐름과 계산·읽기 경계 및 한계를 설명합니다.

## 사용 skill

- `planning-v3-batch-contract-narrowing`: 저장된 사용자 범위의 evidence를 읽고 기존 writer와 draft 데이터 계약을 보존했습니다.
- `planning-gate-selector`: 계산·ResultDto·UI·실제 API와 planning completion 영향에 필요한 검증을 선택했습니다.
- `work-log-closeout`: 수행한 검증, 중간 실패와 보완, 보존 증거를 기록했습니다.

## 변경 이유

분류는 CORE입니다. 대상은 `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`, 기준 branch는 `stage1/accuracy-safety-clean-ci-20260902`, HEAD는 `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`입니다. 직전 `2026-09-07-draft-debt-double-count.md`와 실제 검증 기록을 읽고, 시작 시 승인 변경 전체를 파일별 snapshot으로 확보했습니다.

현재 profile의 월 값은 실제 거래 자체가 아닙니다. 따라서 ACTUAL은 저장 draft의 `evidence.ymStats`만 사용하고, PLAN은 같은 profileId의 저장 완료 run의 canonical ResultDto를 사용합니다. 사용자 요청의 생활지출 식에서 변동지출 앞의 기호는 목표·대표 사례에 맞춰 `비부채 고정지출 + 변동지출`로 해석하고 구현 전에 알렸습니다.

## 핵심 변경

- 명시적인 `SUCCESS`/`PARTIAL_SUCCESS` 일반 run 중 관측월보다 이전에 저장된 최신 run을 고릅니다. 다른 profile, FAILED/RUNNING, 상태 미확인, `input.scenario` 또는 top-level `scenario`가 있는 what-if run은 제외합니다. 최신 후보의 지표가 부족하면 더 오래된 플랜으로 조용히 바꾸지 않습니다.
- 월 경계는 저장 timestamp의 UTC 월입니다. 같은 월 거래는 제외하고 다음 달 이후 `ymStats`만 사용합니다. 월별 `living=max(0,fixed-debt)+variable`, `operating=income-living-debt`를 먼저 계산한 뒤 네 지표의 중앙값을 각각 구합니다. 중앙값은 원 단위로 반올림합니다. 수입·지출·부채 차이의 합을 정확한 원인 분해라고 주장하지 않습니다.
- PLAN 숫자는 canonical start point만 사용합니다. 누락 필드의 legacy raw 변환을 보완했고, 이미 저장된 0원 DTO라도 남은 raw 첫 월 자료에서 누락이나 0과의 불일치를 확인할 수 있으면 비교를 차단합니다. raw 자료는 오류 확인에만 쓰며 계획 숫자를 대신하지 않습니다.
- draft 상세의 기준 프로필 선택 후 네 지표를 계획 기준 / 최근 실제 중앙값 / 차이로 표시합니다. 저장일과 사용 월, 잉여현금 높음·낮음·같음, 비교 불가 이유와 조회 재시도를 제공합니다. profile 변경은 컴포넌트 key와 AbortController로 이전 응답을 차단합니다.
- 기존 runs GET를 페이지 단위로 읽으며 조회 실패 시 부분 목록으로 비교하지 않습니다. 비교 결과 저장, 새 API/저장소/schema, 자동 apply/rerun, 부채 생성·matching·최소상환액 수정, 과거 profile/run rewrite는 추가하지 않았습니다. 기존 preflight와 명시적 update/create→stale→rerun 경계를 유지합니다.

## 검증

Windows PowerShell에서 Ubuntu의 Linux Git과 기존 캐시 `corepack pnpm@9.15.9`를 사용했습니다. `/tmp/finance-a-plan-actual-20260907/execution` 및 `full-suite/execution`은 검증용 소스 복사본입니다. bwrap으로 원본 `/home`와 node_modules를 읽기 전용으로 보호했고, 기존 의존성을 그대로 사용했습니다. 최종 build/E2E/complete/RC는 메인 에이전트가 단일 소유자로 실행했습니다.

실행 로그와 결과 JSON, 시작 snapshot, `incremental.diff`, `audit.json`은 위 scratch에 있습니다. 최종 full test, lint, typecheck, complete, production E2E/RC의 소스 집합 SHA-256은 `db4170a5c3ea1537186ddfe6c23e06e41f50a145e6d07003e2198e50750bd753`입니다. 최종 build의 소스 집합 hash는 `b4ff1778e21843b1a839ce81c37cb0e5d0ddd9b54a4fa501ce2bd92c45a0a03a`이며, 이후 바뀐 파일은 E2E fixture와 경계 문서 두 개뿐임을 실제 hash로 확인했습니다. 제품 소스는 build 결과와 동일합니다. 최종 타입·린트는 fixture 보완까지 포함합니다. 종료 문서는 검증 후 추가했습니다.

| 실제 명령 | 결과 / 증거 label |
| --- | --- |
| `pnpm run test tests/planning-v3-plan-vs-actual.test.tsx tests/planning-v3-plan-vs-actual-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts tests/planning-v3-profile-drafts-ui.test.tsx tests/planning/v2/resultDto.test.ts tests/planning/reports/stableReportScenarios.test.tsx tests/planning/auth/reportRunScopeLoaderPageAuth.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-v3-draft-debt-cashflow.test.ts tests/planning-v3-profile-draft-update-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/dashboard-view-model.test.tsx --maxWorkers=2` | 13 files / 193 PASS / `focused-final` |
| `pnpm run test tests/planning-v3-plan-vs-actual.test.tsx tests/planning-v3-plan-vs-actual-api.test.ts --maxWorkers=2` | legacy 보완 후 2 files / 37 PASS / `legacy-focused` |
| `pnpm run test tests/planning/ops/planning-cache-route-user-scope.test.ts --maxWorkers=2` | 6 PASS / `cache-scope-recheck` |
| `pnpm run test --maxWorkers=2` | 최종 877 files / 3,793 PASS / `full-suite/final-full-test` |
| `pnpm typecheck` | 최종 PASS / `final-typecheck` |
| `pnpm lint` | 최종 PASS / `full-suite/final-lint` |
| `pnpm build` | 최종 제품 소스 PASS / `final-build` |
| `pnpm planning:v2:complete` | PASS, 내부 fast E2E 8 PASS / `complete` |
| `pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts tests/e2e/v3-draft-apply.spec.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts --runtime=production --workers=1 --retries=0 --grep 'transaction profile draft\|planning v3 profile draft\|planning v3 transactions'` | production 7 PASS / `production-e2e-verified` |
| `pnpm e2e:rc --runtime=production --grep 'dashboard\|planning workspace\|planning quickstart\|planning reports\|planning report detail\|planning runs\|history' --retries=0` | 관련 RC 17 PASS / 1 skip / `rc-production` |
| `git --no-optional-locks diff --check` | PASS |

대표 production E2E는 실제 profile API, `resolvePlanningRunAssumptions`/stable simulate/실제 run store로 만든 합성 과거 완료 run, CSV import/batch/category override, 실제 draft 생성 API와 상세 화면을 사용했습니다. run 저장일은 2026-06-15이며 6~8월 거래 중 7~8월만 비교합니다. safety 정책과 비상자금 부족 조건으로 첫 계획월의 추가 상환이 없는 대표 플랜을 구성했습니다.

| 지표 | 계획 기준 | 거래 2개월 중앙값 | 실제−계획 |
| --- | ---: | ---: | ---: |
| 월 수입 | 5,000,000 | 5,200,000 | +200,000 |
| 생활지출(부채 제외) | 2,800,000 | 2,800,000 | 0 |
| 부채상환 | 500,000 | 500,000 | 0 |
| 운영 잉여현금 | 1,700,000 | 1,900,000 | +200,000 |

실제 확인한 경계:

- 비교 진입/프로필 선택 과정에 client planning POST/PATCH 요청이 없고 profile/run/draft 파일 bytes 및 profile/run 수가 그대로였습니다. API 통합에서는 fixture 저장소 전체 bytes를 비교했습니다.
- 다른 사용자 namespace의 동일 profileId run과 같은 사용자의 다른 profile run은 유입되지 않습니다. 다른 사용자가 draft를 읽으면 404이며 쓰기가 없습니다. 현재 profile의 소득을 900만원으로 둬도 실제는 evidence의 520만원, 계획은 저장 DTO의 500만원입니다.
- 월별 operating `[1m,2m,3m]`의 중앙값 2m와 개별 metric 중앙값 차이 3m가 구분됩니다. 동일 월의 극단적 관측값 제외, 비교 이후 월 없음, 상태/scenario/profile 제외, partial success, genuine zero, 지표 누락 및 비정형/중복 evidence도 검사했습니다.
- raw-only legacy와 이미 materialized된 zero DTO+raw 누락 모두 실제 GET에서 비교 불가이고 저장 bytes가 유지됩니다. raw가 genuine 0이면 0을 유지합니다.
- 비교 이후 기존 preflight→동시 수정 충돌 409/no-write→재점검→A update→dashboard stale→명시 1-click rerun→report→current를 통과했습니다. 기존 profile ID/default/count와 자산·부채·목표·세금·연금·일정을 보존하고, 기존 run record/meta를 보존했습니다. 새 rerun의 실제 simulate blob 첫 operatingCashflow는 1,900,000입니다.
- production screenshot을 실제로 열어 네 지표·관측월·문구의 렌더링을 확인했습니다. 수동 기기별 UX 테스트는 수행하지 않았습니다. Playwright 출력 폴더는 후속 실행에서 재사용됩니다.
- 시작 snapshot 대비 이번 변경은 위 9개 구현·테스트·문서와 종료 기록 1개입니다. branch/HEAD 및 raw Git index SHA-256 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`를 보존했습니다. 기존 승인 변경, dependency 검사 대상 hash/mtime, 전역 category 정책, draft apply/preflight writer, dashboard 계산, stable 엔진, package/lock/config/skills를 보존했으며 새 preservation exception은 없습니다.

검증 중 확인하고 수정한 사항:

- 첫 pure test의 `it.each` 배열 인자 해석 오류와 E2E fixture의 약한 타입 전달 오류를 수정했습니다. 최종 full/typecheck에 포함됩니다.
- 첫 full/build 병렬 실행 중 기존 `planning-cache-route-user-scope` 1건이 5초 timeout으로 실패했습니다. 같은 소스의 해당 파일 단독 실행은 6개 모두 통과했고, 최종 전체 테스트를 빌드와 분리해 단독 실행하여 3,793개 전부 통과했습니다. timeout 설정이나 해당 테스트 코드는 바꾸지 않았습니다.
- 최초 대표 E2E에서 balanced 정책의 저장 `debtPaymentKrw`는 추가 상환을 포함해 5,016,368.7원이었습니다. UI는 저장값을 정확히 표시했습니다. 제품 계산을 바꾸지 않고 추가 상환이 없는 safety 합성 조건으로 fixture를 교정했습니다.
- 다음 E2E는 과거 fixture의 재현 가정 hash 누락으로 기존 rerun guard가 `RERUN_CONDITIONS_CHANGED` 409를 반환했습니다. 실제 assumptions resolver와 reproducibility builder로 fixture의 가정을 완성한 뒤 전체 production 선택 7개를 다시 통과했습니다. rerun guard는 변경하지 않았습니다.
- 정적 리뷰에서 이미 저장된 synthetic zero의 식별 가능한 경계를 보완했습니다. 재검토에서 추가 actionable finding은 없었으며, 원자료 없는 compact DTO의 한계는 아래에 남깁니다.

## 남은 리스크

- 원자료가 없는 compact legacy DTO에서는 과거 누락을 채운 0과 실제 0을 구분할 provenance가 없습니다. 알려진 누락은 차단하지만 이 과거 식별 불가능성은 해소하지 않았고 자동 rewrite하지 않습니다.
- 기존 runs API에는 total/next가 없습니다. 읽기 불가능한 record만으로 한 페이지 전체가 비는 경우 그 뒤 기록 존재를 판별할 수 없고, 여러 offset 조회는 동시 생성·삭제에 대한 원자적 snapshot이 아닙니다. 짧은 nonempty 페이지는 계속 조회하고, 실패한 부분 목록은 사용하지 않습니다.
- 계획의 상환액은 저장 당시 추가 상환까지 포함하므로 현재 profile의 최소상환 기준 dashboard 잉여금과 다를 수 있습니다. 이번 비교는 요청된 canonical 세 숫자의 차를 사용하며 서로 다른 지표를 동일하다고 부르지 않습니다.
- 실제 개인 거래 데이터와 수동 5분 self-test는 수행하지 않았습니다. RC의 기존 `planning reports keeps an unauthenticated response distinct and retries it`은 fixture 조건으로 skip됐으며 PASS로 집계하지 않았습니다. RC는 영향 범위 선택 실행입니다. fixture DB의 `ExternalSourceSnapshot` 테이블 누락 로그는 별도 외부 연동 범위이며 요청한 흐름들은 통과했습니다.
- 저장 schema·migration을 변경하지 않아 `planning:v2:compat`를 반복 실행하지 않았습니다. legacy 숫자 투영은 focused/API/full 및 complete로 검증했습니다.
- 이번 CORE의 읽기 비교와 기존 갱신 흐름 검증을 완료했습니다. 월별 전체 timeline 정밀 추적, 목표별 actual 성과, 자동 다음 행동 개선은 별도 필요성이 확인될 때만 검토할 범위입니다.
