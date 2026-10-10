# Finance 프로덕션 간헐 빈 본문 조사 — NOT_COMPLETE

- 수행일: 2026-10-10 KST
- 기준: work/10/10/2026-10-10-finance-autonomy-first-proof.md
- branch / HEAD: main / e296a529f1e3d48c224aee36ca1b9bf65ee0cf44
- 결론: **새 빌드와 추가 반복에서 빈 본문을 2회 재현했습니다. 직접 렌더링 경계는 좁혔지만 배경 전환이 멈추는 근본 원인은 미확정입니다. 제품 수정과 수정 효과 검증은 수행하지 않았으며 NOT_COMPLETE입니다.**

## 변경 파일과 보존

이번 작업에서 추가한 추적 대상은 이 조사 기록입니다. 아래 기존 미커밋 3개 파일과 정식 테스트 기대값은 변경하지 않았습니다.

- src/components/DashboardClient.tsx
- tests/e2e/dashboard-current-state.spec.ts
- tests/e2e/planning-quickstart-preview.spec.ts

기준 3개 파일, package/lockfile, Playwright 설정의 SHA256 6개가 시작과 종료 시 동일합니다. 실행 소스와 격리본의 관련 tracked 파일 1,943개도 일치합니다. index 변경은 없고 git diff --check는 통과했습니다. 기존 기록·원본 trace는 덮어쓰지 않았습니다. commit/push/배포/전역 설정 변경은 없습니다.

진단 스펙·helper는 기존 격리본에서만 작성·실행한 뒤 증거 디렉터리로 옮겼습니다. 정식 회귀 테스트에 원인 불명 우회나 기대값 완화를 넣지 않았습니다.

- [증거 요약](../../local/finance-blank-navigation-20261010/summary.json)
- [전체 실제 명령](../../local/finance-blank-navigation-20261010/evidence/blank-investigation/executed-commands.txt)
- [실제 실행 결과](../../local/finance-blank-navigation-20261010/evidence/blank-investigation/run-outcomes.json)
- [진단 스펙·helper](../../local/finance-blank-navigation-20261010/evidence/blank-investigation/diagnostic-inputs/)
- [소스 보존 확인](../../local/finance-blank-navigation-20261010/evidence/blank-investigation/final-audit.json)
- [렌더링 상태 비교](../../local/finance-blank-navigation-20261010/cache-state-comparison.json)

## 사용 skill과 환경

superpowers의 using-superpowers, systematic-debugging, verification-before-completion, dispatching-parallel-agents, test-driven-development의 진단 테스트 원칙 및 playwright, planning-gate-selector, work-log-closeout을 적용했습니다. 제품 원인이 미확정이므로 제품 TDD 또는 수정 완료를 의미하지 않습니다.

기존 /tmp/finance-autonomy-20261010-d0bd4l_g의 run.py, workspace, 테스트 전용 state/DB와 공식 실행 스크립트를 재사용했습니다. bwrap unshare-all의 Linux 환경이고 원본 소스·HOME·사용자 DB는 실행 sandbox에 마운트하지 않았습니다. 프로덕션 E2E의 실행별 DB·Planning root 분리는 기존 wrapper가 담당했습니다.

- Node 22.22.2 / Corepack pnpm / Next 16.2.12 / React 19.2.3 / Playwright 1.58.2
- 프로덕션: 공식 desktop launcher, standalone build, 127.0.0.1
- 이전 build ID: 9umgazZ39OjO4Zm0rpgbi
- 새 build ID: rF_mnKTP8Cl9Mde4r9pKL
- 실제 운영 DB·외부 API live·설치된 Windows 앱·배포 환경 검증으로 확대하지 않습니다.

## 최초 실패와 새 실패

정식 테스트 321~325행은 새 페이지에서 대시보드에 진입한 뒤 SiteHeader의 데스크톱 재무진단 링크를 누르고 즉시 390×844로 변경합니다.

| 항목 | 최초 실패 | 새 빌드 정식 테스트 실패 |
|---|---:|---:|
| 클릭 실행 시간 | 54.1ms | 84.3ms |
| 클릭 시작 → viewport 변경 시작 | 57.6ms | 87.9ms |
| 클릭 시작 → 상태 assertion 종료 | 5104.4ms, 실패 | 5133.3ms, 실패 |
| 최종 URL | /planning | /planning |
| MAIN | 백업 배너만 | 백업 배너만 |
| 본문·상태 카드·loading DOM | 모두 없음 | 모두 없음 |
| 마지막 클릭 이후 Planning API | 0건 | 0건 |
| console.error / pageError | 0 / 0 | 0 / 0 |

