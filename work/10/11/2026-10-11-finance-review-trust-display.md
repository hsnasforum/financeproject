# Finance 검토본 사용자 신뢰성 개선
기준: work/10/11/2026-10-11-finance-review-candidate.md
확인일: 2026-10-11 KST

## 결과
- IMPLEMENTED / TEST_PASSED / SOURCE_APPLIED: 요청된 진단 설명·공시월 표시를 검증 후 원본에 반영했습니다.
- RUNTIME_VERIFIED: 새 독립 desktop-local 검토본의 Windows Chrome에서 합성 입력·저장·실행·리포트·재열기·재시작 및 예금/적금 목록·상세를 확인했습니다.
- REVIEW_CANDIDATE_WITH_LIMITATIONS. NOT_RELEASE_READY. 연금·braces 차단 및 ROOT_CAUSE_OPEN을 유지합니다.
- 기존 검토본 /home/xpdlqj/finance-review/20261011-current-source(43180)은 교체·종료하지 않았습니다. 사용자 DB·기존 설치본·원천 snapshot·이전 증거를 변경하지 않았습니다. commit/push/배포/전체 release를 수행하지 않았습니다.

## 실제 화면 차이와 표시 정책
### A. 진단
수정 전 동일 합성 run은 workspace에서 최저 현금 0원 때문에 위험, 저장 리포트는 월 잉여금·비상금 커버·DSR 세 지표의 GOOD 판정으로 양호와 정기 점검 안내를 표시했습니다.
서로 다른 평가 범위를 하나의 상태처럼 표현한 것이 표시 결함입니다. 기존 engine·verdict 판정식·threshold·저장 경고는 변경하지 않았습니다.

- 새 공통 표시: 위험 신호 있음 / 기본 지표 판정: 양호 / 가장 빠듯한 달 0원 및 범위 설명.
- 전체 개별 diagnostics를 top-3 제한 전에 읽고 기존 NEGATIVE_CASHFLOW, 반복 CONTRIBUTION_SKIPPED 경고를 보존합니다.
- cash 0/음수는 위험, 양수는 다른 지표와 함께 판단, 없음/NaN은 0으로 바꾸지 않습니다.
- 월 잉여 0/음수, 비상금, DSR 30/50 경계, critical·반복 경고, 목표 미달, 표시 한도 뒤 11번째 목표를 검사했습니다.
- 경고 상세 표는 기존 집계 기준을 유지합니다. 해석용 입력은 DTO의 원래 경고 횟수를 사용합니다.
- 저장 policy 및 engine trace의 기존 legacy fallback을 표시 경로에서 공유합니다. 시작 수입·지출 0/누락 때도 같은 저장 run의 근거가 달라지지 않도록 했습니다.
- workspace 카드·해석 가이드·보고서 기본/상세·보관 관리 도구·standalone HTML/print가 같은 assessment를 표시합니다.
- DSR·최저 현금 누락은 확인되지 않음으로 표시합니다. 원본 숫자·저장 run/markdown을 다시 쓰지 않습니다.
- snapshot 누락/오래됨 경고는 금융 위험 신호와 별도로 보존했습니다.

### B. 금융상품
unified loader와 detail projection에서 빠졌던 raw.dcls_month를 검증된 disclosureMonth로 전달하고 공통 표시를 연결했습니다.
원문 공시월은 유효한 YYYYMM 문자열만 사용합니다. 누락/잘못된 월은 확인되지 않음이며 수집 timestamp로 추정하지 않습니다.
예금·적금 catalog/상세, 대출 목록/옵션 행/drawer에 표시합니다. 기존 MOCK/REPLAY/CACHE·FINLIFE 출처와 API 키 오류를 유지했습니다.

Windows 실제 새 DB 표시:
- 예금 39개: 원문 공시월 2026년 9월 / 수집 2026-10-11 00:11:59 KST.
- 적금 59개: 원문 공시월 2026년 9월 / 수집 2026-10-11 00:11:42 KST.
- 대출 3종: API 키 미포함 CONFIG_MISSING 안내를 확인했습니다. 실제 키를 복사하거나 대출 fallback 기능을 추가하지 않았습니다.
- 대출의 월/시각/REPLAY 표시는 승인된 실제 snapshot의 테스트 전용 response replay로 검증했습니다. live FINLIFE 또는 Windows 대출 데이터 조회 PASS로 확대하지 않습니다.

