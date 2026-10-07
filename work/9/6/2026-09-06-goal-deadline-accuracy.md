# 2026-09-06 목표 기한 판정 정확성 수정

## 변경 파일

작업 루트: `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`.

- `src/lib/planning/core/v2/simulateMonthly.ts`: 최종 달성과 기한 달성 분리, 정확한 기한 부족액 보관.
- `src/lib/planning/core/v2/qa.ts`: 늦은 달성의 경고 근거 금액 소비, 최종 부족액 0원 오표현 방지.
- `src/lib/planning/core/v2/report.ts`: 기한 미달 요약과 기한 후 달성 표기.
- `src/lib/planning/v2/report/mapGoals.ts`: 기존 comment에 `기한 후 달성` 구분.
- `src/lib/planning/reports/reportViewModel.ts`: ID별 DTO comment를 guide 해석까지 전달하고 설명이 없거나 공백인 과거 DTO는 기존 `달성` 표시 유지.
- `src/lib/planning/reports/standaloneHtmlReport.ts`: 기존 목표 comment를 달성 상태에 표시하고 HTML escape 유지.
- `src/components/PlanningReportsDashboardClient.tsx`: 저장된 기한 후 달성 해석을 상태 표시에 전달.
- `tests/planning-v2/goalDeadline.test.ts`: 신규 public 엔진 회귀 12개.
- `tests/planning-v2/goalDeadlineConsumers.test.ts`: 신규 report/QA/action/DTO/guide/HTML 회귀 9개.
- `tests/e2e/flow-history-to-report.spec.ts`: 실제 API 생성·저장 후 브라우저와 HTML 내보내기 회귀 1개.
- `docs/planning-v2-user.md`: 최종 달성, 기한 달성, 두 시점의 부족액 설명.
- 이 종료 기록.

## 사용 skill

- `planning-calculation-integrity`: 이전 종료 기록이 지정한 B의 `/home/xpdlqj/code/.worktrees/finance-profile-corruption-preservation-c1cad28d/.codex/skills/planning-calculation-integrity/SKILL.md`를 읽고 명시적으로 적용. 달성 월/기한 월 분리, 입력 순열, 정확한 월별 state와 반올림 기준을 검증했다. 복사·등록·이관은 하지 않았다.
- `planning-gate-selector`: 엔진·보고서·저장 결과 소비·화면 영향의 focused, 전체 검사, build, compat/내부 complete, RC 선정.
- `work-log-closeout`: 이 한국어 종료 기록과 실제 실행/미확인 구분.

## 변경 이유

CORE. 시작 branch `stage1/accuracy-safety-clean-ci-20260902`, HEAD `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`를 확인했다. 사용자가 지정한 현재 미커밋 P0와 goal allocation 패치가 기준이다. 기존 보존 예외는 재심사하지 않았다.

public `src/lib/planning/v2/simulateMonthly.ts`가 core 구현을 재수출하는 경로를 따라, 수정 전 0% 금리·물가·수익률, 매월 가용 현금 100,000원, 부채 없는 합성 프로필로 재현했다. 모든 기한은 1-based이며 month 0은 초기 상태다.

| 사례 | 수정 전 실제 결과 | 최종 기대/확인 의미 |
| --- | --- | --- |
| 목표 200,000원, targetMonth=2, horizon=3 | achieved=true, achievedMonth=2, onTrack=true, 경고 없음 | 유지 |
| 목표 300,000원, targetMonth=2, horizon=3 | achieved=true, achievedMonth=3, onTrack=true, 경고 없음 | achieved/month 유지, onTrack=false, GOAL_MISSED |
| 목표 300,000원, targetMonth=2, horizon=2 | achieved=false, achievedMonth=null, onTrack=false, GOAL_MISSED, shortfall=100,000 | 유지 |
| 목표 400,000원, targetMonth=4, horizon=2 | achieved=false, onTrack=true, 경고 없음 | 기존 progress 판단 유지 |
| 초기 300,000원으로 이미 달성, targetMonth=2 | achieved=true, achievedMonth=0, onTrack=true, 경고 없음 | 유지 |

최초 테스트 작성 시 warning의 `code`를 조회해 미달성 사례까지 실패한 것은 테스트 필드 오류였다. 실제 계약인 `reasonCode`로 바로잡고 제품 수정 전 다시 실행한 `red-confirmed`에서 5개 중 늦은 달성 1개만 실패했다. 이후 확장한 `red-extended`는 10개 중 5개 실패로 기한 후 달성, 기한에서 95.24%에 그친 목표의 onTrack, 기한/최종 부족액 차이, 역순 복수 목표를 확인했다.

