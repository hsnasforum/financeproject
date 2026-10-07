# 2026-09-06 목표 자금 배분 순서 의존성 수정

## 변경 파일

작업 루트는 `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`입니다. 아래 파일 경로는 이 루트 기준입니다.

- `src/lib/planning/core/v2/simulateMonthly.ts`: 최소/가중 배분의 기준 예산 고정.
- `src/lib/planning/v2/resultDto.ts`: 목표 ID와 정규화된 금액을 연결한 뒤 기존 표시 순서 적용.
- `tests/planning-v2/goalAllocation.test.ts`: 신규 public 엔진 배분 회귀 테스트 22개.
- `tests/planning-v2-api/create-run-service-modules.test.ts`: 실제 stage/assembler/DTO 숫자 전달 3사례.
- `tests/planning/v2/resultDto.test.ts`: 정렬 전후 ID·금액·종류 연결 회귀.
- `tests/planning-v2/simulateMonthly.snapshot.test.ts`: 기존 30개 프로필의 목표 순열 비교.
- `tests/planning-v2/__snapshots__/simulateMonthly.snapshot.test.ts.snap`: 근거를 확인한 달성 월 15개만 변경.
- `docs/planning-v2-user.md`: 배분 기준과 cap 잔액, 새 실행 적용 범위 설명.
- `work/9/6/2026-09-06-goal-allocation-order-independence.md`: 이번 종료 기록.

시작 branch는 `stage1/accuracy-safety-clean-ci-20260902`, HEAD는 `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`입니다. 시작 시 staged 변경은 없었고, 검수된 P0 제품 11파일(수정 9, 신규 테스트 2)과 기존 P0 기록이 미커밋 상태였습니다. 이를 이번 개발 기준으로 유지했습니다. `PRESERVATION_EXCEPTION_ACCEPTED=true`는 사용자가 수용한 이전 A 예외에만 한정하며 새 설치/index 변경의 승인으로 확장하지 않았습니다. 기존 사건 기록은 수정하지 않았습니다.

## 사용 skill

- `planning-gate-selector`: 실제 엔진 소비자와 core 변경의 필수 검증 범위 선정.
- `work-log-closeout`: 이 한국어 종료 기록의 형식과 실제 검증/제한 구분.
- `planning-calculation-integrity`: 사용자가 지정한 B의 `/home/xpdlqj/code/.worktrees/finance-profile-corruption-preservation-c1cad28d/.codex/skills/planning-calculation-integrity/SKILL.md`를 읽어 수치·현금 보존·결과 전달 검수에 적용. A로 복사하거나 등록하지 않았습니다.

## 변경 이유

public `simulateMonthly()`에 1개월, 0% 금리·물가·수익률, balanced, 부채·투자·연금 없는 합성 입력을 전달해 수정 전 3개 실패를 재현했습니다. 최소 적립 단계가 줄어드는 `budget`으로 충분성을 재판정하고 비율을 계산했으며, 가중 배분도 항목마다 줄어드는 예산을 분자로 사용했습니다.

| 가용 예산 / 최소 적립액 a,b | 수정 전 엔진 적립액 a,b | 수정 후 적립액 a,b | 수정 후 현금 |
| --- | --- | --- | --- |
| 100,000 / 0,0원 | 50,000 / 25,000원 | 50,000 / 50,000원 | 0원 |
| 200,000 / 100,000,100,000원 | 125,000 / 62,500원 | 100,000 / 100,000원 | 0원 |
| 100,000 / 120,000,80,000원 | 72,000 / 22,000원 | 60,000 / 40,000원 | 0원 |

수정 전 잔액 25,000/12,500/6,000원은 실패 로그의 적립액을 예산에서 차감한 산술값입니다. 수정 전 red 테스트는 적립액 assertion에서 중단됐으므로 이를 별도 현금 assertion 통과로 보고하지 않습니다. 수정 후에는 양쪽 입력 순서의 ID별 금액·현금·자산·순자산을 모두 assertion으로 확인했습니다.

