# Finance 빈 본문 복구 기능 — 상태 분리 기록

## 결과

- **MITIGATION_PASS**: 통제된 empty Flight 및 실제 React pending/suspended 정지에서 루트 복구 안내·사용자 확인·수동 reload/홈 이동이 작동했습니다.
- **ROOT_CAUSE_OPEN**: 최초 Finance 간헐 결함의 근본 원인은 확정하지 않았습니다. FIXED로 판정하지 않습니다.
- **RELEASE_READINESS: NOT_RELEASE_READY**: Windows 설치본과 전체 출시 검증은 하지 않았습니다.
- IMPLEMENTED / SOURCE_APPLIED: 아래 제품·회귀 3개 파일을 검증 후 원본에 반영했습니다.
- TEST_PASSED / RUNTIME_VERIFIED: 아래 명시한 격리 Linux 개발·프로덕션 범위입니다.
- DEPLOYED: 아니오. commit/push/배포·전역 설정 변경·운영 DB 접근은 없었습니다.
- USER_GOAL_COMPLETE: 이번 로컬 복구 구현·검증 범위는 충족했습니다. 최초 원인 및 전체 출시 완료는 별도 미완료 상태입니다.

## 변경 파일과 보존

1. src/app/layout.tsx — main/자식 라우팅 경로 밖에 복구 컴포넌트 연결.
2. src/components/PlanningNavigationRecovery.tsx — /planning 빈 본문 감지와 수동 복구.
3. tests/e2e/planning-navigation-recovery.spec.ts — 일반 회귀 7개.
4. 이 작업 기록 및 work/local/finance-navigation-recovery-20261010/의 검증 자료.

기존 DashboardClient.tsx, dashboard-current-state.spec.ts, planning-quickstart-preview.spec.ts는 시작 해시와 동일합니다. 기존 기대값·실패 trace·독립 재현·이전 기록도 보존했습니다. package.json, pnpm-lock.yaml, SiteHeader, Planning page는 변경하지 않았습니다. HEAD는 e296a529f1e3d48c224aee36ca1b9bf65ee0cf44 그대로입니다.

## 설계와 선택

후보 A를 선택했습니다. /planning의 main 안에서 실제 표시된 입력 section, h1, status, alert를 확인합니다. 백업 배너·헤더·자체 복구 안내는 정상 본문 근거로 세지 않습니다. 이 표시들이 모두 없는 상태가 10초 지속될 때 원인을 단정하지 않는 한국어 안내를 띄웁니다. URL 변경 및 본문 복귀 시 감지 상태를 초기화합니다.

사용자가 선택하고 미저장 입력 손실 확인 창에 동의해야 reload 또는 기존 홈 /dashboard로 document 이동합니다. 자동 새로고침·라우팅 루프·저장 쓰기는 없습니다. 정상 상태의 SPA/prefetch 정책은 유지합니다. 복구 제안과 사용자 선택을 식별자·개인 데이터 없는 console 기록으로 남깁니다.

후보 B는 별도 사본의 desktop dashboard→planning 링크에 onNavigate document 이동을 적용해 개발 환경에서 비교했습니다. 실제 클릭으로 Flight 경로를 우회하고 문서/timeOrigin이 바뀌었지만 메모리 상태도 소실됐습니다. 이미 빈 본문에 도달한 경우의 복구를 제공하지 않으므로 제품에는 반영하지 않았습니다. 이 결과를 원래 간헐 오류의 해결 근거로 쓰지 않습니다.

## 수정 전후와 통제 실험

| 실행 | 실제 결과 |
| --- | --- |
| mitigation-red, 수정 전 production | Flight의 workspace element만 empty Fragment로 변경. 본문/loading 부재 확인 후 복구 안내 없음으로 **예상 RED 1개** |
| mitigation-a-first | 복구·지연·모바일·오류 구분 4개 통과, 신규 테스트 설정 오류 3개 발견 |
| mitigation-a-dev | 복구/저장/상태 구분 **8개 통과**, production 전용 인증 1개 skip |
| mitigation-b-dev | 실제 메뉴 document 이동 비교 **1개 통과**, 제품 미반영 |
| mitigation-suspended-red, 복구 없는 dev layout | 실제 pending/suspended root와 null 선택 확인 후 안내 없음으로 **예상 RED 1개** |
| mitigation-suspended-dev | desktop/mobile **2개 통과** |
| mitigation-suspended-prod | desktop/mobile **2개 통과** |
| 최종 실제 제품 production | 기존 핵심 4개 + 복구 회귀 7개 = **11개 통과** |

정지 fixture는 fulfilled full Fragment promise, fulfilled-null prefetch promise, unresolved nested promise와 useDeferredValue를 사용합니다. 기존 Finance 결함과 원인이 같다고 주장하지 않습니다.

개발·프로덕션 두 환경에서 안내 전/표시 중/수동 reload 후 실제 root의 pendingLanes=537919488, suspendedLanes=1048576, pingedLanes=0을 관찰했습니다. 안내는 main 밖에서 렌더되었습니다. 정지가 계속되면 수동 reload 후에도 안내가 다시 나왔고 document 요청은 최초 1회→사용자 동의 후 2회뿐이었습니다. promise를 명시적으로 해제한 뒤에만 본문 commit, pending/suspended=0, 안내 제거를 확인했습니다. 이후 11.5초에도 본문 유지·자동 이동 없음·pageerror 0을 확인했습니다.

일반 회귀는 정상 이동과 미저장 입력 유지, 11.5초 응답 지연, empty Flight, desktop/mobile, 확인 취소, 키보드 동작(정지 fixture), reload, 홈 복귀, URL 변경 시 감지 초기화, 인증 안내, 저장소 오류 안내, 저장 데이터 일치를 검사합니다.

