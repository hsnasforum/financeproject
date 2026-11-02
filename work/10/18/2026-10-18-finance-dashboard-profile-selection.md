# 2026-10-18 대시보드 프로필 선택과 격리 테스트 fixture

## 목표와 기준
- 목표 1: 첫 진입 때 생긴 빈 `default-profile`이 기본으로 남은 채 "새로 만들기"로 저장한 경우에도, 사용자가 대시보드에서 저장한 프로필을 찾아 선택·확인할 수 있게 합니다.
- 목표 2: `.env`가 없는 격리 checkout에서 `pnpm test`가 fixture 때문에 실패하지 않게 합니다.
- 기준:
  - `/home/xpdlqj/code/finance`, branch `checkpoint/finance-review-20261011`, HEAD `e474aeba6b47570e2a85f56dc14ce5f23e92a51d`. 커밋은 없습니다.
  - 기존 `work/10/10/...` +12줄과 미추적 `.data/planning-debug-access-check/`, `__meta/`, `tmp/`, `work/10/17/`을 보존했습니다.
- 지킨 계약: 기본 프로필 저장 규칙(`defaultProfileId`)을 바꾸지 않습니다. 명시 선택을 다른 프로필로 조용히 대체하지 않습니다. auth fail-closed, FX 출처 표시, 계산식, 저장 경합 보호는 그대로입니다.

## 변경 파일
- 아래 본문에 적힌 제품·테스트 파일(`dashboardProfileSelection.ts`, `page.tsx`, `dashboardViewModel.ts`, `DashboardClient.tsx`, `dashboardClientModel.ts`, `docs/current-screens.md`, `tests/helpers/finlifeLegacyDatabase.ts`, `tests/finlife-legacy-fixture-env.test.ts`, `tests/dashboard-profile-selection.test.tsx`, `tests/dashboard-view-model.test.tsx`)은 모두 `2026-10-18-finance-git-closeout.md` "커밋 1"(`bd0133b4`)의 26개 경로에 들어 있습니다.
- `tmp/` 아래 검증 script(`journey.mjs`, `run.sh`)는 커밋 대상이 아닙니다.

## 기존 구현 (클로드 1호 id19, 이번에 다시 쓰지 않음)
- `src/app/dashboard/_lib/dashboardProfileSelection.ts`: `?profileId=`를 `none` / `requested` / `invalid`로 파싱합니다.
  - 중복 query, 빈 값, 형식 오류는 `invalid`입니다.
  - 인증 callback 경로를 만듭니다.
- `src/app/dashboard/page.tsx`: 선택을 파싱해 view model에 넘깁니다. 인증 오류일 때는 선택을 유지한 callback으로 `PlanningAuthRequiredState`를 보여 줍니다.
- `src/app/dashboard/_lib/dashboardViewModel.ts`
  - 현재 사용자 프로필 목록 안에서만 선택을 해석합니다.
  - 상태: `selection-invalid`(형식 오류·삭제·범위 밖), `selection-required`(기본이 빈 seed이고 다른 저장 프로필이 있음), `missing`, `loaded`(`source: selected|default`), `failed`(저장소 오류)
  - 빈 seed와 사용자가 만든 실제 0원 프로필을 구분합니다. 실행 기록에는 프로필 이름 라벨을 붙이고, 알 수 없는 프로필은 "연결된 프로필을 확인할 수 없습니다"로 표시합니다.
- `src/components/DashboardClient.tsx`
  - native GET form 선택기 `DashboardProfileSelector`: `min-h-11`, 같은 이름은 순번으로 구분, "기본 지정" 표시
  - 지표·계산 상태·rerun·리포트 링크를 같은 `profileId`로 묶었습니다.
  - 화면 문구의 UUID를 이름으로 바꿨습니다.
- `docs/current-screens.md:32`에 query 설명을 추가했습니다.
- `tests/helpers/finlifeLegacyDatabase.ts`: `migrate diff` 자식에게만 fixture 자신의 `file:` URL을 `DATABASE_URL`로 줍니다. 전역 env, `prisma.config.ts`, exclude, assert는 바꾸지 않았습니다. 회귀 테스트는 `tests/finlife-legacy-fixture-env.test.ts`입니다.
- `tmp/finance-integration-20261018/journey.mjs`에 create 선택과 default 불변 assertion을 추가했습니다. 새 여정은 아직 실행하지 않았습니다.
- 기존 검사(`tmp/finance-dashboard-selection-20261018/`, 모두 자식 exit 0, 이번 수정 이전 소스 기준)

  | 로그 | 내용 | 결과 |
  |---|---|---|
  | 05 | tsc | 오류 0 |
  | 06 | Playwright tsc | 오류 0 |
  | 07 | unit 5 files | 80 passed |
  | 08 | eslint | 0 errors |
  | 11 | 복사본 fixture 6 files(정리된 env) | 73 passed |
  | 12 | 복사본 build | 통과 |
  | 13 | catalog 6 files | 18 passed |
  | 14 | production dashboard E2E | 10 passed |

  이 PASS는 이번 경계 보완 뒤의 소스를 증명하지 않습니다.

