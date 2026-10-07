# 2026-09-07 안정 리포트 시나리오 비교와 다음 행동 연결

## 변경 파일

작업 루트: `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`. 분류: CORE.

- `src/components/PlanningReportsDashboardClient.tsx`: 기존 ReportVM scenarioRows 표시, 읽기 순서와 비교 역할 설명.
- `tests/planning/reports/stableReportScenarios.test.tsx`: 실제 계산/artifact 렌더, 지표·해석·순서·disabled/failed·action·compare 회귀.
- `tests/e2e/flow-history-to-report.spec.ts`: 실제 API 저장 후 시나리오/행동/내보내기 및 기존 비교 검증.
- 이 기록.

## 사용 skill

- `finance-skill-routing`: 최소 구현/검증 skill 선정.
- `planning-gate-selector`: report UI/VM 영향에 맞춘 focused, typecheck, lint, full test, complete, build, 관련 RC 선택.
- `work-log-closeout`: 실제 검증·미실행·보존 근거를 분리해 기록.
- `playwright`: 브라우저 결과와 스크린샷 검증 절차 참고. 사용자 지정 기존 pnpm/test 경로를 우선하여 npx/설치/CLI wrapper는 사용하지 않음.

manager는 읽기 전용으로 4단계 범위 분해, stage/DTO 계약 및 최종 증분 검토를 수행했다. 구현과 최종 검증은 메인이 소유했다.

## 변경 이유

시작 branch: `stage1/accuracy-safety-clean-ci-20260902`, HEAD: `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`. 이전 Profile corruption P0, goal allocation, goal deadline, legacy debt, dashboard current-state 변경을 현재 기준선으로 수용했다.

수정 전 `runScenarios` → `buildPlanningRunArtifacts` → `safeBuildReportVMFromRun`을 실제 실행한 fixture에서 base/conservative/aggressive 3행이 생성됐다. 같은 run을 안정 `PlanningReportsDashboardClient`로 렌더링하면 시나리오 제목·해석·section은 없고, 목표 뒤에 실제 생성된 action이 표시됐다. 시나리오 없는 artifact도 기존 action을 표시했다. `scenario-before`의 2 tests PASS는 이 누락을 관측하는 assertion이며 사용자 요구가 이미 충족됐다는 뜻이 아니다. 단순 source 문자열 검색으로 재현을 대신하지 않았다.

추가 확인: artifact 단계에서는 ID별 `shortWhyByScenario`가 존재하지만, 실제 기본 저장 경로의 `compactRunOutputs`는 `resultDto.raw={}`로 축약하고 시나리오와 actions를 blob ref로 남긴다. API로 읽은 실제 저장 run에는 canonical `scenarios.table`과 평탄한 `shortWhy`가 있고 ID별 해석 매핑은 없다. 기존 `toScenarioRows`는 이 경우 공통 fallback을 사용한다. 따라서 최종 구현은 요청의 “현재 ReportVM 값 그대로”를 지켜 해당 interpretation을 그대로 표시한다. 중간에 시도한 ReportVM 보완은 제거했고 시작 bytes와 동일하다. 저장 schema 확대·새 fetch·평탄한 설명의 임의 ID 대응은 하지 않았다.

## 핵심 변경

- 안정 화면에서 `selectedRunVmData?.scenarioRows ?? []`를 그대로 소비한다. 새 API 요청·계산·과거 run 재계산은 없다.
- 시나리오명, 말기 순자산, 기준 대비 변화, 최저 현금, 목표 달성 수, 경고 수, 기존 해석을 기존 Card/표/금액 포맷으로 표시한다. base delta=0과 기존 금액·행 ID 의미를 유지한다.
- 읽기 순서는 핵심 상태/결과 → 경고·목표 → 현재 실행의 시나리오 → 다음 행동 → 저장 실행 간 비교 → 선택적 추천/상품/혜택 자료다. 기존 비교·보조 자료 블록을 이동했으며 새 dashboard 구조나 추천 로직은 만들지 않았다.
- “한 실행 안의 가정 변화”와 “서로 다른 저장 실행 A와 B”를 구분한다. Top Actions는 기준 실행에서 확인할 행동으로 안내하고 생성·순위·단계 내용은 바꾸지 않았다.
- scenarios disabled는 SKIPPED/OPTION_DISABLED, 실패는 FAILED/STAGE_ERROR 및 PARTIAL_SUCCESS 계약을 유지한다. output이 없으면 section만 생략하고 다른 결과와 actions는 표시한다. 단계 누락 과거 run도 지원한다.
- ReportVM/계산/DTO/저장/action 생성은 시작 상태 그대로다. 개별 shortWhy 재사용으로 주장하지 않고, 기존 VM interpretation을 표시한 것으로 구분한다.

