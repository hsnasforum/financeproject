# 2026-10-18 Finance 실사용 완성 최종 통합 검증

## 현재 최종 상태 (2026-10-18 오후, 클로드 1호)
- **결론**(마지막 소스 = manifest 26개 파일 기준):
  - 격리 복사본에서 정식 `corepack pnpm test`가 `DATABASE_URL` 없이 통과했습니다. 937 files, 4603 passed / 5 skipped, exit 0(`37`).
  - 원본 canonical build와 기본 typecheck도 이 소스로 끝났습니다(`39`·`40`).
  - 이전에 유일하게 실패하던 import 경계 guard(`06`)는 마스터 승인 범위의 최소 수정으로 해결했습니다(아래 "해결된 실패").
  - gate, production E2E, desktop smoke, 사용자 여정은 type-only 수정 이전 소스로 통과한 결과를 씁니다. 이 수정은 런타임 코드를 바꾸지 않는 타입 import 경로 변경이라 다시 실행하지 않았습니다.
- **기준**:
  - `/home/xpdlqj/code/finance`, branch `checkpoint/finance-review-20261011`, HEAD `e474aeba6b47570e2a85f56dc14ce5f23e92a51d`. staged 0, commit·push·배포 없음.
  - 보존: `work/10/10/2026-10-10-finance-remaining-release-validation.md`는 +12 그대로입니다.
  - `final_check.sh`는 `.data`, `__meta`, `work/10/17`, `work/10/10`, `prisma/dev.db`, `.env`, `.env.local`만 `find -newer start-marker`로 조회합니다(내용은 읽지 않고 metadata만 봄).
    - `23`·`42-final-check.log`에서는 이 대상들에 시작 marker 이후 수정 흔적이 나오지 않았습니다.
    - 이것은 관찰 결과이며, 스크립트 exit 0 자체가 무변경을 증명하는 assert는 아닙니다.
  - `tmp/`는 조회 대상이 아니고 무변경도 아닙니다. 이번 검증이 `tmp/finance-final-20261018/`, `tmp/finance-integration-20261018/` 등 `finance-*` 폴더에 로그·스크립트·스크린샷을 새로 만들었습니다. 그 밖의 기존 `tmp` 산출물은 지우거나 덮어쓰지 않았습니다.
- **환경**:
  - 기존 `~/.nvm` Node v22.22.2와 pnpm 9.15.9를 사용했습니다.
  - 모든 명령은 `tmp/finance-final-20261018/run.sh`(`wsl.exe --exec`)로 실행했습니다. 로그마다 실제 자식 `CHILD_EXIT_CODE`를 기록하고, 같은 값을 도구 exit로 반환합니다.
- **소스 동일성**:
  - **현재**: `manifest.sh`로 26개 파일의 sha256을 원본과 복사본 `/home/xpdlqj/code/finance-verification-20261018-integration`에서 비교했습니다.
    - 대상은 HEAD 대비 변경된 tracked 파일과 이번 작업의 untracked 소스·테스트이며, `work/`·`tmp/`는 제외합니다. 새 `src/lib/planning/auth/callbackPath.ts`가 포함됩니다.
    - 동기화 후 `manifest-36-after-import-fix-check.txt`와 최종 `manifest-41-final-after-import-fix.txt`에서 모두 동일했습니다.
    - 이 소스로 full test `37`, 원본 build `39`, typecheck `40`을 실행했습니다.
  - **과거**(타입 이동 전 소스): 25개 파일 기준으로 `manifest-05`·`18`·`22`에서도 동일했습니다.
  - 복사본에는 `.env`·`.env.local`·`env.local`, 사용자 DB, 인증 저장소가 없습니다.