## 이번 경계 보완 (클로드 2호, GPT21 복구 감사 지적)
- **B1 invalid 선택이 인증 복구 뒤 default로 바뀜**
  - `buildDashboardAuthCallbackPath`가 `invalid`를 `/dashboard`로 돌려보내서, 재인증 뒤 명시 오류가 사라지고 기본 프로필이 보였습니다.
  - 수정: `invalid` → `/dashboard?profileId=`(빈 값)로 바꿨습니다. 이 주소는 다시 `invalid`로 파싱됩니다.
  - 사용자 입력은 싣지 않으므로 외부 주소나 다른 id가 callback에 들어가지 않습니다. `none`은 그대로 `/dashboard`입니다.
- **B2 명시 선택한 빈 seed의 진단 링크에서 id가 빠짐**
  - `missing` 상태에서는 `/planning` 링크에 id가 없어, 다른 프로필이 기본이면 그 프로필로 이동했습니다.
  - 수정 내용:
    - `DashboardCurrentProfile`의 `missing`에 선택 id(`id?`)를 넣습니다. 명시 선택이 seed로 확인된 경우에만 채웁니다.
    - `DashboardClient`의 `currentPlanningHref`는 `loaded`/`missing`의 id를 씁니다. 빈 상태 CTA(기존 `:388` 고정 `/planning`)도 이 href를 씁니다.
  - 선택하지 않은 경우의 빈 seed 링크는 기존처럼 `/planning`입니다.
- **테스트 정정·추가**: `tests/dashboard-profile-selection.test.tsx`
  - 기존에 결함을 정상으로 기대하던 `/dashboard`(invalid callback)와 `{ state: "missing" }`(명시 seed)를 올바른 계약으로 바꿨습니다.
  - 추가 경우:
    - 외부 URL·빈 값·중복 query의 웹·desktop callback
    - 다른 프로필이 기본일 때 명시한 `default-profile`의 링크
    - 선택하지 않은 seed의 링크
- 변경 파일: `src/app/dashboard/_lib/dashboardProfileSelection.ts`, `src/app/dashboard/_lib/dashboardViewModel.ts`, `src/components/DashboardClient.tsx`, `src/components/dashboard/dashboardClientModel.ts`, `tests/dashboard-profile-selection.test.tsx`
  - `PlanningAuthRequiredState.tsx`는 query를 떼고 navigation state를 만드는 기존 처리로 충분해서 바꾸지 않았습니다.

## 검증 (`tmp/finance-resume-20261018/`, Node 22.22.2, pnpm 9.15.9, 자식 exit 기록)
- 수정 전: 격리 복사본의 old 소스에 새 테스트만 넣어 실행했습니다(`01-before-unit-copy.log`). 대시보드 3건(invalid callback, 명시 seed id, seed 링크)이 실패했고 exit 1입니다.
- 수정 후
  - 복사본: 2 files 27 passed, exit 0 (`04`)
  - 원본: unit 7 files 99 passed, exit 0 (`07`)
  - 원본: eslint 0 errors, exit 0 (`08`)
  - 원본: `corepack pnpm typecheck` exit 0 (`09`)
  - 원본: Playwright tsc exit 0 (`10`)
- 복사본 동기화 근거: `copy-sync-*.log`(sha256 전후)와 `copy-sync-*.diff`

## 남은 리스크 (미실행·남은 조건)
- 이번 수정 뒤에는 다음을 실행하지 않았습니다. 독립 GPT 리뷰 뒤 별도 통합 단계에서 합니다.
  - 전체 `pnpm test`(격리 복사본에서만)
  - production rebuild
  - `tests/e2e/dashboard-current-state.spec.ts`
  - 필수 게이트
  - 완전 여정(`journey.mjs` create 모드)
- 현재 계약: 헤더나 `/dashboard`로 들어오면 기본 프로필을 보여 줍니다. `?profileId=`가 있는 주소로 다시 방문하면 그 선택을 유지합니다.
  - (정정) 이전에 "선택을 유지하려면 production set-default route가 필요하다"고 적었습니다. 그것이 유일한 방법이라는 근거가 없어 삭제했습니다.

