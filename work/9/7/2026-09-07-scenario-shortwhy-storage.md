# 2026-09-07 시나리오 ID별 해석의 저장·재조회 보존

## 변경 파일

분류: CORE. 작업 루트: `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`.

- `src/lib/planning/store/runMetaRecord.ts`: 기본 compact metadata에 기존 ID별 설명 map만 기존 limit으로 보존.
- `src/lib/planning/reports/reportViewModel.ts`: canonical DTO table을 유지하면서 설명 map이 없으면 run metadata에서 읽음.
- `tests/planning/scenarioShortWhyStorage.test.ts`: 실제 계산/artifact/store/meta/blob 재조회, 순서 역전·limit·sanitizer·legacy·disabled 검증.
- `tests/planning/reports/stableReportScenarios.test.tsx`: compact 설명의 안정 리포트 렌더 및 map 없는 과거 형식 fallback.
- `tests/planning-v2-api/reports-export-html-route.test.ts`: 실제 생성·저장·GET·HTML export의 conservative/aggressive 행별 설명 확인.
- `tests/e2e/flow-history-to-report.spec.ts`: 기존 저장 run 흐름에 원본 map·API 응답·화면·HTML의 ID별 설명 일치 검증 추가.
- 이 기록.

## 사용 skill

- `finance-skill-routing`: 요청 범위에 필요한 최소 skill 선정.
- `planning-gate-selector`: 저장 optional metadata 계약 영향에 맞춰 compat 및 내부 complete를 포함한 gate 선택.
- `work-log-closeout`: 실제 결과, 보존 증거와 미확인 범위 기록.

manager는 읽기 전용으로 4단계 범위 분해와 export 소비 경로/최종 증분 리뷰를 수행했다. 구현·최종 gate·서버는 메인 소유다.

## 변경 이유와 수정 전 재현

시작 branch는 `stage1/accuracy-safety-clean-ci-20260902`, HEAD는 `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`다. 최신 `work/9/7/2026-09-07-report-scenario-to-action.md`와 그 검증 결과를 먼저 확인했다. 기존 P0, goal allocation, goal deadline, legacy debt, dashboard current-state, stable report scenario→action 변경을 이번 시작 기준선으로 보존한다.

`runScenarios` → `buildPlanningRunArtifacts` → 실제 `createRun` → 디스크 meta decode/`getRun` → `safeBuildReportVMFromRun` → 같은 run의 `getRunBlob("scenarios")`를 실행했다. 수정 전에는 저장 전 map이 존재하고 blob에서도 그대로였지만, compact meta와 재조회 결과는 scenarios ref만 가지고 있었다. base/conservative/aggressive의 interpretation은 모두 공통 fallback이었다. 이 결함 관측 테스트 1 PASS를 기능 완료 PASS로 간주하지 않는다. 증거는 scratch의 `shortwhy-before.log`다.

동일 합성 프로필 fixture의 실제 계산 문구는 다음과 같다. 새 문자열을 생성하거나 flat 배열의 위치를 추측한 결과가 아니다.

| scenario ID | 저장 전 첫 설명 / 수정 후 저장·재조회·VM에서 확인한 동일 문구 |
| --- | --- |
| conservative | 투자수익률 -3.00%p 변화로 말기 순자산이 -551,137.43원 변했습니다. |
| aggressive | 투자수익률 +1.50%p 변화로 말기 순자산이 +306,126.07원 변했습니다. |
| base | 원본 map에 별도 설명 없음. 기존 `기준 대비 순자산/경고 변화를 함께 확인하세요.` 유지 |

## 핵심 변경

- `storeRawOutputs=false`에서 `shortWhyByScenario`만 남긴다. ID는 그대로 유지하고 각 value는 기존 `LIMITS.actionsTop`(5개)으로 제한한다. raw 저장 분기도 같은 기존 compaction을 재사용한다.
- `withStageBlobRefs`의 기존 병합으로 최종 metadata는 `scenarios: { shortWhyByScenario, ref }`가 된다. scenario table/전체 blob을 metadata에 복제하지 않으며 `resultDto.raw={}`도 유지한다.
- `toScenarioRows`의 table은 canonical DTO 우선 계약 그대로다. DTO에 ID별 map이 없을 때 run metadata map을 읽고 각 row.id로 첫 설명을 선택한다.
- 안정 화면과 HTML export는 기존 ReportVM 소비 경로를 그대로 사용한다. production fetch, 계산/설명 생성, resultDto schema 확대, 저장 schema version bump, action 생성/순위 변경이 없다.
- map 없는 legacy/base fallback, scenario disabled/failed의 결과·행동 흐름과 기존 run 비교 순서를 유지한다. 과거 run rewrite/backfill을 추가하지 않는다.

## 검증