### 독립 조사 취합 (기존 완료 기록, 이번에 새로 조사하지 않음)
- **조사**: 마스터가 같은 자료로 GPT id17과 Claude id18(후속 id20 확인)을 배정했습니다. 두 조사자는 서로의 결론을 먼저 받지 않은 독립 조사였습니다.
- **공통 자료**: task15의 실제 create 여정 로그, 당시 `src/app/dashboard/_lib/dashboardViewModel.ts`·`src/components/DashboardClient.tsx`·profile store 소스.
- **증상**: 새로 만든 프로필은 저장되지만 dashboard는 빈 `default-profile`만 보여 줍니다.
- **완료 기준**: 현재 사용자 프로필을 명시적으로 선택할 수 있고, 지표·run·CTA가 같은 프로필에 귀속되며, default 저장 규칙은 보존합니다.
- **공통 결론**: 저장 손실이 아니며 default 유지는 정상 동작입니다. 문제는 선택 UI와 명시 URL이 없다는 점입니다.
- **조사자별 추가 지적**:
  - GPT: `DashboardClient`의 `currentRun ?? latestRun` 때문에 다른 프로필의 최근 run이 주요 행동으로 쓰이는 혼선을 지적했습니다.
  - Claude: production에는 default를 바꾸는 API가 없음을 확인했습니다(legacy `isDefault` 패치는 `onlyDev`, v2 setter 없음). 그래서 기본 승격보다 native GET 선택이 최소안이라고 판단했습니다.
- **채택**:
  - native GET 프로필 선택과 검증된 id만 담는 URL(`src/app/dashboard/_lib/dashboardProfileSelection.ts`)
  - 현재 run은 표시 중인 프로필에만 귀속(`dashboardViewModel.ts`, `DashboardClient.tsx`)
  - default 저장 규칙 불변
  - 연결을 확인할 수 없는 프로필은 삭제라고 단정하지 않고 "연결된 프로필을 확인할 수 없습니다"로 안내
- **조사 당시와 현재의 구분**: 위는 조사 당시의 진단입니다. 현재 해결 여부는 최종 create 여정 `27-journey-create-cleanup-fix.log`(31 PASS)와 production E2E `12-copy-e2e-prod-dashboard.log`(10 passed)로 확인했습니다.
- 이 절은 기존 협의 결과를 마스터가 취합한 기록이며, 원문을 별도 파일로 첨부하지 않았습니다.

### 리뷰 현황 (사실 기준)
- **GPT24**: orphan 최근 기록 CTA와 run wrapper exit 지적 → 해소.
- **GPT26**: journey cleanup 지적 → 해소. 이후 31 스크립트 리뷰 PASS.
- **GPT33**: 공유 type 변경 PASS.
  - 같은 리뷰가 지적한 일회용 helper 경로 문제는 task34에서 보완했습니다.
- **GPT36**: helper와 proof 최종 리뷰 PASS. 남은 P1/P2/P3가 없고, GPT33의 경로 지적은 해소됐습니다.
  - 리뷰 내용:
    - exact path, symlink, non-dir, realpath guard
    - `44` proof: 거부 7건 exit 4, 이미 없는 root no-op exit 0
    - sentinel 2개와 symlink 보존, root 미재생성, proof 자체 fixture 정리
    - 대상 4개 파일 drift 없음
  - 검증 범위: 정확한 root가 symlink·파일·존재하는 디렉터리인 분기는 code review로만 확인했습니다. 실행이나 재생성은 하지 않았고, 할 필요도 없다는 범위 그대로입니다.
- 이로써 코드 변경 전부가 작성자 아닌 리뷰를 마쳤고, 추가 개발 요청은 없습니다.
- 기존 검증 결과는 그대로입니다: full test `37`(937 files, 4603 passed / 5 skipped, exit 0), 원본 build `39`, typecheck `40`, 26개 파일 동기화 증거 `35`·`36`·`41`.

## 변경 파일
- 이 통합 단계의 제품 변경: import 경계 수정 3개 파일(아래 "해결된 실패")
  - `src/lib/planning/auth/callbackPath.ts`(신규)
  - `src/app/dashboard/_lib/dashboardProfileSelection.ts`
  - `src/components/planning/PlanningAuthRequiredState.tsx`