## 검증

Ubuntu WSL, `/usr/bin/git`, Linux Node `v22.23.2`, 기존 `/usr/bin/corepack pnpm@9.15.9` 사용. 직접/내부 pnpm은 9.15.9다.

```text
COREPACK_HOME=/home/xpdlqj/.cache/node/corepack
COREPACK_ENABLE_NETWORK=0
COREPACK_ENABLE_AUTO_PIN=0
COREPACK_DEFAULT_TO_LATEST=0
GIT_OPTIONAL_LOCKS=0
```

기존 검증 runner의 node_modules/Git/config read-only 보호를 재사용했다. data/cache/build/typecheck/브라우저 결과는 이번 scratch에 격리했다. 설치·update·use·up·prepare·dlx·npx·postinstall 유발 작업은 실행하지 않았다.

증거: `/tmp/finance-a-scenarios-20260907/`의 `start.json`, `baseline/`, `baseline.diff`, `baseline.status`, 각 gate의 `.log`/`.json`, `scenario-increment.diff`, `final-review.json`. start에는 A의 4,313개 파일 SHA와 B/C/D/PR300 현재 파일·branch·HEAD·status·index, package/lock/workspace/config와 dependency metadata를 기록했다. 비밀 env 파일은 빈 파일로 가려 읽지 않았다.

아래 P는 `/usr/bin/corepack pnpm@9.15.9`이며 실제 호출은 `wsl.exe -d Ubuntu --exec /usr/bin/python3 /tmp/finance-a-scenarios-20260907/run.py <label> <P 뒤 인자>`다.

| 검사 | 실제 결과 |
| --- | --- |
| 수정 전 실제 artifact 렌더 | 2 tests PASS: 누락/기존 action 흐름 재현 |
| focused-final | 6 files / 28 tests PASS |
| `P typecheck` | 최종 PASS. 초기 테스트의 blob ref/unknown 응답 타입 오류 수정 후 재실행 |
| `P lint` | PASS |
| `P run test --maxWorkers=4` | 872 files / 3,658 tests PASS |
| `P planning:v2:complete` | 최종 PASS, 내부 fast E2E 8/8 |
| `P build` | PASS, 246/246 페이지 생성 |
| 관련 `P e2e:rc --grep 'planning reports\|planning report detail\|planning runs selected\|planning runs and reports'` | 최종 11 PASS / 1 SKIP |

focused 파일은 `stableReportScenarios.test.tsx`, `reportViewModel.test.ts`, `reportViewModel.safeBuild.test.ts`, `create-run-service-modules.test.ts`, `planning-reports-page-fallback.test.tsx`, `reportDashboardOverrides.test.tsx`다. 새 렌더 테스트는 실제 actions 생성 결과를 시나리오 유무별로 비교하고 입력 run이 변경되지 않음도 확인한다. 실제 `compactRunOutputs`를 통과한 저장 형태에서도 3행과 기존 interpretation/action이 유지되는지 확인한다.

E2E 초기 실패는 새 테스트의 GET 요청에서 same-origin 헤더가 빠진 403과, 실제 저장 outputs가 table/actions 전체 대신 ref만 가진다는 응답 형태 오해였다. 기존 helper와 같은 origin/referer를 추가하고 실제 GET 응답을 기존 ReportVM으로 해석하도록 수정했다. 이후 새 scenario/action/export/no-scenario 테스트 1 PASS, 관련 RC 전체 선택 11 PASS다. 이미 통과한 다른 RC도 최종 소스에서 확인했다. 1 SKIP은 기존 `error-state-retry`의 namespace 조건에 따른 인증 테스트이며 통과로 집계하지 않는다.

브라우저 렌더는 E2E에서 생성한 `scenario-comparison.png`를 `view_image`로 열어 확인했다. 3행의 이름, 기준 0원·음수·양수 delta, 지표 열과 공통 해석이 표시됐다. 이 이미지 파일은 후속 complete의 공용 test-results 정리로 별도 보존되지 않았으며 현재 파일 링크로 제시하지 않는다. E2E 로그와 gate 기록은 보존했다. E2E에서 scenario section이 actions보다 DOM상 앞임을 확인하고 기존 run 비교·저장 상세·추천 연결·HTML export 회귀도 검증했다.

