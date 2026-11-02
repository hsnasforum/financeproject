# 2026-09-07 현재 프로필과 최신 플랜 정렬·변경 감지

## 변경 파일

분류: CORE. 대상: `/home/xpdlqj/code/.worktrees/finance-stage1-accuracy-safety-20260902`.

- `src/app/dashboard/_lib/dashboardViewModel.ts`: 현재 프로필 ID·canonical 입력을 서버 내부에서 유지하고, 프로필별 최신 완료 run 및 해시 상태 판정.
- `src/components/DashboardClient.tsx`: hero에 현재 프로필의 run과 상태 안내 표시, 현재 프로필로 재계산 CTA 연결.
- `tests/dashboard-view-model.test.tsx`: 교차 프로필 렌더 재현을 회귀 검사로 전환하고 상태·실패·페이지네이션 경계 추가.
- `tests/e2e/dashboard-current-state.spec.ts`: 실제 API/store의 missing→current→stale, 더 최신 B run, A 재계산 이동 및 자동 run 미생성 확인.
- `README.md`, `docs/planning-v2-user.md`: 기본 프로필과 플랜 연결 및 비교 범위 설명.
- 이 기록.

## 사용 skill

- `finance-skill-routing`: 필요한 로컬 skill 선택.
- `planning-gate-selector`: focused/typecheck/lint/full/build/complete/E2E 게이트 선정.
- `route-ssot-check`: 기존 `/planning?profileId=...`와 리포트 경로를 실제 page 및 `docs/current-screens.md`에 대조.
- `work-log-closeout`: 변경·검증·보존·미확인 범위 기록.

manager는 읽기 전용으로 4단계 분해와 증분 리뷰를 수행했다. 구현과 최종 게이트는 메인이 수행했다. 새 route나 route 분류 변경이 없어 current-screens 문서는 수정하지 않았다.

## 변경 이유

시작 branch는 `stage1/accuracy-safety-clean-ci-20260902`, HEAD는 `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`다. 최신 `work/9/7/2026-09-07-scenario-shortwhy-storage.md`와 검증 결과를 먼저 확인했다. 기존 Profile corruption P0, goal allocation, goal deadline, legacy debt, dashboard current-state, stable report scenario→action, scenario shortWhy의 7개 승인 변경과 기록을 보존한다.

수정 전 실제 loader와 `renderToStaticMarkup`을 실행했다. 기본 프로필 A의 월 순수입 500만원과 함께, 더 최신인 B run의 말기 순자산 9,999만원이 hero에 표시되고 B 리포트 링크가 연결됨을 assertion으로 확인했다. 단순 source string 검색 결과가 아니다. `before.log`의 20개 통과는 기존 검사와 결함 관측 검사의 통과이며 기능 완료 판정이 아니다. 해당 검사는 최종 코드에서 A run 선택과 hero의 B 금액 부재를 확인하도록 바꿨다.

## 핵심 변경

- 글로벌 최근 6개 `runs`와 현재 프로필용 `currentPlan`을 분리한다. hero만 현재 프로필에 연결하고 기존 최근 실행·액션·후보 패널은 유지한다.
- repository의 createdAt 내림차순에서 같은 profileId의 첫 `SUCCESS` 또는 `PARTIAL_SUCCESS`를 선택한다. SUCCESS를 더 최근 PARTIAL_SUCCESS보다 앞세우지 않는다. FAILED/RUNNING/상태 미상은 완료 플랜으로 사용하지 않는다.
- 최신 완료 run에 inline summary가 없어도 건너뛰지 않는다. 해당 run으로 해시를 비교하고 없는 지표는 기존처럼 `-`로 표시한다. 글로벌 6개 밖의 run과 metadata 누락으로 짧아진 페이지도 기존 프로필별 조회 및 index 페이지 확인으로 처리한다.
- 기존 `computeProfileHash(record.profile)`만 사용하고 raw hash와 전체 profile 입력은 client에 보내지 않는다. stale의 primary CTA는 `현재 조건으로 다시 계산`이며 현재 기본 프로필의 `/planning?profileId=<id>`로 이동한다.
- 현재 6지표, 프로필/전체 run/프로필별 run 조회 실패의 독립성을 유지한다. 자동 계산·저장, 새 엔진, schema 변경, snapshot 복원, run 교체·삭제, action ranking 또는 assumptions freshness 확장은 없다.