Windows PowerShell에서 Ubuntu WSL의 Linux Node `v22.23.2`, `/usr/bin/git`, 기존 `/usr/bin/corepack pnpm@9.15.9`를 사용했다. 내부 pnpm 해석도 9.15.9로 확인했다. 고정 환경은 다음과 같다.

```text
COREPACK_HOME=/home/xpdlqj/.cache/node/corepack
COREPACK_ENABLE_NETWORK=0
COREPACK_ENABLE_AUTO_PIN=0
COREPACK_DEFAULT_TO_LATEST=0
GIT_OPTIONAL_LOCKS=0
```

기존 검증 runner의 node_modules/Git/config read-only 보호를 재사용했다. 가변 data/build/cache/typecheck/브라우저 결과는 `/tmp/finance-a-shortwhy-20260907/`에 격리했다. 비밀 env 파일은 빈 파일로 가렸으며 값을 읽지 않았다. install/update/use/up/prepare/dlx/npx 또는 새 preservation exception은 없다.

아래 P는 `/usr/bin/corepack pnpm@9.15.9`다. 실제 호출은 `wsl.exe -d Ubuntu --exec /usr/bin/python3 /tmp/finance-a-shortwhy-20260907/run.py <label> <P 뒤 인자>`이며 실행 argv, exit, 소스/index SHA는 각 label의 JSON에 기록한다.

| 검사 | 결과 |
| --- | --- |
| 수정 전 실제 저장 재현 | 1 test PASS: map 소실과 blob 원본 보존 관측 |
| focused-final | 10 files / 62 tests PASS |
| `P typecheck` | 최종 PASS |
| `P lint` | PASS |
| `P test` | 873 files / 3,669 tests PASS |
| `P planning:v2:compat` | PASS: compat fixture 8 tests, migration, 내부 complete 및 fast E2E 8/8 |
| `P build` | PASS, 246/246 페이지 생성 |
| 관련 `P e2e:rc --grep 'planning reports\|planning report detail\|planning runs selected\|planning runs and reports'` | 11 PASS / 기존 조건부 1 SKIP |

focused는 `scenarioShortWhyStorage`, `runMetaRecord`, `runCreateStore`, `runBlobStore`, `reportViewModel`, `reportViewModel.safeBuild`, `stableReportScenarios`, `create-run-service-modules`, `planning-store`, `reports-export-html-route`의 테스트 파일을 실행했다. 명령의 정확한 파일 목록은 `focused-final.json`에 있다.

실제 store 테스트는 저장 응답·디스크 meta·getRun·blob map을 저장 전과 ID별로 비교한다. canonical table/map 순서를 뒤집어도 설명 연결이 유지된다. map의 기존 limit, 임의 원래 ID 보존, 메타에 ref/map만 존재, DTO 유지, schemaVersion=2, stage ref 일치, sanitizer의 path 제거를 확인한다. 새/legacy 형식의 읽기 전후 meta bytes가 같고 scenario disabled의 actionRows가 원본 계산과 같음을 확인한다. stable 렌더 테스트는 FAILED/PARTIAL_SUCCESS, action 순서 및 run-to-run compare 회귀도 포함한다.

HTML export route 테스트는 실제 API 생성 run을 다시 GET하여 conservative/aggressive의 서로 다른 설명을 확인하고, HTML의 해당 제목 행에 같은 설명이 들어가는지 검증한다. HTML production 코드 수정은 필요하지 않았다. export 서비스는 meta를 읽고 동일 ReportVM을 사용한다.

E2E는 기존 `flow-history-to-report.spec.ts`를 재사용했다. 테스트 내부에서만 기존 blob endpoint를 읽어 저장 전 artifact map과 비교한다. 이것은 production 리포트의 새 fetch가 아니다. 원본 map → API metadata → VM → 안정 화면의 각 ID 행 → HTML export까지 같은 문구인지 검증하며, scenario 비활성 실행의 행동과 기존 비교 흐름도 확인한다.

관련 RC의 1 SKIP은 기존 `error-state-retry.spec.ts`의 namespace 조건부 비인증 검사이며 PASS로 집계하지 않았다. scenario→action 및 no-scenario, 기한 후 달성/export, selected/compare 안내, 비교·추천 deep link, 저장 상세 이동/재검증/오래된 선택 해제, 상세 리포트의 11개 검사가 통과했다. dev 서버는 동일 검증 환경의 격리 데이터·3263 포트를 사용했다.