추가로 목표 300,000.1원, 기한 2개월을 horizon 3/4개월로 실행하면 목표월 부족액은 정확히 100,000.1원인데 최종 부족액은 0.1/0원이 된다. 기존 timeline의 goalProgress는 소수 둘째 자리까지 반올림한 비율이므로 그 비율에서 기한 금액을 역산하지 않았다.

## 핵심 변경

- `achieved`, 실제 `achievedMonth`, 최종 goalStatus의 `currentAmount`/`shortfall`은 유지한다. 기한 이상 관측한 목표의 onTrack은 `achievedMonth <= targetMonth`만 인정하며, 기한 전에는 기존 진행률 기준을 유지한다.
- 기한 월의 적립이 끝난 직후 ID별 정확한 goal state에서 부족액을 계산한다. GOAL_MISSED의 month/trace monthIndex는 기한을 가리키고 warning·trace·explainability의 shortfall은 이 기한 부족액을 공유한다. 새 warning code나 Result DTO schema는 없다.
- 기존 public normalizer가 0.5개월을 0개월로 절삭하는 경계에서 초기 Map 누락을 재현해 초기 state로 보완했다. normalizer 자체와 기존 month 0 의미는 바꾸지 않았다. 기존 lifecycle retirement의 목표월 자산 판정도 유지하고 그 부족액을 경고에 동기화한다.
- mapGoals/Markdown/QA 및 저장 결과 화면·HTML 내보내기가 기한 후 달성을 구분한다. DTO 최종 달성 수는 그대로다. 완료된 목표에 새 자금 충당 액션을 억지로 생성하지 않으며, 경고 집계는 기존 코드와 기한 월을 유지한다.
- P0 제품과 기존 배분 함수, ID별 DTO 배분 연결 수정, 기존 allocation 테스트/스냅샷을 보존한다. 과거 run 재계산·저장 덮어쓰기, legacy liabilities/monthlyPayment, solver/Monte Carlo, 배분 정책 변경은 없다.

QA는 경고의 양수 수치 근거를 우선 소비한다. 기한 부족액 근거가 없고 최종 부족액이 0이면 구체적 데이터가 제한적이라고 표시한다. public QA가 과거 plan도 받을 수 있으므로 기존 meta를 일괄 “기한 시점”이라고 재명명하지 않고 기존 “추정 미달액” 표현을 유지한다.

## 검증

Windows PowerShell에서 Ubuntu WSL의 Linux Node `v22.23.2`, `/usr/bin/git`, 기존 `/usr/bin/corepack pnpm@9.15.9`를 사용했다. 검증 runner와 로그는 `/tmp/finance-a-goal-deadline-20260906/`에 있다. 각 `<label>.json`에 실제 argv·exit·시간·검사 전후 소스 SHA/index SHA를 기록했다.

실행 프로세스에 `COREPACK_HOME=/home/xpdlqj/.cache/node/corepack`, `COREPACK_ENABLE_NETWORK=0`, `COREPACK_ENABLE_AUTO_PIN=0`, `COREPACK_DEFAULT_TO_LATEST=0`, `GIT_OPTIONAL_LOCKS=0`을 고정했다. 기존 node_modules, Git/config, P0 보호 파일은 read-only mount하고 캐시·합성 data·빌드/E2E 출력·생성 TypeScript 파일은 scratch로 격리했다. 설치·업데이트·autopin·index 재작성·Git 게시 명령을 실행하지 않았다. pnpm 직접/내부 재호출 버전 모두 9.15.9임을 확인했다.

아래 `P`는 `/usr/bin/corepack pnpm@9.15.9`이며 실제 실행은 `wsl.exe -d Ubuntu --exec /usr/bin/python3 /tmp/finance-a-goal-deadline-20260906/run.py <label> <P 이후 인자>` 형태다.