- 검증 대상 소스 전체: `tmp/finance-final-20261018/manifest-41-final-after-import-fix.txt`의 26개 파일. 이 기록 작성 시점에는 커밋 전이었고, 이후 같은 26개 경로가 `2026-10-18-finance-git-closeout.md`의 "커밋 1"(`bd0133b4`)로 커밋됐습니다.
- 검증 script(`tmp/`, 커밋 대상 아님): `tmp/finance-integration-20261018/journey.mjs`, `tmp/finance-final-20261018/fault_root_check.sh`
- 기록: 이 문서

## 검증 (결과표, raw log: `/home/xpdlqj/code/finance/tmp/finance-final-20261018/`)
| # | 위치 | 검사 | 결과 | exit |
|---|---|---|---|---|
| 04 | 복사본 | `env -u DATABASE_URL corepack pnpm test` (이전 작업자 실행) | **중단됨**. 프로세스가 사라져 결과 없음(`04-INTERRUPTED-NOTE.md`) | 없음 |
| 06 | 복사본 | 같은 명령 재실행 | **FAIL**: 937 files 중 1 failed / 936 passed. tests 1 failed / 4602 passed / 5 skipped | 1 |
| 07 | 복사본 | `planning:ssot:check` | PASS, 5 files / 11 tests | 0 |
| 08 | 복사본 | `planning:v2:complete` | 8단계 PASS (report 3, guide 8, fast E2E 8) | 0 |
| 09 | 복사본 | `corepack pnpm build` | 성공, 정적 prerender route 0 | 0 |
| 10 | 복사본 | `corepack pnpm typecheck` | 오류 0 | 0 |
| 11 | 복사본 | `tsc --noEmit --incremental false -p tsconfig.playwright.json` | 오류 0 | 0 |
| 12 | 복사본 | production `dashboard-current-state.spec.ts` | 10 passed | 0 |
| 13 | 복사본 | 여정 create (1차) | 22 PASS 뒤 rerun 검사 **FAIL**(아래 원인) | 1 |
| 14 | 복사본 | 여정 create (script 보정 후) | 31 PASS, 0 FAIL | 0 |
| 15 | 복사본 | 여정 primary (control) | 26 PASS, 0 FAIL | 0 |
| 16 | 복사본 | `planning:v2:desktop:smoke --port=3310` (기본 disposable DB) | PASS | 0 |
| 17 | 원본 | build 전 확인(원본 cwd 프로세스·dist override·`.next-*` 없음) | 통과 | — |
| 19 | 원본 | canonical `corepack pnpm build` | 성공, BUILD_ID `ksvfx1eU…` → `sII8tamn…` | 0 |
| 20 | 원본 | 기본 `corepack pnpm typecheck` | 오류 0 | 0 |
| 21 | 원본 | Playwright tsc | 오류 0 | 0 |
| 23 | 원본 | git 상태·보호 경로·프로세스·포트·임시 폴더 | 변경 없음, 잔여 없음 | 0 |
| 25 | 복사본 | 여정 종료 실패 주입 | 의도대로 root 보존 후 0이 아닌 종료 | 3 |
| 27 | 복사본 | 여정 create (정리 보완 후) | 31 PASS, 정상 정리 | 0 |
| 28 | 복사본 | 여정 primary (정리 보완 후) | 26 PASS, 정상 정리 | 0 |
| 29·30 | 원본 | 최종 manifest·정리 상태 | 25개 동일, 잔여 없음 | 0 |
| 31 | 원본 | import 수정 후 guard·dashboard·auth unit 5 files | 87 passed | 0 |
| 32 | 원본 | 변경 3파일 ESLint | 오류 0 | 0 |
| 33·34 | 원본 | typecheck / Playwright tsc | 오류 0 | 0 |
| 35·36 | 원본↔복사본 | manifest 동기화(3파일)와 재확인 | 26개 동일 | 0 |
| **37** | 복사본 | **최종** `env -u DATABASE_URL corepack pnpm test` | **937 files 모두 통과, 4603 passed / 5 skipped** | **0** |
| 38 | 원본 | build 전 확인 | 통과 | — |
| 39 | 원본 | **최종** canonical build | 성공, BUILD_ID `sII8tamn…` → `5pdxUEmf…` | 0 |
| 40 | 원본 | build 후 기본 typecheck | 오류 0 | 0 |
| 41·42 | 원본 | 최종 manifest·정리 상태 | 26개 동일, staged 0, 보호 경로 쓰기 없음, 잔여 프로세스·포트·임시 폴더 없음 | 0 |