Vault loading/lock은 공식 개발 API로 폐기 저장소에서 설정·잠금·해제하여 검사했습니다. 이 설정은 unlock 후에도 남으므로 일반 CI suite에 통합하지 않았습니다. 별도 fixture로 보존하고 매 실행마다 새 격리 환경을 요구합니다. migration은 목적지 /ops/doctor?state=MIGRATION_REQUIRED가 복구 범위에서 제외됨을 확인했으며, migration 실행 성공을 검증한 것은 아닙니다.

## 저장 데이터 증거

profile(목표 포함), run, saved report, run 목록의 전체 data를 복구 전·빈 화면 중·복구 후·리포트 reload/reopen 후 비교했습니다. 모두 일치했고 복구 과정의 브라우저 Planning 쓰기 요청은 0회였습니다.

- 개발 before/after SHA-256: 8d33a2b964b5d8fb6cdca25de00b51913341d92a1a5f0cca4687471190719ee9
- 프로덕션 before/after SHA-256: 6e363cf5acafaf488935fe5aba60d0ff9391e8a1fb9d93e8ff54055d7270dc60

두 환경은 서로 다른 합성 데이터입니다. 환경 내부의 전후 동등성을 검증한 값입니다.

## 필수 검증

모든 실행은 기존 /tmp/finance-autonomy-20261010-d0bd4l_g의 bwrap 격리 workspace와 폐기 E2E 데이터로 진행했습니다. 원본 HOME/source/운영 DB는 runtime에 마운트하지 않았습니다. Node 22.22.2, pnpm 9.15.9, Next 16.2.12, package React 19.2.3이며 실제 Next renderer는 19.3.0-canary-3f0b9e61-20260317입니다.

- corepack pnpm build: PASS. 최종 BUILD_ID XbryjzKYR8ozutmcDmLfJ. server/static 산출물에 정지 fixture 표식 없음.
- corepack pnpm lint: PASS.
- corepack pnpm typecheck: PASS.
- 기존 8개 unit 파일의 98개 테스트: PASS.
- corepack pnpm planning:ssot:check: guard + catalog 11개 PASS.
- 기존 개발 핵심 E2E 11개: PASS.
- production 기존 핵심 4개 + 신규 복구 7개: PASS.
- workers=1, retries=0으로 실제 실행. 정확한 파일 목록·grep·명령은 evidence/mitigation/run-gates.py와 각 result.json에 보존했습니다.

검토한 최종/관련 trace 35개에서 page exception은 0개였습니다. console error는 개발 복구의 주입 500 1개, 개발 핵심의 의도된 오류·fallback 6개와 MOIS/EXIM ENV_MISSING 2개, production의 주입 500/503 2개였습니다. 정상·정지 fixture에서 새 브라우저 예외는 없었습니다. 외부 provider 설정 누락을 live 검증 PASS로 처리하지 않았습니다.

초기 신규 테스트 실패 원인은 단위 문구가 포함된 입력 label 불일치, API origin 누락, browser context의 상속된 인증 header였습니다. 신규 테스트 설정만 고쳤고 기존 테스트는 변경하지 않았습니다. 정지 fixture의 production build 타입 오류 2회도 보존했습니다. React promise 상태를 판별 union으로 모델링하고 상태 전이를 Object.assign으로 표현한 뒤 typecheck/build를 통과했습니다. 이 과정에서 제품 복구 코드는 변경하지 않았습니다.

## 증거와 재실행

검토용 사본: work/local/finance-navigation-recovery-20261010/

- summary.json: 모든 실행 결과와 세 가지 최종 상태.
- evidence/mitigation/controlled-evidence.json: 실제 lane, 선택 identity, 문서 요청 수.
- evidence/mitigation/saved-data-equality.json: 전후 해시·쓰기 0회.
- evidence/mitigation/source-preservation.json: 원본 반영 및 기존 변경 보존 해시.
- evidence/mitigation/console-audit.json 및 environment-console-evidence.json: 예외·환경 누락 분류.
- evidence/mitigation/README.md 및 fixtures/: 격리 재현 코드와 실행 방법.
- mitigation-*-results/trace.zip·screenshots, 각 log/result.json: 성공·실패 모두 보존.
- manifest.json/evidence-audit.json: 토큰 제거 사본의 파일 해시·trace 형식 검증.

원시 증거는 /tmp/.../evidence에 그대로 남겼습니다. 공유용 사본에서 합성 세션/CSRF 값과 민감 header를 제거했습니다. 175개 파일·45개 trace·22,301개 trace/network JSON 행을 검사했고 알려진 합성 토큰 6개의 잔여 노출은 0건이었습니다. source에 통합한 코드는 주입 hook·React private API·node_modules patch를 포함하지 않습니다.

## 남은 범위

최초 Finance 실패의 root lane/정확한 cache entry와 promise 대응 관계는 기존 기록 수준에서 미확정입니다. 공개 Next.js 이슈와 동일 결함이라는 결론을 내리지 않았습니다.

이번 기능은 루트 shell이 hydration되고 브라우저 이벤트 루프가 실행되는 상태를 전제로 합니다. 최초 문서 응답 자체의 정지, shell hydration 실패, 이벤트 루프 정지는 별도 범위입니다. 실제 원래 간헐 실패 세션에서 이 기능으로 복구한 새 사례는 확보하지 않았습니다.

Windows 설치본, 전체 release gate, 운영/live 외부 데이터, production Vault 설정·migration 실행은 검증하지 않았습니다. 반복 통과 횟수나 mitigation 통과를 근본 원인 해결·출시 준비 완료로 확대하지 않습니다.

## 사용 skill

Superpowers systematic-debugging, test-driven-development, verification-before-completion; planning-gate-selector, route-ssot-check, work-log-closeout을 적용했습니다.