### 해시 재사용 근거와 상태 의미

profileStore의 읽기 계약은 `loadCanonicalProfile(...).profile`을 반환한다. run 생성의 `createRunRecordAssembler.ts`는 같은 profile을 `buildRunReproducibilityMeta`에 전달하고, 이 함수는 `src/lib/planning/v2/reproducibility.ts`의 `computeProfileHash`를 호출한다. Dashboard도 이 함수를 그대로 호출한다. workspace의 `resolveRunMatchesCurrentProfile`과 같은 profileId+hash 비교 의미이며, 별도 stringify/hash 규칙을 만들지 않았다. 실제 API E2E에서 저장 직후 current를 확인했다.

`DashboardCurrentPlan`은 current/stale/unverified이면 sanitized `run`을 포함하며, missing 또는 failed이면 hero용 run을 포함하지 않는다.

| 상태 | 의미와 표시 |
| --- | --- |
| current | 프로필 로드 성공, 같은 프로필의 완료 run, 저장 hash 존재, 현재 hash 계산 성공 및 동일. `현재 저장 프로필과 같은 조건으로 계산된 플랜입니다.` |
| stale | 같은 조건에서 hash 불일치. `현재 프로필이 이 플랜 이후 변경되었습니다. 미래 결과를 다시 계산해야 합니다.` |
| missing | 입력된 현재 프로필 또는 해당 프로필의 run이 없음. `현재 프로필로 저장한 플랜이 없습니다.` |
| unverified | 선택한 완료 run에 과거 형식의 hash가 없음. `과거 실행이라 현재 프로필과 일치 여부를 자동 확인할 수 없습니다.` current/stale로 추정하지 않음. |
| failed | 프로필/프로필별 run/index/해시 확인 실패 또는 완료 상태의 run이 없음. 안전한 확인 실패 안내를 표시하며 다른 독립 데이터는 유지. |

프로필이 있어도 FAILED/RUNNING/상태 미상 기록뿐이면 `완료된 계산 결과가 없습니다`라는 failed 안내를 표시한다. hash가 없는 완료 run의 unverified와 구분한다. 전역 최근 목록만 실패해도 프로필별 조회가 성공했다면 currentPlan을 유지한다.

## 검증

Windows PowerShell에서 Ubuntu WSL의 `/usr/bin/git`, Node `v22.23.2`, `/usr/bin/corepack pnpm@9.15.9`를 사용했다. 아래 P는 `/usr/bin/corepack pnpm@9.15.9`다.

```text
COREPACK_HOME=/home/xpdlqj/.cache/node/corepack
COREPACK_ENABLE_NETWORK=0
COREPACK_ENABLE_AUTO_PIN=0
COREPACK_DEFAULT_TO_LATEST=0
GIT_OPTIONAL_LOCKS=0
```

이전 `/tmp` runner는 현 환경에 없었다. 이번 증거는 `/tmp/finance-a-current-plan-20260907/`에 저장했다. node_modules를 복사하지 않고 읽기 전용 mount했으며 원본 workspace, Git, peer 작업공간도 읽기 전용이다. 검증용 소스 복사본과 합성 데이터·빌드·캐시만 scratch에서 쓴다. 비밀 env는 복사하지 않고 테스트가 읽는 `.env.example`만 복사했다. 내부 pnpm 재호출도 임시 실행 wrapper로 9.15.9에 고정했다. 설치·dependency 재복사·전역 설정 변경·새 preservation exception은 없다.

최종 브라우저 환경의 cwd는 namespace 내부 `/validation/execution`, 임시 데이터는 `/validation/temp`이며 실제 디스크의 scratch 하위에 대응한다. 제품 데이터 경로 env 계약을 재정의하지 않는다. E2E는 기존 wrapper가 합성 저장소를 격리하고 3264 포트를 사용한다. 최종 대상 E2E와 RC는 namespace를 활성화해 사용자 분리도 확인했다.

