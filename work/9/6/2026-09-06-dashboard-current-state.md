# 2026-09-06 대시보드 현재 기본 프로필 재무 상태 연결

## 변경 파일

작업 루트: `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`.

- `src/app/dashboard/_lib/dashboardViewModel.ts`: current-user 기본 프로필 계산·독립 로드 상태와 미입력 초기 레코드 구분.
- `src/components/DashboardClient.tsx`: 현재 재무 상태 6지표와 최근 플랜의 미래 결과 분리.
- `tests/dashboard-view-model.test.tsx`: 실제 run artifact fixture, 계산·사용자 scope·오류·초기 프로필·기존 액션/링크 회귀 19개.
- `tests/e2e/dashboard-current-state.spec.ts`: 실제 API 저장 → 기본 프로필 표시 → 기존 run 리포트/기록 이동, namespace 사용자 간 격리.
- 이 기록.

## 사용 skill

- `finance-skill-routing`: 이번 CORE 구현에 필요한 최소 skill 선정.
- `planning-gate-selector`: focused, typecheck, lint, full test, complete, build, 관련 E2E/RC 선정.
- `route-ssot-check`: 기존 `/planning`, `/planning/runs`, `/planning/reports` 경로와 SSOT 일치 확인. 경로 추가·분류 변경 없음.
- `work-log-closeout`: 실제 수행 결과와 미확인을 분리한 한국어 기록.

manager는 4단계 계획과 검증 계약을 읽기 전용으로 검토했고, 최종 증분의 scope/계산/초기 레코드 경계도 검토했다. 제품 수정·최종 검증은 메인이 수행했다.

## 변경 이유

CORE. 시작 branch는 `stage1/accuracy-safety-clean-ci-20260902`, HEAD는 `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`다. 기존 Profile corruption P0, goal allocation, goal deadline, legacy debt 변경 전체를 현재 기준선으로 보존한다.

제품 수정 전 `buildPlanningRunArtifacts`에 실제 `simulateMonthly` 결과를 넣어 생성한 두 summary 모두 `monthlySurplusKrw`가 없음을 확인했다. 해당 artifact를 기존 `loadDashboardViewModel`과 `DashboardClient`로 렌더링하면 월 잉여금 카드가 `-`였다. 이 수정 전 재현은 `dashboard-before`에서 5 tests passed로 확인한 관측 assertion이며, 실패 테스트를 통과 결과로 포장한 것이 아니다. 최종 테스트에서는 같은 실제 artifact 계약을 유지하며 현재 프로필의 월 잉여금 표시를 기대한다.

## 핵심 변경

- `withCurrentPlanningPageUser` 안에서 기존 `listCurrentUserRuns`와 `listCurrentUserProfilesWithDefault`를 각각 로드한다. 두 실패를 독립 처리하며, 인증 scope 확보 실패 시 어느 repository도 호출하지 않는다. 기본 프로필 ID로 선택하고 최근 run의 profileId/결과로 대체하지 않는다.
- 현재 월 생활지출은 `essential + discretionary`, 최소 상환액과 부채는 현재 `debts` 합계다. 기존 `computeMonthlySurplusKrw(income, expenses, debtPayment)`를 재사용한다. 입력 5,000,000 − (2,000,000 + 800,000) − 700,000 = 1,500,000원이며 화면은 기존 금액 포맷으로 150만원을 표시한다.
- 현재 순자산은 엔진 시작 상태와 동일하게 `liquidAssets + investmentAssets + sum(max(0, goal.currentAmount ?? 0)) − sum(debt.balance)`다. 엔진의 초기 pensionAssets는 0이다. 테스트에서는 10,000,000 + 20,000,000 + 3,000,000 − 10,000,000 = 23,000,000원이며, 무수입·무지출·무수익률 simulation의 첫 행 `netWorth - netWorthDelta`와도 일치한다. 엔진·DTO schema는 수정하지 않았다.
- 기존 hero 구성 안에서 “현재 재무 상태” 6지표와 “최근 플랜 결과”를 구분했다. 현재 프로필 이름·저장 시점과 계산 근거를 노출하고, 말기 순자산·최저 현금은 미래 결과로 유지한다. 기존 report/history/rerun/action/candidate 처리를 보존한다.
- 빈 저장소에서 기존 repository가 자동 생성하는 `default-profile` 초기 레코드도 미입력으로 안내한다. ID·기본 이름·createdAt=updatedAt·정확한 기본 필드 집합·전체 0/빈 배열이 모두 맞을 때만 해당한다. 사용자 생성 0원, 수정된 기본 프로필, optional 입력이 있는 복원 프로필은 실제 입력으로 유지한다. 로드 실패는 재시도 안내로 구분한다.