viewport 직후 trace snapshot은 아직 /dashboard였고 실패 assertion 종료 snapshot은 /planning이었습니다. 이를 정확한 navigation 완료 시각으로 오해하지 않습니다. 진단 실행의 navigation.json에는 별도 navigation 이벤트와 상대 시각을 기록했습니다.

두 실패의 마지막 Flight는 같은 _rsc=4aK6dAN-sYP5ffwV와 layout refetch tree, RSC:1, Next-Url:/dashboard, prefetch 헤더 없음 상태입니다. HTTP 200 헤더 뒤 ERR_ABORTED이며 body size/receive는 -1, body SHA는 없었습니다. **HTTP 200은 수신 완료 증거가 아닙니다.**

정상 30회에서도 Flight 취소 28건, 완료 2건이 관측됐고 repeat28은 같은 hash·취소 상태로 정상 렌더링했습니다. 취소나 요청 hash만으로 원인을 설명할 수 없습니다. 정상 Planning 응답의 cache/SW flag와 private, no-store 헤더로 Next 메모리 라우터 캐시의 사용 여부를 단정하지 않습니다.

Planning page/layout과 공유 JS chunk 8개의 URL은 두 실패에서 동일하고 HTTP 200이었습니다. 제품 소스에서 전체 폼을 viewport로 숨기거나 해당 상태에서 전체 화면을 null 반환하는 경로는 찾지 못했습니다. DOM에 본문 자체가 없어 CSS 가림만으로 설명되지 않습니다.

- [새 빌드 실패 trace](../../local/finance-blank-navigation-20261010/evidence/blank-prod-rebuild-results/tests-e2e-planning-quickst-0c3be-ore-applying-beginner-draft/trace.zip)
- [새 빌드 실패 화면](../../local/finance-blank-navigation-20261010/rebuild-failure-last.jpeg)
- [최초 실패 요약](../../local/finance-blank-navigation-20261010/original-safe-summary.json)

## 확보한 직접 렌더링 증거

관측의 타이밍 영향을 줄이기 위해 postmortem 스펙은 원래 클릭·viewport 변경·5초 assertion까지 관측 코드를 실행하지 않았습니다. assertion 이후에만 committed React root의 router cache와 hook 값의 제한된 형태를 읽었습니다. 실패 후 5초·10초 추가 관찰 뒤에도 원래 오류를 다시 throw하여 실패 판정을 보존했습니다.

8회 중 1회에서 재현됐고 5.316초, 10.421초, 15.536초에 다음 상태가 유지됐습니다.

| 관측 | 정상 7회 | 실패 |
|---|---|---|
| active page key | __PAGE__ | __PAGE__ |
| page cache.rsc | fulfilled → Fragment | fulfilled → Fragment |
| cache.prefetchRsc | literal null 6회, fulfilled→null promise 1회 | ordinary promise fulfilled→null |
| useDeferredValue 선택값의 형태 | 정상 RSC 7회 | ordinary promise fulfilled→null |
| planning loading tuple | 존재 | 3항목 존재 |
| 본문/상태/loading DOM | 본문·상태 있음 | 모두 없음 |

설치된 Next 16.2.12의 layout-router.js 315~338행과 일치하는 경계입니다. ordinary prefetch promise도 초기 표시값으로 선택되며, fulfilled null promise를 React child로 렌더하면 suspend하지 않아 loading fallback도 표시하지 않습니다. 따라서 직접 관측한 경계는 **본문 RSC promise가 완료됐는데도 null prefetch를 표시하는 상태에서 배경 전환이 끝나지 않는 것**입니다.

정상 1회에도 null-valued prefetch entry가 있었으므로 entry의 존재 자체는 실패 충분조건이 아닙니다. Fiber 값의 형태는 저장했지만 객체 identity, root pending/suspended/pinged lanes, 깊은 client module lazy 상태를 모두 저장하지 않았습니다. **전체 renderer 준비 완료 또는 React scheduling 결함 확정으로 확대하지 않습니다.**

이번 재현에서는 loading 전달 누락, active profileId query key 잔류, page RSC 전체 미수신만으로 빈 본문을 설명하는 가설이 반박됐습니다. 배경 전환이 멈추는 이유는 여전히 미확정입니다.

- [실패 5.3초 상태](../../local/finance-blank-navigation-20261010/evidence/blank-postmortem-B2-results/tests-e2e-planning-navigat-518fa-ore-applying-beginner-draft-repeat5/failed-assertion.json)
- [실패 15.5초 상태](../../local/finance-blank-navigation-20261010/evidence/blank-postmortem-B2-results/tests-e2e-planning-navigat-518fa-ore-applying-beginner-draft-repeat5/failed-plus-10s.json)
- [15.5초 화면](../../local/finance-blank-navigation-20261010/evidence/blank-postmortem-B2-results/tests-e2e-planning-navigat-518fa-ore-applying-beginner-draft-repeat5/failed-plus-10s.png)
- [postmortem 실패 trace](../../local/finance-blank-navigation-20261010/evidence/blank-postmortem-B2-results/tests-e2e-planning-navigat-518fa-ore-applying-beginner-draft-repeat5/trace.zip)

