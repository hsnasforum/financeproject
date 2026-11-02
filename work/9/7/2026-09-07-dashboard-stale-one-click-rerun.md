# 2026-09-07 Dashboard stale 플랜 명시 클릭 재실행

## 변경 파일

- `src/app/dashboard/_lib/dashboardViewModel.ts`: 현재 사용자·프로필의 stale 완료 run input 전달, 저장 scenario의 effective profile hash 비교.
- `src/app/dashboard/page.tsx`: 기존 dev CSRF cookie 전달.
- `src/components/DashboardClient.tsx`: stale 버튼 실행·중복 클릭 방지·오류·재시도·새 리포트 이동.
- `src/lib/planning/server/runs/createRunCommandParser.ts`: 기존 create 요청의 선택적 `rerunOfRunId` 파싱.
- `src/lib/planning/server/runs/createRunInputContext.ts`: 이전 run의 사용자/프로필/완료 상태/지원 설정 및 snapshot·effective assumptions 동일성 검사.
- `tests/dashboard-view-model.test.tsx`: 상태별 CTA, 입력 복사, scenario 및 legacy 회귀.
- `tests/planning-v2-api/create-run-input-context.test.ts`: 재사용 불가 조건의 pipeline/persistence 미호출 검사.
- `tests/planning-v2-api/persistence-routes.test.ts`: 저장 input·hash·동시 replay·실패 no-write 통합 검사.
- `tests/e2e/dashboard-current-state.spec.ts`: 성공·응답 유실 재시도·snapshot 실패의 실제 사용자 흐름 3개.
- `tests/e2e/helpers/e2eTest.ts`: 기존 HMR mock 예외에 dashboard 추가. mock이 dashboard hydration을 막아 버튼 이벤트가 붙지 않았으므로 실제 dev HMR 사용.
- `README.md`, `docs/planning-v2-user.md`, `docs/planning-v2-dev.md`: 명시 클릭 동작, 재사용 조건, 실패 및 기존 API 계약 문서화.
- 이 작업 기록. 새 경로는 없고 기존 `/dashboard`, `/planning`, `/planning/reports`, `/planning/runs`를 사용하므로 `docs/current-screens.md` 경로 목록 변경 없음.

## 사용 skill

- `planning-gate-selector`: dashboard/create-run 영향에 맞는 focused·전체·build·complete·E2E gate 선정.
- `route-ssot-check`: 기존 planning handoff와 report 경로 확인.
- `work-log-closeout`: 실행 결과와 보존 증거를 한국어 종료 기록으로 작성.

## 변경 이유

수정 전 재현에서 A profile/run 생성 후 A를 수정하면 stale이 됐습니다. 진입·새로고침·프로필 저장 후에도 run ID 목록은 그대로였고, 기존 CTA를 한 번 클릭하면 `/planning?profileId=A`로 이동할 뿐 새 run은 생성되지 않았습니다. 수정 전 E2E 1개가 통과한 상태를 기준으로 작업했습니다. 기존 동작의 나머지 수동 클릭 수는 측정하지 않았습니다.

목표는 현재 기본 프로필을 이전 완료 플랜과 같은 계산 조건으로 한 번의 명시 클릭 뒤 다시 계산하고 저장하는 것입니다. 현재 승인된 8개 변경을 포함한 작업 시작 시점 파일을 baseline으로 보관한 뒤 이번 변경만 비교했습니다.

## 핵심 변경

- stale의 `현재 프로필로 다시 계산` 버튼만 기존 `POST /api/planning/v2/runs`를 호출합니다. 실행 중 disabled/`다시 계산 중...`, 카드에 `기간·정책·가정은 이전 플랜 조건을 사용합니다.`를 표시합니다. 페이지 진입·새로고침·프로필 저장에는 run POST를 추가하지 않았습니다.
- `profileId`는 현재 기본 프로필, `input`은 stale 판단에 사용한 완료 run의 저장 객체 복사본입니다. `horizonMonths`, `policyId`, `snapshotId`, `assumptionsOverride`, `runScenarios`, `getActions`, `analyzeDebt`, `debtStrategy`, `includeProducts`, `monteCarlo`, `input.scenario`를 기존 저장/파서 의미대로 재사용합니다. 누락된 기본값을 임의로 채우거나 snapshot을 `latest`로 바꾸지 않습니다.
- 기존 `withDevCsrf`, workspace 요청 helper, create parser/preflight 및 idempotency 저장 계약을 사용합니다. 선택적 `rerunOfRunId`로 같은 사용자·프로필의 완료 source와 요청 설정을 확인하고, snapshot hash와 effective assumptions hash도 계산/저장 전에 비교합니다. 프로필별 별도 저장 override가 달라진 경우에도 조용히 다른 가정으로 실행하지 않습니다. 새 API·dedupe 저장소·저장 schema는 없습니다.
- 한 실행 의도의 key/body를 transport retry와 수동 재시도에 유지합니다. 성공 응답에서 새 runId/profileId를 확인한 뒤 `/planning/reports?runId=<newRunId>&profileId=<currentProfileId>`로 이동합니다. 기존 run/action progress는 그대로이고, dashboard로 돌아오면 current로 판정됩니다. scenario가 있는 run의 profileHash는 기존 생성 계약과 같이 현재 프로필에 저장 patch를 적용한 effective profile 기준입니다.
- snapshot 누락/조건 불일치는 새 run 저장 없이 stale·기존 현재 상태·최근 목록을 유지하며 오류, 재시도, `/planning?profileId=<현재ID>` 조건 검토를 제공합니다. current는 리포트 우선, unverified는 기존 handoff, missing/failed는 기존 진단 흐름입니다. legacy top-level scenario만 있는 run은 재실행 조건을 추정하지 않습니다.