### 해결된 실패 (06번, 이전 소스의 이력)
- **증상**: `tests/components-app-import-guard.test.ts:122` 실패. `src/components/planning/PlanningAuthRequiredState.tsx:2`가 `@/app/dashboard/_lib/dashboardProfileSelection`에서 `DashboardAuthCallbackPath` 타입을 import했습니다.
  - 이 import는 클로드 1호 id19에서 들어갔습니다.
  - 타입 import라도 components → app 의존은 guard가 금지합니다.
- **수정**(마스터 승인, 이 위반만):
  - 타입의 단일 정의를 새 공유 파일 `src/lib/planning/auth/callbackPath.ts`로 옮겼습니다.
  - `src/app/dashboard/_lib/dashboardProfileSelection.ts`는 이 타입을 import해 같은 이름으로 re-export합니다. `buildDashboardAuthCallbackPath`의 런타임 동작은 바꾸지 않았습니다.
  - `src/components/planning/PlanningAuthRequiredState.tsx`는 lib에서 import합니다.
  - 타입 복제, any, ignore, exclude, guard 변경은 없습니다.
- **확인**: 31~37번. guard 테스트를 포함한 full test가 통과했습니다.
- 06번 실패 로그는 보존했습니다.

### 검증 script 보정 (제품 코드 아님, 후속 리뷰 대상)
- **파일**: `tmp/finance-integration-20261018/journey.mjs`. dashboard rerun 검사만 바꿨습니다.
- **13번 실패 원인**: 재계산 201 직후 화면이 전체 페이지 이동을 하면서 Chromium이 POST 응답 body를 버렸습니다. 그래서 응답에서 새 run id를 읽지 못했습니다. 14번 기록 `responseBodyRead:false`로 확인했습니다.
  - 기존 `tests/e2e/dashboard-current-state.spec.ts`도 같은 현상을 주석으로 다룹니다.
- **보정 내용**:
  - 새 run id를 이동한 리포트 URL에서 얻고, 같은 브라우저 세션의 HTTP 조회로 저장된 run을 확인합니다(같은 profileId, 고정 snapshot, 이전 run과 다른 id).
  - POST 1건, 같은 profileId, `rerunOfRunId`, snapshot, 201, 이동 조건은 그대로 유지했습니다. 응답 body가 읽히면 같은 id인지도 검사합니다.
  - 조건별 결과를 기록에 남기며, 완화한 조건은 없습니다.
- 13번 실패 로그는 지우지 않고 보존했습니다.

### 검증 script 정리 보완 (GPT26 지적 P2, 제품 코드 아님)
- **문제**:
  - `journey.mjs`의 `finally`는 `stopServer` 예외를 기록만 했습니다. 그 뒤 임시 root를 삭제했고, 본문이 성공했으면 exit 0을 냈습니다.
  - 공식 `stopServer`(`scripts/planning_v2_desktop_smoke.mjs:121-149`)는 강제 종료 뒤에도 launcher가 살아 있으면 예외를 던집니다. 이때 실행 중인 writer의 data와 lock을 지울 수 있었습니다.
- **보완**(같은 파일 안의 작은 변경, 새 추상화 없음):
  - 만든 launcher를 모두 추적합니다(`launchers.push`, 약 103행).
  - `finally`(약 462-517행)는 공식 smoke와 같은 기준을 모두 확인합니다.
    - 모든 launcher의 `stopServer` 성공
    - launcher 종료
    - `runtime/writer-lease.json` 제거
    - lease에 등록된 writer pid 종료
  - 이 조건이 모두 맞고, 대상이 이 script가 os tmp 아래 만든 `finance-journey-*` root일 때만 삭제합니다.
  - 하나라도 아니면 root를 보존하고 경로와 진단을 기록한 뒤 exit 3으로 끝냅니다. 사용자 root는 대상이 아닙니다.