## 변경 파일
- `src/app/products/catalog/page.tsx`
- `src/components/PlanningReportDetailClient.tsx`
- `src/components/PlanningReportsClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/ProductListPage.tsx`
- `src/components/UnifiedProductDetailClient.tsx`
- `src/components/planning/InterpretationGuide.tsx`
- `src/components/planning/ResultGuideSections.tsx`
- `src/components/planning/reports/SavedReportBrief.tsx`
- `src/components/planning/workspace/panels/resultsPanel.tsx`
- `src/components/products/ProductDetailDrawer.tsx`
- `src/components/products/ProductOptionRowItem.tsx`
- `src/components/products/ProductRowItem.tsx`
- `src/lib/finlife/types.ts`
- `src/lib/planning/reports/reportViewModel.ts`
- `src/lib/planning/reports/standaloneHtmlReport.ts`
- `src/lib/planning/reports/standaloneReportArtifacts.ts`
- `src/lib/planning/ui/workspaceResultInsights.ts`
- `src/lib/planning/v2/insights/interpretationVm.ts`
- `src/lib/products/catalogExplorer.ts`
- `src/lib/sources/unified.ts`
- `src/lib/sources/unifiedLoaders.ts`
- `src/lib/sources/unifiedTypes.ts`
- `tests/planning/reports/stableReportScenarios.test.tsx`
- `src/lib/planning/v2/insights/diagnosisAssessment.ts`
- `src/components/planning/DiagnosisSummary.tsx`
- `src/lib/finlife/disclosure.ts`
- `src/components/products/ProductDisclosureMeta.tsx`
- `tests/planning/v2/insights/diagnosisAssessment.test.ts`
- `tests/planning/reports/diagnosis-consistency.test.tsx`
- `tests/product-disclosure-projection.test.ts`
- `tests/product-disclosure-presentation.test.tsx`
- `tests/e2e/diagnosis-trust-consistency.spec.ts`
- `tests/e2e/product-disclosure.spec.ts`

34개 코드·테스트 파일만 원본에 반영했습니다. 기존 3,283개 파일의 기준선 대비 반영 전 drift 0, 관계없는 변경 0, snapshot 9개 해시 동일입니다.
정확한 이전/검증/반영 해시는 evidence/source-promotion.json, 이번 delta만의 patch는 review-trust-only.patch입니다.
stableReportScenarios의 기존 숫자·verdict 검사는 유지하고 화면 headline 기대값만 새 assessment 및 범위 label로 바꿨습니다.

## 사용 skill
Superpowers using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, brainstorming;
planning-gate-selector, dart-data-source-hardening, Playwright, work-log-closeout.
안전한 로컬 반복과 반영은 현재 사용자가 지정한 범위 안에서 수행했습니다.

## 실제 검증
격리 사본: /tmp/finance-review-trust-20261011-p4ujjwb1/workspace
실행기: python3 /tmp/finance-review-trust-20261011-p4ujjwb1/run.py LABEL COMMAND...
bwrap unshare-all, 네트워크 차단, 별도 HOME·DB·Planning root. 원본 source/HOME/DB 미마운트.
검토 패키지 설치/공개자료 입력 시 새 검토본 경로만 /review로 추가 mount했습니다.

| 검사 | 결과 |
| --- | --- |
| diagnosis-assessment RED | 22 기대 실패 |
| diagnosis-view RED | 4 기대 실패(화면/누락 cash/저장 policy/경고 횟수) |
| hidden goal RED | 1 실패/22 통과 |
| missing DSR card RED | 1 실패/4 통과 |
| saved-input helper RED | 신규 helper 미구현 2 실패/5 통과 |
| 진단 최종 단위·회귀 | 18파일 111 통과 |
| 공시월 RED | 25 기대 실패/3 통과 |
| 공시월 새 단위 | 28 통과 |
| 상품 인접 회귀 | 9파일 92 통과 |
| 전체 lint | 오류 0, 13경고 중 이번 미사용 변수1개 수정 |
| 최종 변경 파일 lint | 오류0, 기존 navigation 경고2개 |
| 최종 typecheck | exit0 |
| production build | exit0, 기존 Next Edge API 경고 기록 |
| 공식 desktop build/install | pristine 검증·새 SQLite 설치 통과, shortcuts 생략 |
| production 주요 E2E | 14 통과, workers1/retries0 |
| 별도 unmocked keyless production E2E | 1 통과, 3대출 실제 HTTP400/CONFIG_MISSING |
| 원본 git diff --check | 통과 |