## 검증

Ubuntu WSL의 Linux Git, Node v22.23.2, 캐시된 `/usr/bin/corepack pnpm@9.15.9`를 사용했습니다. 아래 `pnpm` 명령은 이 고정 실행기로 수행했습니다. 의존성을 설치하지 않고, source 복사본 `/tmp/finance-a-one-click-rerun-20260907/execution`에서 검증했습니다. bwrap 안에서 원본 `/home`과 원본 node_modules를 읽기 전용으로 두고 데이터·빌드·캐시는 작업용 scratch에 기록했습니다. E2E만 기존 namespace 기능을 활성화했습니다.

| 실행 | 실제 결과 |
| --- | --- |
| 수정 전 `pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts --workers=1 --retries=0` | 1 PASS, 47.16초. 클릭 전 run 불변, 기존 클릭은 navigation만 수행 |
| dashboard/create-run/idempotency/current-user focused 명령(아래) | 13 files, 144 tests PASS, 21.71초 |
| `pnpm typecheck` | PASS, 12.94초 |
| `pnpm lint` | PASS, 71.98초 |
| `pnpm run test --maxWorkers=2` | 873 files, 3,696 tests PASS, 236.74초 |
| `pnpm build` | PASS, 246/246 pages, 255.81초 |
| `pnpm planning:v2:complete` | PASS, fast E2E 8/8 포함, 90.45초 |
| `pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts --workers=1 --retries=0` | 최종 3 PASS, 98.38초 |
| `pnpm e2e:rc --runtime=production --grep 'dashboard\|planning workspace\|planning quickstart\|planning reports\|planning report detail\|planning runs\|history' --retries=0` | 17 PASS, 기존 조건부 skip 1개, 53.25초. 실제 grep 인수는 아래 설명처럼 역슬래시 없는 정규식 |

표의 RC grep은 Markdown 표 구분자 escape이며 실제 인수는 `dashboard|planning workspace|planning quickstart|planning reports|planning report detail|planning runs|history`입니다.

Focused 실행:

```sh
pnpm run test tests/dashboard-view-model.test.tsx tests/planning-v2-api/create-run-input-context.test.ts tests/planning-v2-api/create-run-service-modules.test.ts tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/create-run-idempotency.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning/ui/workspaceRunExecutionActions.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/currentUserAuthSession.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/auth/reportRunScopeLoaderPageAuth.test.ts tests/planning/store/planningStoreNamespace.test.ts tests/planning-v2-static-guard.test.ts --maxWorkers=2
```

- 성공 E2E: A와 run A → A 저장 변경 → stale → 더 최근 B run이 있어도 A source 유지 → 클릭 전 전체 run 목록 불변 → 클릭 후 정확히 +1 → 새 profileId=A, 저장 input 동일, 현재 canonical A profileHash 일치, 새 리포트 도착 → dashboard current. 이전 run 전체와 action progress를 deep equality로 비교했고 이전 리포트 열기 및 두 run 비교 선택을 확인했습니다. 6개 현재 지표와 최근 목록도 유지됐습니다.
- 실제 E2E 재사용 조건은 24개월, `balanced`, 지정 history snapshot, `inflationPct: 2.4`, scenario 실행/debt 분석 비활성, Monte Carlo paths 100/seed 77, debtStrategy extraPaymentKrw 10000/compareTermsMonths [12,24]입니다. `getActions: true`, `includeProducts: false` 등 저장 과정에서 생략되는 기본값까지 oldRun.input과 request/newRun.input 비교로 확인했습니다. 별도 통합 테스트는 36개월 및 scenario patch가 있는/없는 두 경우의 저장 계약을 검사했습니다.
- Idempotency E2E: 같은 순간 두 번 click 시 POST 1개와 disabled 확인. 서버가 저장한 응답을 두 차례 유실시킨 뒤 수동 재시도까지 총 3회 요청이 같은 key/body이고 새 저장은 1개였습니다. 통합 검사에서도 동시 요청은 같은 새 ID를 반환했습니다. 성공 후 snapshot이 사라져도 같은 key replay는 기존 성공 ID를 반환하고 새 key 요청은 실패했습니다.
- 실패 no-write: 실제 snapshot 삭제 후 두 번 재시도는 400/`SNAPSHOT_NOT_FOUND`, 같은 key, run 목록 불변, stale·오류·조건 검토 이동을 확인했습니다. snapshot 내용 변경, 입력 변경, 다른 profile source는 409 및 no-write입니다. 가정 override drift, 재현 hash 누락, source 미완료/다른 profile/누락은 pipeline/createRunRecord 호출 0을 검사했습니다.
- 최종 focused/type/lint/full/build/complete 실행 동안 source는 변경되지 않았습니다. 이후 수정은 E2E의 cold compile 이동 대기만 30초(긴 주 흐름 120초)로 조정한 것이며 최종 E2E 3개로 다시 확인했습니다. 제품 코드 변경 후 검증 누락은 없습니다. 저장/legacy schema를 바꾸지 않아 compat를 별도로 반복하지 않았습니다.
- 전체 첫 실행의 static guard 5초 timeout은 focused에서는 통과했고, worker 2개로 전체를 실행해 모두 통과했습니다. 첫 `pnpm test --maxWorkers=2`는 pnpm 축약 명령 옵션 오류로 테스트를 실행하지 못했으며 이후 `pnpm run test --maxWorkers=2`로 바로잡았습니다. 설정/테스트 assertion은 약화하지 않았습니다.
- E2E 초기 실패 중 실제 actionKey가 아닌 fixture 사용과 full navigation 후 POST response body 소실은 테스트를 실제 action-progress/최종 URL 및 저장 run 조회에 맞춰 수정했습니다. dev HMR mock 문제와 cold compile 대기 조정 후 최종 3개가 통과했습니다.