| 실제 명령/검사 | 최종 결과 | 증거 label |
| --- | --- | --- |
| P test tests/dashboard-view-model.test.tsx tests/planning/v2/loadCanonicalProfile.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts tests/planning-store.test.ts tests/planning/runCreateStore.test.ts tests/planning-v2-api/create-run-service-modules.test.ts tests/planning-v2-api/reports-route.test.ts | 7 files / 75 tests PASS | focused-data-fixed |
| P typecheck | PASS, 7.01초 | typecheck-safe |
| P lint | PASS, 56.14초 | lint-safe |
| P test | 873 files / 3,683 tests PASS, 66.46초 | full-test-contract |
| P planning:v2:complete | PASS, 내부 fast E2E 8/8, 69.13초 | complete-path-fixed |
| P build | PASS, 246/246 페이지, 241.68초 | build |
| P e2e:pw tests/e2e/dashboard-current-state.spec.ts --workers=1 | 1 PASS, 47.49초 | dashboard-e2e-final |
| P e2e:rc --grep 'dashboard\|planning workspace\|planning quickstart\|planning reports\|planning report detail\|planning runs\|history' | 17 PASS / 기존 조건부 1 SKIP, 103.11초 | rc-final |
| git --no-optional-locks diff --check | PASS | 최종 직접 실행 |

각 label의 `.log`에 출력, `.json`에 실제 argv/exit/시간/source 보존/index SHA를 기록했다. 위 grep의 `|`는 정규식 OR이며 실제 argv는 `rc-final.json`에 있다. full test에는 current-user 저장소·인증 scope 회귀도 포함된다. 저장/계산 schema를 바꾸지 않아 compat는 반복하지 않았다.

Dashboard 단위 검사는 33개다. A/B 교차 렌더, 최신 PARTIAL_SUCCESS 선택, 글로벌 6개 밖의 A, metadata hole 뒤 페이지, summary 없는 최신 완료 run, current/stale/unverified/missing, 프로필/전역 run/프로필별 run/해시 실패, FAILED/RUNNING/상태 미상 제외, 현재 6지표, 기존 액션/리포트/이력 링크, 입력 객체 비변경 및 client raw hash 부재를 확인했다.

최종 대시보드 E2E는 합성 A 저장→A run 생성→current→A 소득 수정→stale→더 최신 B run 생성 후에도 A의 24개월 결과와 리포트 CTA 유지→B가 최근 목록에 존재→재계산 CTA의 A profileId 이동을 실제 API/store와 브라우저에서 확인한다. 이동 전후 run ID 목록이 동일해 진입·새로고침·재계산 화면 이동만으로 run을 추가하지 않음을 검증한다. 현재 6지표 및 다른 사용자 namespace의 미노출도 확인했다.

`dashboard-current-plan.png`를 `view_image`로 확인했다. 현재 6지표, stale 안내와 primary CTA, A의 24개월 미래 결과, 최근 목록의 B 36개월/A 24개월 구분이 실제 화면에 표시된다.

### 검증 중 실패와 복구

- 최초 E2E에서 테스트가 `/api/planning/profiles` 응답의 `data.profileId`를 `data.id`로 읽어 `profileId is required`가 발생했다. API 계약에 맞춰 이 작업의 E2E만 수정했고 최종 E2E가 통과했다.
- 초기 runner는 namespace 설정을 단위 검사에도 적용하거나 `.env.example`을 누락했고, namespace root 소유권·서로 다른 mount 사이의 임시 파일 이동·WSL DNS symlink 목적지 누락 문제도 있었다. 제품 코드나 보안 assertion을 바꾸지 않고 격리 경계를 수정했다. 데이터 루트 env 재정의는 다른 저장소 검사 계약을 깨므로 제거했다. 같은 mount에서 원래 경로 계약을 사용하는 검증으로 영향 10 files / 91 tests와 전체 873 files가 통과했다. 초기 실패 로그는 남겨 두었다.
- complete 초기 시도는 cwd `/tmp/execution`이 Playwright의 `**/tmp/**` 제외 규칙에 걸려 `No tests found`였다. 이를 PASS로 취급하지 않았다. 최종 `/validation/execution`에서 원래 complete를 다시 실행해 fast E2E 8개까지 통과했다.
- 초기 관련 RC와 좁은 재현에서 기존 시나리오 blob 조회가 HTTP 404였다. 응답 본문을 읽는 진단 assertion은 검증 복사본에만 잠시 추가했고 그 실행은 통과했다. 이후 원본 테스트로 복구된 최종 RC 전체 선택 세트가 17 PASS/1 SKIP이며 blob 조회도 200이었다. **최초 404의 원인은 미확인**이며 해결 원인을 단정하지 않는다. 기존 `flow-history-to-report.spec.ts` 원본은 수정하지 않았다. 진단 실행을 최종 PASS 근거로 사용하지 않았다.
- 증분 리뷰에서 summary 존재 필터와 짧은 run 페이지의 종료 추정 문제를 발견해 수정했다. 관련 회귀를 추가한 이후 최종 typecheck/lint/full/build/complete/E2E를 확인했다.