진단 회귀 명령:
```text
corepack pnpm exec vitest run tests/planning/v2/insights tests/planning/reports tests/planning/ui/workspaceResultInsights.test.ts tests/planning-v2/reportViewModel.test.ts tests/planning/report-canonical-contract.test.ts --maxWorkers=1
```
production 주요 E2E:
```text
node /evidence/production-e2e.mjs tests/e2e/diagnosis-trust-consistency.spec.ts tests/e2e/product-disclosure.spec.ts tests/e2e/planning-release-persistence.spec.ts tests/e2e/planning-quickstart-preview.spec.ts --workers=1 --retries=0 --grep-invert keyless
```
keyless는 공식 기본 wrapper가 FINLIFE_REPLAY=1을 넣으므로 분리했습니다. 별도 격리 공식 desktop launcher, 키/REPLAY 없음, 공식 E2E bootstrap·DB·data root 계약으로 /evidence/keyless-e2e.mjs를 실행했습니다. 테스트 skip이나 기대값 완화는 없습니다.

추가 실행 경계:
- 최초 진단 E2E는 innerText의 레이아웃 공백 차이로 실패했습니다. 의미 있는 모든 문구·상태 검사를 유지하고 공백만 정규화했습니다. 실패 trace는 e2e-first-failure에 보존했습니다.
- 초기 typecheck의 warning severity string 타입을 기존 info/warn/critical 정규화 계약으로 수정한 뒤 통과했습니다.
- keyless 준비 첫 두 실행은 신설 DB/desktop 환경의 IDENTITY_EMPTY로 서버 시작 전에 실패했습니다. 원본 DB를 사용하거나 readiness gate를 끄지 않고 신규 격리 DB 초기화와 공식 E2E bootstrap 경로를 적용한 뒤 1개 실제 검사가 통과했습니다.
- 15 E2E에는 동일 run의 작업 화면→보관 도구→저장 상세→새 탭→새로고침→print 일치, mobile390px overflow, 상품 drawer focus/Escape, 복구 안내 중 저장/취소/재열기, 암호화 backup restore 동등성, 기존 quickstart 세 시나리오가 포함됩니다.
- mock/replay로 검증한 표시와 무모킹 keyless·새 DB Windows 검증을 구분합니다. 전체 release, 전체 단위 suite, 실제 외부 갱신, Windows native 설치·인쇄대화상자·복구확인창은 이번 범위에서 실행하지 않았습니다.

## 새 검토본
/home/xpdlqj/finance-review/20261011-trust-display
별도 HOME/home, XDG_DATA_HOME/data, installed/prisma/dev.db, 포트43182, 복사한 Linux Node22.22.2.
Next16.3.8 / React19.2.3 / pnpm9.15.9, build ID XHAx4LVoeUWUBfxsCSt_C.
artifact sha256 af8967932e739fb3ffee7b8d1298023d317424579555b987d7694b2ec23f1e39, 41,134파일.
package 및 installed는 현재 수정 소스로 새로 만들었습니다. 설치 이후 UI source 패치를 하지 않았습니다.

PowerShell:
```powershell
wsl -d Ubuntu -- bash /home/xpdlqj/finance-review/20261011-trust-display/start-review.sh
```
종료는 같은 경로 stop-review.sh입니다. 실행 명령은 공식 one-shot bootstrap으로 Chrome을 열며 기존 앱의 포트·경로를 사용하지 않습니다.
README.md에 체험 프로필·리포트 링크·제한을 기록했습니다.

## 데이터·실제 화면 증거
- 공개 상품만 새 SQLite에 canonical persistence와 maintenance writer로 오프라인 입력: 217상품/663옵션, FK 오류0. 새 live sync 완료 receipt를 만들지 않았습니다.
- 예금39/158, 적금59/178, 신용44/139, 주담대34/108, 전세41/80(상품/옵션). 원문파일은 hash 동일입니다.
- Windows 실제 UI로 별도 합성 프로필·목표·실행·보관 리포트를 만들었습니다.
- Windows 재시작 전후 합성 사용자 저장 파일15개 hash가 동일하고 UI에서 목표·같은 진단을 다시 확인했습니다.
- 정상 Windows 경로 수집 console warn/error0, 재시작 탭0. 키 누락의 의도된 HTTP400은 오류 화면 검증과 구별합니다. 모든 브라우저 예외를 별도 Windows 계측했다는 뜻은 아닙니다.
- Linux 진단 E2E는 pageerror0을 명시 검사합니다.
- durable evidence/ 및 work/local/finance-review-trust-display-20261011/에 실제 화면·로그·결과·patch·hash를 보존했습니다.

## 남은 제한
연금 공식 원천/최신성·braces 보안 차단, API 키 없는 대출 및 연금 실제 조회, 가정 snapshot 없음, ROOT_CAUSE_OPEN은 유지합니다.
이번 두 표시 문제의 개선을 기존 간헐 빈 화면 근본 원인 FIXED나 RELEASE_READY로 표현하지 않습니다.