- **종료 실패 주입**(`JOURNEY_FAULT_INJECT=stop-failure`, 약 92-94·187·482행): 첫 launcher가 뜬 뒤 본문을 건너뛰고, 첫 `stopServer`를 실패로 만듭니다.
  - 판정이 끝난 뒤 실제 launcher는 정리 목적으로만 종료합니다.
- **검증**(`/home/xpdlqj/code/finance/tmp/finance-final-20261018/`):
  - `25-journey-fault-inject-stop-failure.log`: exit 3(0이 아님). `cleanup:root-preserved`에 `launchersAlive 1`, `leaseRemains true`, `writerPidsAlive 4`가 기록됐고 root `/tmp/finance-journey-euj5iR`는 보존됐습니다.
  - `26-fault-root-check.log`: root가 존재하고, 정리 뒤 lease·프로세스·포트가 없는 것을 확인한 다음 그 disposable root만 수동 삭제했습니다.
  - `27-journey-create-cleanup-fix.log`: create 31 PASS, exit 0. 정상 정리에서 실패 0, launcher 0, lease 없음, writer 0을 확인한 뒤 자기 root만 삭제했습니다.
  - `28-journey-primary-cleanup-fix.log`: primary 26 PASS, exit 0. 정리 결과는 create와 같습니다.
  - 세 로그 모두 token 패턴 0건입니다.
- 제품 소스는 바뀌지 않았습니다(`manifest-29` 25개 동일). 따라서 위 06~21번 결과를 다시 실행하지 않았습니다.
- 14·15번 여정은 보완 전 script로 실행한 기록이므로, 현재 여정 근거는 27·28번입니다.

### 보조 정리 도구 경로 제한 (GPT33 지적 P2, 일회용 script)
- **문제**: `tmp/finance-final-20261018/fault_root_check.sh:7`의 `case /tmp/finance-journey-*`는 슬래시와 `..`까지 매칭했습니다. 그래서 `존재하는 root/../다른 경로`를 받아 16행 `rm -rf`가 다른 경로를 지울 수 있었고, symlink도 검사하지 않았습니다.
  - 실제 26번 실행은 정상 root(`/tmp/finance-journey-euj5iR`)였고, 잘못된 삭제는 관측되지 않았습니다.
- **수정**(`fault_root_check.sh`):
  - 허용 입력을 정확한 문자열 `/tmp/finance-journey-euj5iR` 하나로 고정했습니다. `..`, 하위 경로, 끝 슬래시, 다른 `finance-journey-*` 이름, 빈 값은 exit 4로 거부합니다.
  - 다음 경우도 exit 4로 거부합니다: `/tmp`가 symlink이거나 디렉터리가 아님, root가 symlink, root가 디렉터리가 아님, `realpath`가 자기 자신이 아님.
  - 이미 없는 root는 no-op입니다. exit 0과 `already_absent`를 보고하며, 다시 만들지 않고 삭제했다고도 하지 않습니다.
  - 삭제 조건에 lease 파일 부재를 추가했습니다(기존에는 프로세스와 포트만 확인). 실행 중이면 exit 5, `rm` 실패는 exit 6입니다. 삭제는 `rm -rf --one-file-system`을 씁니다.
- **증거**(`/home/xpdlqj/code/finance/tmp/finance-final-20261018/`):
  - `fault_root_check.v26-original.sh.txt`: 26번에 쓴 원래 버전
  - `45-fault-root-check.diff`: unified diff
  - `43-fault-root-check-syntax.log`: `bash -n`, exit 0
  - `44-fault-root-check-proof.log`(`fault_root_check_proof.sh`), exit 0
    - mktemp fixture만 사용했습니다(sentinel 디렉터리, 접두어가 같은 sibling, symlink).
    - 7개 거부 case(traversal 2종, 하위 경로, 끝 슬래시, sibling, symlink 이름, 빈 값)가 모두 exit 4였습니다.
    - 정확한 root(이미 없음)는 exit 0 `already_absent`였고, 다시 만들어지지 않았습니다.
    - sentinel 2개와 symlink는 보존됐고, proof fixture는 마지막에 자신이 만든 것만 정리했습니다.