검증 로그·명령·source digest·exit code는 `/tmp/finance-a-one-click-rerun-20260907/`의 `before`, `focused-closeout-workers`, `typecheck-final`, `lint-final`, `full-test-final-workers`, `build`, `complete`, `dashboard-verified`, `rc-production` 각각 `.json`/`.log`에 있습니다. scratch 자료는 저장소 산출물이 아니므로 장기 보관은 보장하지 않습니다.

보존 확인:

- branch `stage1/accuracy-safety-clean-ci-20260902`, HEAD `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a` 유지. raw index SHA-256 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c` 유지.
- 작업 시작 파일 snapshot 대비 기존 파일 변경은 위 13개로 제한했습니다. package/lock/config 파일과 의존성 검사 대상의 hash/mtime이 유지됐습니다. 기존 8개 승인 변경을 reset하거나 baseline으로 덮어쓰지 않았습니다.
- 별도 worktree `finance-profile-corruption-preservation-c1cad28d`, `finance-dependency-audit-reliability-20260904`, `finance-dependency-audit-response-body-timeout-20260904`, `finance-pnpm-action-bootstrap-v6010-d8401041`의 branch/HEAD/index/status 및 검사 파일은 시작과 동일합니다. 확인 범위는 이 로컬 경로들이며 원격 PR 상태를 새로 확인한 것은 아닙니다.
- index 변경·Git 게시·dependency install/update·config/skill 변경을 수행하지 않았습니다. 이 기록 추가 후 `git --no-optional-locks diff --check`가 통과했고, 최종 보존 검사에서도 기존 파일 13개 변경과 이 기록 1개 추가만 확인했습니다. branch/HEAD/index/dependencies 및 위 별도 worktree 보존 결과는 모두 유지됐습니다.

## 남은 리스크

- 개발 runtime의 관련 RC는 16 PASS/1 skip/1 FAIL이었습니다. 기존 `flow-history-to-report.spec.ts:199`의 scenario blob GET에서 API JSON 대신 MMD HTML 404가 반환됐습니다. 이전 작업 기록에도 같은 실패가 있으며 해당 테스트/route는 이번 변경에서 수정하지 않았습니다. 개발 서버 404의 원인은 미해결입니다. 같은 선택 테스트의 production RC는 17 PASS/1 skip으로 통과했으므로 개발 RC 전체 PASS로 보고하지 않습니다.
- dashboard 전용 spec을 production으로 시도했을 때는 dev-only profile 생성 fixture에서 막혔습니다. 이 spec의 최종 실제 클릭 검증은 개발 runtime이고 production 증거는 위 관련 RC입니다. production 보호 조건을 변경하지 않았습니다.
- 이전 snapshot/가정과의 동일성은 검증했지만 오늘 기준 assumptions freshness는 미확인입니다. 자동 최신화하지 않습니다. scenario run은 원본 profile hash가 아니라 기존 계약상의 effective profile hash를 비교합니다.
- Model requested: 이번 요청에 새 지정 없음(앞선 관련 요청의 Astra/high 맥락). 권장: GPT-6 Astra/high. Model effective: 런타임에서 정확한 모델·effort를 확인할 수 없어 미확인; prose나 설정 변경으로 전환하지 않았습니다.
- 이번 라운드는 stale 명시 클릭 재실행 구현·검증·기록에서 종료합니다. 다음 라운드로 승인된 작업은 없으며 프로필 저장 후 무인 자동 실행으로 확장하지 않습니다.