## 조건별 실제 실행

모두 수정 전 제품 상태이며 retry=0입니다. 빌드·관측 방식·조건이 다르므로 하나의 실패율로 합치지 않습니다.

| 조건/실행 | 실제 결과 | 해석 |
|---|---|---|
| A 데스크톱 클릭 후 대기 | 8/8 PASS | 본문·상태 양수 rect |
| B 클릭 직후 모바일 변경 | 8/8 PASS | 원래 동작 순서 유지 |
| C 본문 확인 후 모바일 변경 | 8/8 PASS + 가시성 강화 4/4 PASS | 강화본은 제목·폼 visible 후 변경 |
| D 직접 진입·새로고침 | 8/8 PASS + 가시성 강화 4/4 PASS | 강화본은 직접 진입과 reload 각각 visible |
| 마지막 전환에 80ms 네트워크 지연 A/B | 각 4/4 PASS | 지연만으로 재현 안 됨 |
| 추가 관측 없는 기존 프로덕션 4개 테스트 ×30 | 120/120 PASS | 핵심 저장·복원 흐름 30회, 빈 본문 0회 |
| 새 build 후 기존 프로덕션 4개 테스트 | **3 PASS / 1 FAIL** | 같은 325행 빈 본문 |
| 새 build Flight 수집 B | 8/8 PASS | 관측 타이밍 영향 배제 못 함 |
| 판정 후 관측 B, 기존 보조 3개 포함 ×8 | **31 PASS / 1 FAIL** | 핵심 7 PASS / 1 FAIL; 15.5초에도 빈 본문 |
| 마지막 Flight 응답을 보류 후 A 대기 / B 모바일 변경 뒤 원문 전달 | 각 3/3 PASS | 실제 gate 각3건, 프로토콜 오류0 |

C·D 강화 검사 8개 trace의 대상 toBeVisible assertion 36개가 완료됐고 단계별 snapshot 16개에서 본문·상태 카드 rect가 양수였습니다. 초기 D의 text assertion은 hidden SSR DOM을 잡을 수 있어 실제 가시성 증거로 사용하지 않았습니다. 강화 검사에서 직접 진입과 reload 화면을 각각 확인했습니다.

진단 파일에는 URL/navigation, RSC/Flight 헤더·부분 body·완료/취소, cache/SW flags, 브라우저 오류, DOM/style/rect, loading/Suspense 관련 구조, 화면/trace와 서버 로그를 보존했습니다.

### 하네스 오류와 관측 제한

- blank-matrix-B: 처음 helper가 모든 prefetch HTTP 종료를 기다려 하네스 timeout 1건·중단 1건이 발생했습니다. 본문은 표시돼 있었으며 제품 빈 본문 재현으로 세지 않았습니다. 비차단 CDP 관측으로 하네스를 수정했고 원래 테스트 timeout은 바꾸지 않았습니다.
- blank-matrix-B2: 클릭 전 screenshot 지연이 포함된 8 PASS는 참고 실행으로만 보존했습니다.
- blank-postmortem-B: 스펙 준비 assertion 실패 후 보조 24개만 선택됐습니다. exit 0이지만 핵심 시나리오는 미실행으로 제외했습니다. B2에서는 실제 32개 선택을 확인했습니다.
- 강화 D에서 CDP Network.streamResourceContent의 request ID 소실 관측 오류 15건이 있었습니다. 제품 예외가 아니며 모든 Flight body를 완전 수집했다고 주장하지 않습니다.
- 초기 helper의 UTF-8 chunk 문자열은 byte-exact 전체 응답이 아닙니다. 후속 helper는 raw base64도 보존했습니다. 실패 네트워크 본문을 과거 trace에서 복구한 것은 아닙니다.

## 필수 기본 검증

[실제 명령과 exit code](../../local/finance-blank-navigation-20261010/evidence/blank-investigation/executed-commands.txt)는 기존 격리 환경에서 새로 실행한 결과입니다.