- **미검증 분기**: 정확한 경로 자체가 symlink이거나 파일인 경우, 그리고 존재하는 root의 삭제 경로는 이번 proof에서 실행하지 않았습니다. 그러려면 실제 fault root 경로를 다시 만들어야 해서 지시대로 하지 않았습니다. 코드 검토 대상입니다.
- 01~37 로그와 manifest 26개, full test PASS 결과는 바뀌지 않았습니다.

### 실제 사용자 여정 (14·15번, 27·28번에서 같은 결과 재확인)
- **방식**: Playwright Chromium의 임시 profile을 사용했습니다. 공식 launcher `--no-open`과 `PLANNING_E2E_DESKTOP_*` disposable DB·data root를 실행마다 새로 쓰고 끝나면 삭제했습니다.
- **SYNTHETIC 가정 snapshot**(live 아님): 앱 시작 전에 disposable data root에만 썼습니다.
- **입력은 모두 브라우저 조작**입니다. API는 저장된 값을 확인하는 조회에만 썼습니다.
- **공통 확인 항목**:
  - 실제 one-shot URL 진입 → 서버가 세션 쿠키 설정. 같은 URL 재사용은 차단됐습니다(시작, 재시작, 모바일 진입 모두).
  - 프로필 입력·저장 → snapshot 고정 진단 실행(201, SUCCESS) → 리포트 보관(201)
  - 저장 리포트는 같은 run·profile·profileHash·markdown·기준일로 유지됐습니다(reload 후, 키보드 수정과 재시작 후).
  - 새 탭으로 다시 열어도 값이 유지됐습니다. 키보드로 저장(Enter, PATCH 200)한 뒤 reload해도 472만원이 유지됐습니다.
  - launcher를 정상 종료한 뒤 재시작해도 값이 유지됐습니다.
  - 대시보드 재계산은 표시 중인 프로필로 새 run 201을 만들었습니다.
  - 390×844에서 dashboard, planning, 리포트 모두 가로 넘침이 없었습니다.
- **create 모드**:
  - 빈 `기본 프로필`이 기본으로 남은 상태에서 "새로 만들기"로 저장하면 dashboard가 선택을 요구합니다.
  - 선택 폼으로 고르면 `/dashboard?profileId=…`가 되고 "선택한 프로필: 통합검증 사용자 프로필", 472만원, stale 상태와 링크가 같은 프로필로 맞습니다. reload와 새 탭에서도 유지됐습니다.
  - 기본 프로필 표시("기본 지정")는 바뀌지 않았습니다. 화면에 UUID가 없었습니다.
- **primary 모드**: 기본 프로필을 "저장"으로 갱신하면 dashboard가 "기본 프로필: …"과 472만원, stale을 보여 줍니다.
- **스크린샷**(disposable 값, 비밀값 없음):
  - `tmp/finance-integration-20261018/journey-create-final2/05a-dashboard-selection-required.png`
  - `…/journey-create-final2/05-dashboard-after-restart.png`
  - `…/journey-create-final2/06a-mobile-dashboard-selection.png`
  - `tmp/finance-integration-20261018/journey-primary-final2/05-dashboard-after-restart.png`
- 로그와 launcher 기록에서 token 패턴은 0건이었습니다.
- 위 스크린샷은 정리 보완 전(final2) 실행분입니다. 27·28번 실행분은 `journey-create-final3/`, `journey-primary-final3/`에 같은 이름으로 있습니다.