실제 브라우저 첫 시도에서 repository 자동 seed를 발견했다. 단위 테스트의 빈 배열만으로는 이 경계를 잡지 못했으며, 실제 store 계약을 확인한 후 대시보드에서만 보완했다. 보호 대상 profileStore와 저장 의미는 바꾸지 않았다.

## 검증

Ubuntu WSL/Linux Node `v22.23.2`, Linux Git, 기존 `/usr/bin/corepack pnpm@9.15.9`를 사용했다. 직접/내부 pnpm 모두 9.15.9다.

```text
COREPACK_HOME=/home/xpdlqj/.cache/node/corepack
COREPACK_ENABLE_NETWORK=0
COREPACK_ENABLE_AUTO_PIN=0
COREPACK_DEFAULT_TO_LATEST=0
GIT_OPTIONAL_LOCKS=0
```

이전 검증 runner의 read-only node_modules/Git/config 보호와 scratch data/cache/build 격리를 재사용했다. 설치·update·prepare·dlx·npx는 실행하지 않았다. 영구 config를 바꾸지 않았다.

증거 위치는 `/tmp/finance-a-dashboard-20260906/`다. `start.json`, `baseline/`, 각 검증의 `.log`/`.json`, `dashboard-increment.diff`, `final-review.json`을 사용한다. `.json`에 실제 argv, exit, 시간, 소스/index SHA 전후를 기록한다.

아래 `P`는 `/usr/bin/corepack pnpm@9.15.9`다. 실제 실행은 `wsl.exe -d Ubuntu --exec /usr/bin/python3 /tmp/finance-a-dashboard-20260906/run.py <label> <P 뒤 인자>` 형식이다.

| 검사 | 결과 |
| --- | --- |
| 수정 전 실제 artifact → 대시보드 | 월 잉여금 `-` 재현, 5 assertions/tests PASS |
| dashboard/profile loader·repository·current-state 계산 focused | 8 files / 223 tests PASS, dashboard 19개 포함 |
| `P typecheck` | PASS |
| `P lint` | PASS |
| `P run test --maxWorkers=4` | 871 files / 3652 tests PASS |
| `P planning:v2:complete` | PASS, 내부 fast E2E 8/8 |
| `P build` | PASS, 246/246 페이지 생성 |
| `P e2e:pw tests/e2e/dashboard-current-state.spec.ts --workers=1` | 최종 소스 1 PASS, 다른 사용자 scope 격리 포함 |
| `P e2e:rc --grep 'dashboard renders\|public page titles'` | 최종 소스 관련 RC 2 PASS |

focused 파일: `tests/dashboard-view-model.test.tsx`, `tests/planning/auth/currentUser.test.ts`, `tests/planning/auth/planningPageUserScopeCoverage.test.ts`, `tests/planning/server/planningRscLoadersSanitizer.test.ts`, `tests/planning/calc/financial-correctness.test.ts`, `tests/planning-store.test.ts`, `tests/planning/profileCorruption.test.ts`, `tests/planning/legacyDebtStorage.test.ts`.

E2E는 합성 데이터와 기존 current-user 헤더 계약을 사용한다. 해당 실행 환경에만 `PLANNING_NAMESPACE_ENABLED=true`를 설정하여 별도 사용자 데이터와 기본 프로필 선택을 검증한다. 기존 namespace-disabled 전체 suite에서 이 파일을 실행할 경우에는 미입력/사용자 격리 assertion만 조건부이며, 현재 기본 프로필/기존 run 이동 검증은 계속 실행된다. 신규 spec은 기존 RC 파일 목록에 없으므로 별도 `e2e:pw`로 반드시 선택했다. 관련 RC만 실행했으며 전체 RC를 실행했다고 주장하지 않는다.