실제 stage/assembler 테스트에서 추가로 DTO의 기존 ID 연결 오류를 발견했습니다. `mapGoals(rawGoalRows)`가 기한/이름순으로 정렬한 뒤 정렬 전 `rawGoalRows[index]`의 ID를 붙여, 역순 입력의 60,000/40,000원이 서로 다른 ID에 연결됐습니다. 각 원본 행의 ID와 금액을 먼저 묶은 뒤 기존 DTO 표시 순서로 정렬하도록 함께 수정했습니다. 엔진과 저장용 simulation 배열의 입력 순서는 유지합니다.

## 핵심 변경

- 최소 단계의 시작 예산과 충분성 판단을 고정하고 부족하면 같은 기준 예산에서 비례 배분합니다.
- 최소 단계 이후의 잔액을 가중 단계 기준으로 고정합니다. 실제 잔여 예산과 목표 cap으로 최종 지급액을 제한합니다.
- 가중치 `priority / max(1, targetMonth - month + 1)`와 cap 잔액의 현금 유지, 정책 예산·부채·적립 우선순위, 기존 반올림/스키마/preset을 유지합니다.
- public 엔진의 ID별 순열·월별 보존·결정성·입력 비변경과 실제 stage/assembler/DTO 숫자 전달을 검사합니다.
- 과거 run 재계산이나 저장 덮어쓰기를 추가하지 않았습니다. snapshot은 달성 월 15개만 수동 수정하고 다른 필드는 그대로인지 비교했습니다.

## 검증

실행은 Windows PowerShell 7.6.5에서 Ubuntu WSL의 Linux Node `v22.23.2`, `/usr/bin/corepack pnpm@9.15.9`로 수행했습니다. 현재 turn metadata(`2026-09-06T11:35:39.022Z`)의 model/effort는 `gpt-6-astra/high`이며 요청값과 일치합니다. 설정 파일을 변경하지 않았습니다.

검증 기록 루트 `S=/tmp/finance-a-goal-allocation-gfiyoo0y`에 시작 지문(`start.json`), 제품 증분, 각 실행의 명령/exit/소스 전후 SHA/index SHA/격리 인자 JSON과 전체 로그가 있습니다. 아래 `P`는 실제 실행 파일과 인자 `/usr/bin/corepack pnpm@9.15.9`를 뜻합니다. 모든 제품 검사는 `wsl.exe -d Ubuntu --exec /usr/bin/python3 /tmp/finance-a-goal-allocation-gfiyoo0y/run.py <label> <P 이후 인자>`를 통해 기존 package script를 실행했습니다.

한 프로세스 및 하위 프로세스에만 다음 환경을 고정했습니다.

```text
COREPACK_HOME=/home/xpdlqj/.cache/node/corepack
COREPACK_ENABLE_NETWORK=0
COREPACK_ENABLE_AUTO_PIN=0
COREPACK_DEFAULT_TO_LATEST=0
GIT_OPTIONAL_LOCKS=0
```

기존 의존성을 readonly mount하고 `.vite`/`.cache`만 별도 scratch로 overlay했습니다. `.git`, `.codex`, P0/보호 파일도 readonly로 두었습니다. `.data`, build/E2E 출력, 생성되는 TypeScript 파일은 합성 scratch에 격리했습니다. 실제 환경값은 출력하지 않았습니다. Corepack 캐시의 정확한 9.15.9와 내부 재호출 버전을 확인했고 install/use/up/prepare/dlx/npx/postinstall/Prisma 생성은 실행하지 않았습니다.

직접 관련 묶음 명령은 다음과 같습니다. 아래 파일들은 모두 존재하며 실제 선택돼 실행됐습니다.

```sh
/usr/bin/corepack pnpm@9.15.9 run test tests/planning-v2/goalAllocation.test.ts tests/planning-v2/simulateMonthly.edge.test.ts tests/planning-v2/simulateMonthly.test.ts tests/planning-v2/policy.test.ts tests/planning-v2-api/create-run-service-modules.test.ts tests/planning-v2-api/scenarios-route.test.ts tests/planning-v2/optimizer.greedy.test.ts tests/planning-v2/actions.test.ts tests/planning-v2/scenarios.test.ts tests/planning-v2/monteCarlo.test.ts tests/planning/v2/resultDto.test.ts --maxWorkers=4
```