### 상태 구분 (마지막 소스 기준)
| 항목 | 상태 |
|---|---|
| 소스 원본 적용 | 됨 (26 files, 복사본과 hash 동일, 커밋 없음) |
| 구현 | 됨 |
| 테스트 통과 | 됨: 정식 full test 937 files / 4603 passed / 5 skipped, exit 0. gate·E2E는 type-only 수정 전 소스로 통과 |
| runtime 검증 | 복사본 production(E2E 10, 여정 create 31·primary 26, desktop smoke)에서 됨. 원본은 build·typecheck만 했고 runtime은 실행하지 않음 |
| 배포 | 안 함 |
| 사용자 목표 완료 | 로컬 검증 범위에서 완료. Windows 기본 브라우저 진입은 NOT_VERIFIED |

### 사용자 관점 기능과 실행
- 앱 실행: Node가 프로젝트 고정값 22.22.2로 맞춰진 환경에서 `pnpm start`(공식 launcher)를 쓰면 브라우저가 열리고 세션이 만들어집니다.
- 현재 WSL Ubuntu의 기본 Node는 22.23.2입니다. 이 환경에서는 이미 설치된 22.22.2를 그 명령에만 앞세워 실행합니다(전역 설정 변경이나 재설치 불필요).

  ```bash
  cd /home/xpdlqj/code/finance
  PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" corepack pnpm start
  ```

  - 이 명령으로 기본 브라우저가 열리는 경로는 검증하지 않았습니다(아래 "확인하지 않은 것").
- 재무진단에서 입력·저장 → 실행·기록 저장 → 리포트 보관 → 다시 열기가 가능합니다.
- 대시보드는 헤더나 `/dashboard`로 들어오면 기본 프로필을 보여 줍니다. `표시할 프로필`로 고르면 `/dashboard?profileId=…`로 바뀌고, 그 주소로 다시 방문하면 선택이 유지됩니다. 기본 프로필 설정은 바뀌지 않습니다.

## 남은 리스크 (확인하지 않은 것)
- Windows 기본 브라우저 자동 열기 경로: **NOT_VERIFIED**. 기존 사용자 세션 쿠키(`127.0.0.1 Path=/`)에 영향을 줄 수 있어 실행하지 않았습니다.
- live 외부 API와 live 가정 데이터: 여정의 snapshot은 synthetic입니다.
- 설치본 교체와 배포.
- 원본 production runtime 실행.
- 원본 full test: `.data/locks`를 지우는 테스트가 있어 금지된 항목입니다.

## 과거 기록 (id15, 당시 소스 기준. 현재 결과가 아님)
- id15 당시 결과:
  - 복사본 `pnpm test`가 `.env` 없이 42건 실패했습니다(`PrismaConfigEnvError`). 이후 `tests/helpers/finlifeLegacyDatabase.ts` 보정으로 해결됐고, 현재는 env 없이 해당 파일들이 통과합니다.
  - disposable `DATABASE_URL`을 주면 4584 passed였습니다.
  - complete와 build·typecheck는 통과했고, production dashboard E2E는 9 passed였습니다.
  - 원본 canonical build로 stale `finlife/pension` 타입이 제거됐습니다.
- id15 당시 "새로 만들기" 경로에서 dashboard가 빈 기본 프로필만 보여 주고 UUID가 노출되던 결함은 dashboard 프로필 선택(`2026-10-18-finance-dashboard-profile-selection.md`)으로 해결됐습니다. 위 14번 여정이 현재 동작을 확인한 근거입니다.
- id15 로그(`tmp/finance-integration-20261018/`의 01~16)는 보존했습니다. 그중 `EXIT=` 줄의 판독 주의는 `tmp/finance-usability-20261018/LOG-NOTES.md`에 있습니다.

## 사용 skill
- 없음

## 다음 라운드
- 이 기록 다음 단계는 Git 마무리입니다. 기록은 `2026-10-18-finance-git-closeout.md`에 있습니다.
- 위 "남은 리스크"의 NOT_VERIFIED 항목(Windows 기본 브라우저, live 외부 API, 원본 production runtime, 설치본·배포)은 이 단계에서 실행하지 않았습니다. 별도 승인이 있을 때만 확인합니다.