E2E의 `scenario-comparison.png`를 scratch 루트로 별도 복사하고 `view_image`로 실제 렌더를 확인했다. base는 기존 공통 문구, Conservative는 `투자수익률 -3.00%p 변화로 말기 순자산이 -9,909,233.31원 변했습니다.`, Aggressive는 `투자수익률 +1.50%p 변화로 말기 순자산이 +5,847,203.62원 변했습니다.`로 표시된다. 이는 앞의 unit fixture와 다른 기존 E2E 합성 입력이며, 각 실행 내부에서 원본 map/저장 응답/화면/HTML이 일치함을 검증했다. 이미지 경로는 `/tmp/finance-a-shortwhy-20260907/scenario-comparison.png`다.

초기 export 테스트의 `unknown` 응답 타입을 명시하지 않아 typecheck가 실패했다. 테스트 내 map/table의 실제 응답 형태를 명시한 후 typecheck와 focused를 다시 실행해 통과했다. 제품 타입을 약화하지 않았다. 초기 실패 로그는 `typecheck-export-before-fix.log`에 보존했다.

저장 metadata의 기존 optional field 보존 변경이므로 `planning:v2:compat`를 선택했다. 표준 compat가 legacy fixture migration 검사와 `planning:v2:complete`를 내부 실행하므로 complete를 별도로 중복 실행하지 않는다. 새 route/href/config/운영 명령 변경이 없어 README나 route SSOT를 편집하지 않는다.

## 보존 확인

시작 증거는 scratch의 `start.json`, `baseline/`, `baseline.diff`, `baseline.status`다. A 시작 4,315개 파일과 B/C/D/PR300의 파일·branch·HEAD·status·index, package/lock/workspace/config, dependency metadata를 기록했다. 중간 대조에서 이번 명시된 변경 외 추가 변경·삭제가 없고 peer/dependency/protected 파일이 동일했다.

최종 보존 대조는 scratch의 `final-review.json`, `shortwhy-increment.diff`, `final.status`에 기록했다. 시작 4,315개 파일 중 이번 수정 5개 외 변경·삭제가 없고, 추가 파일은 storage 테스트와 이 기록뿐이다. 기존 6개 승인 변경 내용은 시작 baseline 대비 증분으로 보존했으며 안정 리포트 UI 컴포넌트와 이전 work 기록도 그대로다. B 4,310개/C 4,279개/D 4,438개/PR300 4,301개 파일과 각 branch/HEAD/status/index가 시작과 같다.

package/lock/workspace/config/next-env는 SHA가 같고, node_modules의 `.modules.yaml`, `.pnpm/lock.yaml`, vitest/next/tsc 실행 파일은 SHA와 mtime가 같다. 모든 최종 gate의 실행 전·후 소스 SHA가 같고 최종 소스와도 일치한다. gate별 exit 0/index 보존을 함께 확인했다. `git diff --check`도 PASS다. 읽기 전용 최종 증분 리뷰에서 구체적 결함은 발견되지 않았다.

최종 검증 시간: focused 13.35초, typecheck 24.73초, lint 206.50초, full test 117.22초, compat(complete 포함) 236.18초, build 270.07초, 관련 RC 118.46초. complete 내부 fast E2E를 별도로 반복하지 않았다.

raw index 시작·종료 SHA-256: `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`. branch/HEAD도 시작과 같다.

모델 requested/recommended는 `gpt-6-astra/high`다. 메인 effective model/effort를 입증하는 실행값은 노출되지 않아 `[미확인]`이다. 요청값이나 config 내용을 실제 적용값으로 간주하지 않았고 전역 설정을 변경하지 않았다.

```text
SCENARIO_SHORTWHY_PRE_SAVE=true
SCENARIO_SHORTWHY_POST_SAVE=true
SCENARIO_ID_BINDING=true
STABLE_REPORT_ID_SPECIFIC_INTERPRETATION=true
LEGACY_FALLBACK_PRESERVED=true
SCENARIO_BLOB_REF_PRESERVED=true
ACTION_FLOW_PRESERVED=true
A_REQUIRED_GATES=PASS (관련 RC 11 PASS / 기존 조건부 1 SKIP)
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

## 남은 리스크와 종료 범위

- 이번 범위의 필수 자동 gate와 보존 판정은 완료했다. 전체 RC·별도 수동 5분 self-test·실제 사용자 데이터/운영 환경 검사는 수행하지 않았다.
- 합성 프로필을 실제 계산/artifact/store/API 경로로 검증한다. 실제 사용자의 과거 run과 운영 환경은 확인하지 않았다.
- 이미 ID map이 소실된 과거 compact run은 기존 공통 fallback을 유지한다. blob에서 자동 복구하거나 저장 기록을 다시 쓰지 않는다.
- scenario stage 실패는 기존 FAILED/PARTIAL_SUCCESS 렌더 fixture로 검증하며 실제 외부 장애를 강제하지 않는다.
- 이번 목표 이후 과거 run 보정, planner 또는 상품추천 확장으로 자동 진행하지 않는다.