## 보존 확인

시작 `start.json`, `baseline/`, `baseline.diff`는 A의 추적·비무시 파일 4,315개(env 파일 제외), branch/HEAD/status/raw index 및 아래 네 peer 경로의 파일 지문·Git 상태를 기록한다. `current-plan-increment.diff`는 HEAD가 아닌 이 시작 working tree 대비 증분이다.

최종 `preservation.json` 대조 대상은 A와 `finance-profile-corruption-preservation-c1cad28d`, `finance-dependency-audit-reliability-20260904`, `finance-dependency-audit-response-body-timeout-20260904`, `finance-pnpm-action-bootstrap-v6010-d8401041`이다. A는 위 6개 기존 파일과 이 기록만 변경/추가했다. 나머지 시작 파일과 기존 7개 변경 기록, peer 파일·branch·HEAD·status·index는 보존했다. 원래 dashboard 변경은 시작본 위의 요청 증분으로 보존했다.

사용자 요청의 B/C/D/PR300 약칭 전체와 실제 경로의 대응은 현재 입력에 명시되지 않아 위 경로 대조보다 넓은 개별 SHA 검증을 주장하지 않는다. 검증 namespace의 원본 `/home` 전체는 읽기 전용이며 peer 경로에 편집·Git mutation은 수행하지 않았다.

package/lock/workspace/config는 시작 SHA와 같으며 node_modules의 `.modules.yaml`, `.pnpm/lock.yaml`, vitest/next/tsc 실행 파일의 SHA와 mtime도 같다. 최종 게이트 실행 전후 원본 source와 index가 같고, 최종 브라우저/complete/RC의 source manifest SHA는 `1e34bb7b09ee3b003ffa18b5a1670382fa5b37c5c8c82a1eb12cd0d116db86ea`로 같다(이 종료 기록 추가 전 기준).

raw index 시작·종료 SHA-256: `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c`. branch/HEAD도 시작과 같다.

모델 recommended/requested는 `gpt-6-astra/high`다. 메인 effective model/effort를 입증하는 실행값은 노출되지 않아 `[미확인]`으로 남긴다. 요청값이나 설정 파일만으로 실제 적용값을 단정하지 않았다.

```text
CURRENT_PROFILE_RUN_ALIGNMENT=true
CROSS_PROFILE_HERO_MIXING=false
PROFILE_HASH_CURRENT=true
PROFILE_HASH_STALE=true
LEGACY_RUN_UNVERIFIED=true
RERUN_CTA_PROFILE_SCOPE=true
RECENT_RUN_LIST_PRESERVED=true
A_REQUIRED_GATES=PASS (관련 RC 17 PASS / 기존 조건부 1 SKIP)
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

- 최초 RC의 시나리오 blob 404 원인은 미확인이다. 최종 원본 RC에서는 재현되지 않았으며 관련 제품/기존 테스트를 변경하지 않았다.
- assumptions freshness는 확인하지 않는다. current는 저장 프로필 조건의 일치만 뜻하며 가정·시장 데이터의 최신성까지 보증하지 않는다.
- 실제 사용자 데이터와 운영 환경, 별도 수동 5분 self-test, 전체 RC 전체 목록은 검사하지 않았다. 요청 범위의 자동 게이트와 대시보드/관련 RC 선택 세트는 완료했다.
- 새 계산 엔진, 자동 pipeline, 변경 필드 diff, snapshot 복원 또는 과거 run 보정으로 범위를 넓히지 않고 이번 목표에서 종료한다.