| 실행 기록(label) | 실제 명령 또는 위 묶음 | exit | 결과 |
| --- | --- | --- | --- |
| environment | `/bin/sh -c 'node --version; command -v corepack; command -v pnpm; corepack pnpm@9.15.9 --version && corepack pnpm --version'` | 0 | Node v22.23.2, 지정/내부 pnpm 모두 9.15.9 |
| red | `P run test tests/planning-v2/goalAllocation.test.ts --maxWorkers=4` | 1 | 수정 전 대표 3사례 실패 |
| focused | 위 직접 관련 묶음 | 1 | 55 통과, 4 실패: 새 fixture 3개와 실제 DTO ID 오류 1개 |
| focused-final | 위 직접 관련 묶음 | 1 | 57 통과, 3 실패: DTO 수정 후 새 fixture 문제 잔존 |
| focused-pass | 위 직접 관련 묶음 | 0 | fixture에 명시적 소득 phase 추가 후 11파일 60테스트 통과 |
| typecheck / lint | `P typecheck` / `P lint` | 각각 0 | 초기 관련 수정 상태 통과 |
| full-test | `P run test --maxWorkers=4` | 1 | 3,569 통과, 2 실패: 기존 snapshot 및 격리 환경의 example 파일 마스킹 |
| affected-recheck | `P run test tests/planning-v2/simulateMonthly.snapshot.test.ts tests/planning/auth/authConfigContract.test.ts --maxWorkers=4` | 0 | 아래 원인 조치 후 2파일 12테스트 통과 |
| typecheck-final | `P typecheck` | 0 | 최종 제품 8파일 상태, 5.85초 |
| lint-final | `P lint` | 0 | 최종 제품 상태, 70.07초 |
| full-test-final | `P run test --maxWorkers=4` | 0 | 867파일 3,572테스트 통과, 103.57초 |
| build | `P build` | 0 | 정적 페이지 246/246, 216.39초 |
| compat | `P planning:v2:compat` | 1 | migration/guard/security/smoke 이후 fast E2E 3 통과·5 실패 |
| e2e-environment-check | `P e2e:pw test tests/e2e/planning-v2-fast.spec.ts --grep 'shows form by default' --workers=1` | 0 | 기존 브라우저 mount 방식 복원 후 1테스트 통과, 163.88초 |
| compat-final | `P planning:v2:compat` | 0 | 내부 Planning complete 및 fast E2E 8개 통과, 247.37초 |
| rc | `P e2e:rc` | 0 | 기존 1 worker 정책, 49개 중 47 통과·2 skip, 483.86초 |

실패 조치와 검증 해석:

- 새 cashflow fixture에 contributions만 있으면 기존 정규화 계약에서 소득이 0이 됐습니다. 명시적인 1개월 소득 phase를 테스트에 추가했고 제품의 cashflow 처리는 변경하지 않았습니다.
- 전체 테스트의 snapshot 차이는 배분 수정에 따른 달성 월 변경이었습니다. 30개 기존 프로필을 모든 목표 순열로 실행해 ID별 금액/달성 월과 월별 적립·현금·자산을 비교했습니다. 변경한 값은 `emergency-1 4→5`, `emergency-3 20→21`, `travel-3 21→20`, `travel-5 5→6`, `emergency-7 6→7`, `travel-7 7→6`, `emergency-9 8→9`, `travel-9 9→8`, `emergency-10 4→5`, `emergency-11 3→4`, `travel-13 4→3`, `education-15 10→9`, `travel-19 5→4`, `emergency-27 5→6`, `travel-29 3→2`입니다. 실제 snapshot ID는 각각 `goal-` 접두사를 포함합니다. 일괄 snapshot 갱신 명령은 쓰지 않았습니다.
- `authConfigContract` 실패는 scratch runner가 비밀값이 없는 `.env.example`까지 빈 파일로 가려 발생했습니다. runner에서 이 source-contract 입력만 마스킹 대상에서 제외해 통과했습니다. 호스트 example/config 내용은 그대로입니다.
- 첫 compat의 fast E2E에서는 페이지가 loading 상태에 머물렀습니다. trace에는 실제 form이 있었고 pageerror/network 실패는 발견하지 못했습니다. 단위/빌드에 사용한 축소 시스템 mount를 브라우저에도 적용한 환경 차이를 좁힌 뒤, 이전 A에서 성공한 full-root readonly mount와 scratch 쓰기 overlay를 재사용했습니다. 동일 제품 소스에서 단일 화면 및 compat 전체가 통과했습니다. 정확한 브라우저 내부 지연 원인은 미확인입니다. assertion/guard/timeout/worker 설정은 변경하지 않았습니다.
- 성공한 compat가 실제 내부 `planning:v2:complete`를 실행하는 것을 확인했습니다. 첫 실패 이후 필요한 compat 재실행 외에 complete를 따로 중복 실행하지 않았습니다.
- RC의 기존 조건부 skip은 `error-state-retry.spec.ts:105`의 unauthenticated 전용 환경 테스트와 `smoke.spec.ts:444`의 production 비노출 테스트입니다. 이번 dev RC에서 해당 조건이 성립하지 않았으며 skip을 제거하거나 통과로 바꾸지 않았습니다.

배분 테스트는 2목표 교환, 서로 다른 priority/기한/최소액의 3목표 6순열, 최소 합계 대비 부족/동일/초과 예산, 단일/없음/전부 달성/0원, cap 잔액, 세 정책과 부채·투자·연금·비상금, 월별 현금/goalFundAssets/netWorth 보존, 결정성/입력 비변경을 확인합니다. 허용 오차는 기존 public 금액의 소수점 2자리 단위인 0.01원입니다. cap 예에서는 10,000/50,000원 지급 후 40,000원을 현금으로 남기는 기존 가중 배분 동작을 양쪽 순서에서 확인했습니다.

소비자는 실제 `runScenarios`와 optimizer가 같은 엔진을 호출하는 경로를 확인했습니다. actions는 주어진 plan의 goalStatus를 소비하며, Monte Carlo는 별도 확률 엔진이므로 관련 테스트의 통과를 이번 배분 함수 직접 호출 증거로 사용하지 않습니다. 실제 `buildPlanningStagePlan → runStagePipeline → resolvePlanningStageOutputs → assemblePlanningRunRecordInput`는 mock simulation 없이 대표 3사례의 목표 금액, timeline, 저장용 payload, DTO ID별 금액을 확인했습니다. 이 세 수치 사례는 **payload 조립 검증이며 실제 저장/재조회 검증은 아닙니다**. 기존 compat/RC의 합성 run 저장 흐름 검증과 구분합니다.

제품 증분은 `/tmp/finance-a-goal-allocation-gfiyoo0y/goal-allocation-increment.diff`이며 신규 테스트를 포함한 8파일, SHA-256 `717b5e8fc6b2c37a04c085debf9459b6132f57c5f1db318cba86c01ddc5e3498`입니다. 기존 P0 diff SHA-256 `02d417d2a9bab12825aff786405e288f017c78c0f9ffbd69c488481197c4f959`와 별개입니다. 새 기록까지 포함한 9파일 인계 diff와 최종 지문은 같은 scratch의 `goal-allocation-handoff.diff`, `final-manifest.json`에 보관합니다.

최종 제품 파일 SHA-256은 다음과 같으며 각 최종 게이트 JSON의 `source_before/source_after`와 대조합니다.