## GPT24 리뷰 보완 (클로드 2호)
- **P2 최근 기록의 "같은 조건으로 다시 계산" 링크**
  - 문제: 연결된 프로필을 확인하지 못한 기록에도 이 링크가 있었습니다. planning은 없는 id를 받으면 첫 프로필을 선택하므로, A 기록을 남기고 A를 삭제한 뒤 이 링크를 누르면 B가 열렸습니다.
  - 수정:
    - view model이 인증된 프로필 목록 안에 기록의 프로필이 있을 때만 `profileLinked: true`를 붙입니다(`profileLabels?.has`). 프로필 이름이나 현재 선택으로 판단하지 않습니다.
    - `DashboardClient`는 `profileLinked`인 기록에만 이 링크를 보여 줍니다. "리포트 다시 보기"는 모든 기록에 그대로 둡니다.
  - 테스트
    - `tests/dashboard-profile-selection.test.tsx`에 1건을 추가했습니다: 연결 기록(다른 프로필 표시 중)은 링크 유지, 삭제된 프로필의 기록은 링크 없음, 목록 실패·빈 목록은 링크 없음, 리포트 링크는 모두 유지.
    - `tests/dashboard-view-model.test.tsx`의 "preserves saved run limit…"는 목록에 없는 `profile-1`의 링크를 기대해 결함을 정상으로 고정하고 있었습니다. `profile-1`을 목록에 넣어, 연결 기록이 링크를 유지하는지 검사하도록 바꿨습니다.
- **P3 `tmp/finance-resume-20261018/run.sh`**
  - 이전 버전은 항상 0을 반환했습니다. 이제 `exit "$CHILD"`로 실제 자식 exit를 돌려줍니다.
  - 증명(`13-runsh-caller-proof.log`): 자식 0 → 반환 0 / 로그 0, 자식 7 → 반환 7 / 로그 7.
  - 01-10 로그는 이전 버전으로 만들어졌으므로 각 로그의 `CHILD_EXIT_CODE` 줄만 유효합니다. 01·03의 1은 실제 자식 exit입니다.
- **검증 script `tmp/finance-integration-20261018/journey.mjs`**(이번에는 수정과 문법 검사만 했고 여정은 실행하지 않음)
  - SYNTHETIC 가정 snapshot을 launcher 시작 전에 일회용 data root `assumptions/history`에 씁니다.
    - 기록에 `live: false`로 남기고, warnings에도 synthetic이라고 표시합니다.
    - 값은 기존 e2e `seedSnapshot`과 같습니다.
  - workspace 선택기로 이 snapshot을 고정해 실행합니다.
  - 보고서 재열기 검사를 존재 확인에서 다음 항목의 일치 확인으로 강화했습니다. 저장 직후, reload 후, 키보드 수정과 재시작 후 모두 같은지 assert합니다.
    - 리포트의 `runId`
    - run의 `profileId`·`profileHash`(저장 당시 값)·`snapshotId`
    - markdown 동일
    - "원본 진단 결과로 돌아가기" href
    - 기준일
  - 대시보드 재계산 검사: 선행조건 부족으로 거절되던 경우를 더 이상 허용하지 않습니다.
    - 성공 조건: POST 1건(같은 profileId, `rerunOfRunId`, 고정 snapshot), 201, 새 run id, 그 리포트로 이동
    - 거절되면 `precondition: snapshot-precondition-refused`로 구분해 기록하고 실패로 처리합니다.
- 검증(로그 `tmp/finance-resume-20261018/`, Node 22.22.2, run.sh 반환값과 로그 exit가 같음)

  | 로그 | 내용 | 결과 |
  |---|---|---|
  | 16 | 수정 전 unit (복사본) | 1 failed / 15 passed, exit 1 |
  | 17 | 수정 후 원본 1차 | `dashboard-view-model` 1건 실패(위 결함 고정 테스트), exit 1 |
  | 18 | 정정 후 원본 5 files | 99 passed, exit 0 |
  | 19 | eslint | 0 errors(기존 warning 1건), exit 0 |
  | 20 | typecheck | exit 0 |
  | 21 | Playwright tsc | exit 0 |
  | 22 | 복사본 2 files | 58 passed, exit 0 |
  | 23 | `node --check journey.mjs` | exit 0 |

  복사본 동기화 근거: `copy-sync-sources-2.log`, `copy-sync-tests-4.log`, `copy-sync-tests-5.log`(sha256)
- 미실행: 보강한 `journey.mjs`의 실제 여정(create와 primary 모드), 전체 test, build, 필수 게이트. 재계산 성공 검사는 synthetic snapshot 기준이며 live 가정 데이터 검증이 아닙니다.

## 사용 skill
- 기존 구현 단계: 당시 사용 기록이 없어 확인하지 못했습니다.
- 이후 Git 준비 단계: 마스터가 `superpowers:finishing-a-development-branch`를 읽고 적용했습니다(`2026-10-18-finance-git-closeout.md`).

## 다음 라운드
- 위 "남은 리스크"와 GPT24 보완의 미실행 항목은 이후 `2026-10-18-finance-usability-integration.md`에서 실행했습니다: 격리 복사본 full test `37` exit 0, canonical build `39`, production `dashboard-current-state.spec.ts` `12` 10 passed, `planning:v2:complete` `08`, 여정 create `27`·primary `28`(synthetic snapshot 기준).
- live 가정 데이터 검증은 그 기록에서도 실행하지 않았습니다.