| 검사 | 실제 명령/범위 | 결과 |
|---|---|---|
| 단위 테스트 | corepack pnpm exec vitest run, 아래 8개 파일 | 98/98 PASS |
| ESLint | corepack pnpm exec eslint, 기존 변경 3개 파일 | PASS |
| 타입 검사 | corepack pnpm typecheck | PASS |
| 빌드 | corepack pnpm build, 공식 safe script | PASS |
| 개발 핵심 E2E | corepack pnpm e2e:pw, quickstart/dashboard/history-report 선택 11개 | 11/11 PASS |
| 새 빌드 프로덕션 핵심 E2E | corepack pnpm e2e:pw --runtime production, 선택 4개 | **3 PASS / 1 FAIL** |
| 저장·report reload·새 페이지 재열기·프로필 동일성·run ID·빈 목표 저장/복원 | 기존 quickstart 기대값 유지 | 정상 실행 통과; 실패 실행은 전환 이후 검증 미도달 |
| 핵심 콘솔/페이지 예외 | 원래 핵심 30회 및 재현 trace | console.error/pageError 0/0 |
| diff | git diff --check | PASS |

단위 테스트는 dashboard-view-model, planningQuickStart, profileFormModel, workspaceProfileBundle, workspaceQuickStartHandoff, create-run-persistence, simulateMonthly, goalDeadline의 8개 파일입니다. 전체 경로와 실제 인자는 명령 기록에 있습니다.

개발 전체 11개 trace에는 콘솔 오류 8건이 있습니다. 오류 주입/부분 실패/누락 snapshot/fallback 테스트 6건과 보조 외부 API 2건의 ENV_MISSING 400입니다. 후자 응답 body에서 MOIS/EXIM 설정 누락을 직접 확인했습니다. 프로덕션 보조 partial-failure 케이스는 의도된 503을 기록합니다. 따라서 전체 테스트 콘솔이 무오류라고 주장하지 않습니다. 개발11·새프로덕션4·postmortem32 trace의 pageError는 모두 0건입니다. [콘솔 감사](../../local/finance-blank-navigation-20261010/evidence/blank-investigation/console-audit.json)

빌드는 middleware 명명 폐기 경고를 포함했으나 exit 0입니다. 관련 구조는 변경하지 않았습니다.

## 증거 보존 검증

원본을 보존하고 새 ignored 디렉터리 work/local/finance-blank-navigation-20261010에 마스킹 사본을 저장했습니다. 구조화된 Cookie/Set-Cookie/Authorization 계열과 지정 desktop session 문자열을 가렸습니다.

- 증거 파일 1,254개 checksum 확인
- trace ZIP 263개, trace/network JSON 304,773행 파싱 확인
- 원본에서 식별한 합성 desktop session 값 17개의 사본 잔존: 0건
- [증거 감사 결과](../../local/finance-blank-navigation-20261010/evidence-audit.json)

지정 session 값·JSON 구문·checksum 범위의 검사이며 임의의 모든 비밀을 탐지하는 보편적 보증은 아닙니다. manifest는 evidence/ 파일에 한정하고 별도 생성 요약과 이미지 사본은 목록 밖입니다.

## 상태와 남은 조건

- **IMPLEMENTED:** 진단 자동화·증거 수집만 수행. 추가 제품 수정 없음.
- **TEST_PASSED:** 명시한 단위·lint·타입·빌드·개발 검사와 정상 실행들.
- **TEST_FAILED:** 새 빌드 정식 프로덕션 1건, postmortem 핵심 1건. 후속 PASS로 덮지 않았습니다.
- **RUNTIME_VERIFIED:** 정상 저장·복원 흐름과 실제 빈 본문 재현 확인. 결함 해결은 미검증.
- **SOURCE_APPLIED:** 새 제품/정식 테스트 수정 없음. 기존 3개 변경 보존.
- **DEPLOYED:** 아니요.
- **USER_GOAL_COMPLETE:** 아니요. **NOT_COMPLETE**.

같은 현상은 재현했고 null prefetch 선택 상태가 loading 없이 빈 본문을 만드는 경계까지 확인했습니다. 그러나 왜 완료된 page RSC로 배경 전환하지 못하는지 확정하지 못했습니다. 원인에 직접 연결된 최소 수정, 수정 전후 개선, 수정 후 30회 반복 및 모든 필수 회귀 PASS는 충족하지 못했습니다. 기존 30회 연속 PASS는 이전 build의 수정 전 관측이며 해결 증거가 아닙니다.

다음 조사에는 실패 페이지의 React root pending/suspended/pinged lanes, 중단된 background subtree의 깊은 client module lazy 상태, RSC 객체 identity와 SegmentCache entry/Flight chunk의 대응 관계가 필요합니다. 기존 격리본에 보존한 스펙은 tests/e2e, helper는 tests/e2e/helpers로 복사하여 run.py에서 재사용할 수 있습니다. 이 원인을 검증하기 전 timeout 연장, hard navigation 전환, 프리페치 차단, 테스트 우회 또는 dependency 패치를 적용하지 않습니다.