초기 자동 서버 검사에서 열린 리스너가 없는 localhost 포트의 연결 timeout이 약 123초 걸렸다. 이후 브라우저가 화면에 도달해 자동 seed 결함을 확인했다. 후속 검증은 task-owned `P dev --webpack --host 0.0.0.0 --port 3261 --strict-port`를 먼저 띄우고, 같은 격리 환경에 `E2E_EXTERNAL_BASE_URL`을 지정해 실행했다. 인증·설치·네트워크 설정을 우회하거나 변경한 것이 아니다.

planning 사용자 결과를 소비하므로 저장소 complete 계약을 적용한다. planning 핵심 계산·legacy 저장/run schema를 수정하지 않아 별도 compat는 반복하지 않는다. 현재 화면 경로 분류는 유지되어 별도 route catalog 편집과 guard 증설은 없다.

최종 검증 시간: focused 5.61초, typecheck 80.32초, lint 118.69초, full test 138.58초, complete 209.11초, build 226.85초, dashboard E2E 28.40초, 관련 RC 18.61초다. 모든 최종 gate가 exit 0이며 검사 전후 제품/테스트 소스와 최종 소스의 SHA가 일치한다. 초기 보완 이전 PASS를 최종 소스의 PASS로 대체 보고하지 않았다.

보존 최종 대조: 시작 A 4,311개 파일 중 허용한 대시보드 3개 외 변경·삭제 없음. 추가 파일은 dashboard E2E와 이 기록뿐이다. 기존 Profile P0/allocation/deadline/legacy debt 패치와 기록은 시작 bytes 그대로다. B 4,310개/C 4,279개/D 4,438개/PR300 4,301개 파일, 각 branch/HEAD/status/index도 시작과 같다. raw index SHA-256은 시작·종료 모두 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`다.

package/lock/workspace/config와 next-env는 시작 SHA와 같다. node_modules는 검사 중 read-only이며 `.modules.yaml`, `.pnpm/lock.yaml`, vitest/next/tsc 실행 파일의 SHA와 mtime도 시작과 같다. 새 preservation exception은 없다. `git diff --check`가 통과했다. stage/unstage/index rewrite, commit/push/PR/merge는 수행하지 않았다. 시각 확인 증거는 scratch의 `dashboard-current-state.png`이며 현재 6지표가 미래 결과보다 앞에 표시되는 렌더를 확인했다.

모델: 사용자 requested 모델/effort는 미지정이다. 권장은 GPT-6 Astra/high였으며, 메인 effective 모델/effort는 확인 가능한 런타임 결과에 노출되지 않아 [미확인]이다. config 또는 권장값을 실행값으로 보고하지 않는다.

## 남은 리스크

- 실제 사용자 저장 데이터와 배포 환경은 열어 검증하지 않았다. 합성 프로필·실제 artifact/API/store·브라우저 검증 범위다.
- 전체 RC와 별도 수동 5분 self-test를 실행했다고 보고하지 않는다. 이번 영향의 dashboard E2E, 관련 RC, complete 내부 fast E2E를 실제 실행했다.
- 현재 순자산은 기존 엔진의 목표자금 별도 합산 계약을 따른다. 기존 profile form이 현금성/투자자산에서 목표 현재액을 생성하는 경로도 있어, 실제 사용자가 자산과 목표자금을 중복 입력했는지는 별도 확인되지 않았다. 이 입력/엔진 계약을 이번 대시보드 연결 범위에서 바꾸지 않는다.
- 초기 seed 구분은 현재 repository의 ID·이름·필드·시간 계약에 맞춘 보수적 판별이다. seed 형식이 바뀌면 관련 회귀를 함께 갱신해야 한다. 저장소 schema나 별도 provenance 필드를 추가하지 않았다.
- 이번 라운드는 현재 기본 프로필 연결, 실제 artifact 재현, 실패/미입력/scope 경계와 기존 동선 검증까지 완료했다. 필수 검증 미완료 항목은 없다. 이번 목표에서 종료하며 시나리오 비교·다음 행동 UI 확장으로 이어가지 않는다.