처음 complete는 내부 fast E2E 8개를 포함해 통과했다. 이후 실제 compact 저장 계약을 발견해 ReportVM 변경을 걷어낸 소스가 최종 범위이므로, focused/typecheck/lint/full test/complete를 갱신했다. 이전 통과 기록은 `*-pre-contract.json/log`로 보존하며 최종 소스의 통과로 대체 보고하지 않는다. 최종 complete 내부 fast E2E도 실제 8/8 PASS다. 같은 소스에서 내부 fast E2E만 별도로 반복하지 않았다.

필수 report/UI gate에 complete를 포함한다. 계산/저장 schema/legacy 계약 변경이 없어 별도 compat는 추가하지 않았다. 새 경로·href·route catalog 변경은 없어 SSOT 문서 편집이나 route guard 증설은 없다. 전체 RC와 별도 수동 5분 self-test는 이번 필수 범위에 포함하지 않는다.

모델: requested/recommended `gpt-6-astra/high`. 메인 effective model/effort는 확인 가능한 실행 결과에 노출되지 않아 `[미확인]`이며 config 또는 요청값을 실행값으로 간주하지 않는다. 전역 설정 변경 없음.

최종 검증 시간: focused 2.32초, typecheck 56.42초, lint 103.27초, full test 119.62초, complete 210.40초, build 218.35초, 관련 RC 61.40초. 모든 최종 gate가 exit 0이며 실행 전후 소스 SHA와 최종 소스가 일치한다. 초기 E2E 실패/초기 타입 오류/축소 전 PASS와 최종 PASS를 구분했다. `git diff --check`도 PASS다.

최종 보존 대조: A 시작 4,313개 파일 중 이번 UI와 E2E 파일 외 변경·삭제 없음. 새 파일은 focused 테스트와 이 기록뿐이다. ReportVM을 포함한 기존 P0/allocation/deadline/legacy debt/dashboard 변경과 이전 work 기록은 시작 bytes 그대로다. B 4,310개/C 4,279개/D 4,438개/PR300 4,301개 파일 및 각각 branch/HEAD/status/index가 시작과 같다. 최종 porcelain은 scratch의 `final.status`에 기록했다.

raw index SHA-256은 시작·종료 모두 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`다. package/lock/workspace/config/next-env는 시작 SHA와 같고, dependency metadata와 vitest/next/tsc 실행 파일의 SHA·mtime도 같다. 새 preservation exception은 없다.

```text
STABLE_SCENARIO_VISIBILITY=true
SCENARIO_BEFORE_ACTION_FLOW=true
SCENARIO_INTERPRETATION_REUSED=true (기존 ReportVM interpretation 그대로; ID별 shortWhy 복원 아님)
RUN_COMPARE_PRESERVED=true
ACTION_GENERATION_UNCHANGED=true
A_REQUIRED_GATES=PASS (관련 RC 11 PASS / 기존 조건부 1 SKIP)
CURRENT_BASELINE_PRESERVED=true
CURRENT_INDEX_PRESERVED=true
DEPENDENCIES_MODIFIED=false
NEW_PRESERVATION_EXCEPTION=false
MODEL_REQUESTED=gpt-6-astra/high
MODEL_EFFECTIVE=미확인
COMMITTED=false
PUSHED=false
PR_CHANGED=false
MERGED=false
RELEASED=false
```

## 남은 리스크

- 이번 범위의 필수 자동검증은 완료했다. 전체 RC, 별도 수동 5분 self-test, 실제 사용자 데이터/배포 환경 검증은 실행하지 않았다.
- 기존 저장 계약상 실제 compact run의 ID별 shortWhy 매핑은 없다. `SCENARIO_INTERPRETATION_REUSED`는 기존 VM interpretation 재사용만 뜻하며, 시나리오별 원본 shortWhy 재사용을 뜻하지 않는다. 이번의 no new fetch/schema 및 현재 VM 값 그대로 소비 경계 때문에 별도 계약 변경으로 확장하지 않는다.
- 합성 프로필, 실제 계산/artifact/API 저장과 브라우저를 검증 대상으로 했다.
- scenario stage 실패의 실제 외부 장애 강제 E2E는 수행하지 않는다. 해당 경계는 실제 artifact를 사용한 FAILED/PARTIAL_SUCCESS 렌더 fixture와 기존 stage 계약으로 확인한다.
- 이번 목표에서 종료하며 사용자 편집형 scenario planner, solver, 상품추천 확장으로 자동 진행하지 않는다.