| 파일 | SHA-256 |
| --- | --- |
| simulateMonthly.ts | `ed56a5c80604b868551cf418e7362c3fc77696dde295d310ac3f7dd3c07c6ad2` |
| resultDto.ts | `331be0ec34cb3c496f8c94060ea8a6cbde93d6adc69587d4c85bd9cf6ce0dd6b` |
| resultDto.test.ts | `51e026e90fb9dbff460a1a69a164f2d968c81fe39a5c6d48dfb9260640b6c1e6` |
| create-run-service-modules.test.ts | `2f2818a90107fd6a6cf7ee7523daf94f084b16a8bc2755d8680af5fa84b69ba5` |
| planning-v2-user.md | `cf8374beb708d1b0ac8a0c201bda768bc3a6cbd603169e49a3c29828364aa4bb` |
| simulateMonthly.snapshot.test.ts | `860821e724481b6001a00cb9fafa2886cb37c77f8b6bd36fb6350a0ae9e009ee` |
| simulateMonthly.snapshot.test.ts.snap | `8c81199a10983d72d66f562c29dda7e81a8346414adabb1fde3e66c31c207aeb` |
| goalAllocation.test.ts | `d4b29f23efc95f9762cf5bfaca90e9cfee52ed2fcd9681ddd319584b7702a549` |

index의 이번 시작/종료 바이트 SHA-256은 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`, stage entries SHA-256은 `b6e341b80bec0c5e5156f8efc92802cca44c7f783a0925c4ef30161e24c5c52b`입니다. P0 11파일·기존 종료 기록·package/lock/workspace/config/TypeScript 보호 파일은 시작 SHA와 대조합니다. B/C/D/PR300은 HEAD·branch·전체 porcelain 상태·index 바이트·tracked diff SHA를 시작값과 대조합니다. Git 조회에는 `GIT_OPTIONAL_LOCKS=0`, `--no-optional-locks`, diff의 `--no-ext-diff --no-textconv`를 적용합니다.

## 남은 리스크

- 필수 자동 게이트는 모두 통과했습니다. 제품 8파일의 최종 SHA와 각 최종 게이트의 실행 전후 SHA가 일치하는지 확인했으며, 새 종료 기록 작성으로 제품 검사를 반복하지 않았습니다.
- 수동 5분 self-test, 실제 재무 데이터, live upstream, 배포 환경 검증은 수행하지 않았습니다. complete 로그의 manual 안내를 자동 검증 완료로 바꾸지 않습니다.
- 이번 대표 수치의 실제 저장/재조회는 별도 assertion을 추가하지 않았습니다. stage/assembler 결과 전달과 기존 합성 저장 E2E 결과를 구분합니다.
- 기한 경고, legacy liabilities, solver/Monte Carlo 설계, 과거 저장 run 자동 재계산은 이번 범위에 포함하지 않습니다.
- 설치 없이 기존 의존성을 readonly로 사용했습니다. 전체 의존성 바이트의 과거 상태를 소급 보증하지 않습니다. 이번 작업의 새 의존성 변경은 없습니다.
- 저장소 밖 `/tmp`의 상세 로그와 인계 diff는 임시 증거입니다. 재부팅/임시 디렉터리 정리 이후에는 이 기록의 명령·결과·소스 지문을 기준으로 판단해야 합니다.

상태 판정:

```text
GOAL_ALLOCATION_IMPLEMENTATION=PASS
ORDER_INDEPENDENCE_VERIFICATION=PASS
MINIMUM_FUNDING_VERIFICATION=PASS
BUDGET_CAP_POLICY_VERIFICATION=PASS
RESULT_FLOW_VERIFICATION=PASS (대표 수치: 실제 stage/assembler/DTO payload; 저장/재조회 assertion은 별도 미실행)
A_REQUIRED_GATES=PASS (RC 47 passed, 2 existing conditional skips; manual self-test 미실행)
PROFILE_P0_BASELINE_PRESERVED=true
CURRENT_INDEX_PRESERVED=true
PRESERVATION_EXCEPTION_ACCEPTED=true (이전 A 예외에 한정)
NEW_PRESERVATION_EXCEPTION=false
MODEL_REQUESTED=gpt-6-astra/high
MODEL_EFFECTIVE=gpt-6-astra/high (현재 turn metadata)
ORIGINAL_MAIN_D_MODIFIED=false
B_C_PR300_MODIFIED=false
CONFIG_MODIFIED=false
DEPENDENCIES_MODIFIED=false
COMMITTED=false
PUSHED=false
PR_CHANGED=false
MERGED=false
RELEASED=false
```