| 검사 | 결과 | label |
| --- | --- | --- |
| 수정 전 public 대표 5개 | 4 passed / 늦은 달성 1 failed | red-confirmed |
| 수정 전 확장 엔진 10개 | 5 passed / 5 failed | red-extended |
| report/QA/DTO 소비자 수정 전 | 5 passed / 3 failed | consumers-red |
| guide/HTML 전달 수정 전 | 8 passed / 1 test failed, soft assertion 2개 실패 | display-red-complete |
| 엔진·배분·report·QA·action·DTO·stage 관련 13파일 | 79 tests passed | focused-closeout |
| guide/HTML/export 관련 5파일 | 23 tests passed | display-focused |
| 최종 엔진·배분·guide/export 관련 7파일 | 57 tests passed. 과거 DTO의 설명 누락/공백도 포함 | focused-delivery |
| `P typecheck` | PASS | typecheck-delivery |
| `P lint` | PASS | lint-delivery |
| `P run test --maxWorkers=4` | 869 files / 3,593 tests passed | full-test-delivery |
| `P e2e:pw tests/e2e/flow-history-to-report.spec.ts --grep 'preserve late goal achievement' --workers=1` | 1 passed. 실제 합성 프로필/실행 저장, 브라우저 표시 및 export.html 확인 | deadline-e2e |
| `P build` | PASS | build |
| `P planning:v2:compat` | PASS. 내부 planning:v2:complete PASS, fast E2E 8/8 통과 | compat |
| `P e2e:rc` | 48 passed / 2 existing conditional skips / 0 failed. 신규 저장·표시·HTML 기한 회귀 포함 | rc |

관련 13파일의 실제 명령:

```sh
P run test tests/planning-v2/goalDeadline.test.ts tests/planning-v2/goalDeadlineConsumers.test.ts tests/planning-v2/simulateMonthly.test.ts tests/planning-v2/simulateMonthly.edge.test.ts tests/planning-v2/goalAllocation.test.ts tests/planning-v2/simulateMonthly.snapshot.test.ts tests/planning-v2/qa.test.ts tests/planning-v2/actions.test.ts tests/planning-v2/report.test.ts tests/planning-v2/summarizeWarnings.test.ts tests/planning-v2/reportWarningAggregation.dashboard.test.ts tests/planning/v2/resultDto.test.ts tests/planning-v2-api/create-run-service-modules.test.ts --maxWorkers=4
```

Snapshot: 이번 작업의 snapshot 변경은 없다. 기존 30개 프로필 snapshot·순열 테스트와 QA snapshot을 갱신 명령 없이 통과했다. 기존 배분 패치가 수동 검토하여 바꾼 achievedMonth 15개는 현재 기준 그대로 유지한다.

최종 보존 확인:

- 시작 기준 4,305개 파일의 내용 SHA를 대조했다. 허용한 기존 9파일 외 baseline 변경·삭제는 없으며, 새 파일은 신규 단위 테스트 2개와 이 기록뿐이다. P0 파일/기존 기록, package/lock/config, 기존 resultDto 및 allocation 회귀·snapshot은 시작값과 같다.
- `allocateGoalContributions` 함수 본문을 시작 Working Tree와 별도로 비교해 동일함을 확인했다. 기존 배분 문서에 이번 기한 설명만 추가했다.
- index SHA-256은 시작/종료 모두 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`다. branch/HEAD도 유지한다. 최종 coherent 증분을 검토하고 `git diff --check`가 통과했다.
- `final-manifest.json`에서 typecheck/lint/전체 test/build/compat/RC 모두 exit 0, 검사 전후 소스 동일, 최종 제품과 SHA 일치를 assertion으로 확인했다.
- 이번 제품 11파일 증분은 scratch의 `deadline-increment.diff`, SHA-256 `97dec7a10812847eadd36304a4b309628bc894ee129cbc14791ccc3fb8990723`다. 전체 기준과 상세 결과는 `start.json`, `final-review.json`, `final-manifest.json`에 보관한다.

최종 자동 검증은 모두 통과했다. build는 246/246 정적 페이지 생성을 완료했고, compat 안에서 complete를 실제 실행했으므로 별도 complete 재실행은 하지 않았다. 기존 저장 결과 소비와 신규 생성 결과의 구분을 검증하기 위해 compat를 포함했으며 legacy 계산 호환성 수정으로 범위를 넓히지는 않았다.

## 남은 리스크

- RC의 조건부 skip은 `error-state-retry.spec.ts:105`의 인증 전용 설정 검사와 `smoke.spec.ts:444`의 production runtime 검사다. 이번 development RC에서 두 분기를 실행한 것으로 보고하지 않는다.
- 실사용 금융 데이터, live upstream, 수동 5분 self-test, 배포 환경 검증은 수행하지 않았다. 합성 저장·브라우저 E2E와 구분한다.
- 기존 0<targetMonth<1 정규화는 유지하며, month 0의 trace monthIndex=-1 정책 자체는 이번에 수정하지 않았다.
- 과거 저장 결과의 기한 판정·경고 부족액을 소급 보정하지 않는다. 신규 실행의 정확한 계산과 과거 데이터의 보장 범위를 구분한다.
- `/tmp` 증거는 임시 보관이므로 최종 이 기록과 실제 제품 diff를 함께 기준으로 삼는다.
