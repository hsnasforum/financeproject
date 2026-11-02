# Finance 실제 사용 검토본 준비
기준: 2026-10-11-finlife-loan-schema-contract.md
확인 시각: 2026-10-11 05:20 이후 KST. 날짜는 호스트 UTC 시각으로 확인했습니다.

## 결과
- **REVIEW_CANDIDATE_WITH_LIMITATIONS**: 별도 desktop-local 패키지를 생성·설치하고 공식 WSL → Windows Chrome 경로로 실제 체험했습니다.
- **NOT_RELEASE_READY**: 연금·braces 차단 유지. release 게이트를 우회하거나 전체 release를 반복 실행하지 않았습니다.
- **IMPLEMENTED / TEST_PASSED / SOURCE_APPLIED**: 관측된 이름 보존 및 데이터 상태 표시 오류를 수정하고 원본에 5개 파일만 반영했습니다.
- **RUNTIME_VERIFIED_PARTIAL**: Windows 핵심 저장 흐름과 재시작은 확인했습니다. 대출 live 조회와 Windows 복구 확인창 완료 등은 아래 제한대로 미검증입니다.
- **DEPLOYED: 아니오**. 기존 설치본·사용자 DB·백업의 이전/교체/변경, native Windows 설치, commit/push를 하지 않았습니다.
- **ROOT_CAUSE_OPEN**: 최초 Next.js 간헐 빈 화면의 근본 원인 해결을 선언하지 않습니다.

## 실행 방법
현재 검토본은 포트 43180에서 실행 중이며 저장 리포트를 Windows Chrome에 열어 두었습니다.
종료 후 다시 실행할 때 Windows PowerShell에서:

```powershell
wsl -d Ubuntu -- bash /home/xpdlqj/finance-review/20261011-current-source/start-review.sh
```

종료:
```powershell
wsl -d Ubuntu -- bash /home/xpdlqj/finance-review/20261011-current-source/stop-review.sh
```

상세 사용 안내: /home/xpdlqj/finance-review/20261011-current-source/README.md
검토본은 기존 설치본과 다른 HOME, 데이터 루트, SQLite, 포트를 사용합니다.
- package/: 최종 패키지, installed/: 공식 설치 절차로 만든 검토 전용 설치 사본
- data/PlanningV2/vault/: 새 Planning 데이터, installed/prisma/dev.db: 새 SQLite
- runtime/node/: 복사한 Linux Node 22.22.2. 임시 디렉터리를 참조하지 않습니다.
- synthetic profile: 검토본 체험 프로필, 월 수입 480만 원/필수지출 230만 원/검토용 비상금 1,000만 원·12개월

## 변경 파일과 근거
1. src/components/ProductListPage.tsx
   - 설정 오류/로딩 중에도 고정으로 나오던 '최신 금융상품' 문구를 중립적인 수집 정보·공시 재확인 안내로 수정했습니다.
   - fallbackUsed만으로 실제 저장 원천 REPLAY/CACHE를 MOCK으로 표시하던 조건을 수정했습니다. 명시적인 mock 모드/출처 표시는 유지합니다.
2. tests/product-list-provenance-copy.test.tsx (신규)
   - 실제 컴포넌트 SSR에서 오류/로딩, REPLAY/CACHE, 명시적 mock 계약 6개를 검증합니다.
3. src/lib/planning/v2/profileNormalize.ts
   - 비상/emergency 부분 문자열이 포함되면 사용자 목표 이름을 Emergency Fund로 덮어쓰던 정규화를 기존 정확한 별칭에만 적용합니다.
4. tests/planning/v2/profileNormalize.test.ts
   - 사용자 이름 보존과 기존 별칭 호환 사례를 추가했습니다.
5. tests/planning/ui/planningQuickStart.test.ts
   - 미리보기 → 적용 → 저장 → 시뮬레이션 → DTO에서 사용자 이름과 계산 결과를 함께 검증합니다.

기존 성공 기대값을 삭제·완화하지 않았습니다. package/lockfile/Prisma/원천 스냅샷은 이번 작업에서 변경하지 않았습니다.
위 5개 파일 외의 기존 원본 3,282개 파일 기준선 drift는 반영 전 0, 반영 후 관계없는 변경 0이었습니다.
source-promotion.json에 원본 이전 해시·검증 사본·반영 후 해시가 있습니다.
Git HEAD는 e296a529f1e3d48c224aee36ca1b9bf65ee0cf44이며 기존 미커밋 변경을 포함합니다. SHA만으로 패키지 내용을 식별하지 않았습니다.
최종 build ID: ZpXeDJF0USaFx-S8J_gAy
패키지 artifact checksum: 5b9a4d1a6d36c809f9c9fa4dff4269d10c58e1e655b01497c5a2504fdf91ee8d (41,103 files)
Next 16.3.8 / React 19.2.3 / pnpm 9.15.9 / Node 22.22.2.

## 사용 skill
Superpowers using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, writing-plans;
Playwright; planning-gate-selector; dart-data-source-hardening; work-log-closeout.
기존 승인된 안전한 로컬 작업 범위에서 구현·재검증을 수행했으며 별도 Git 게시 권한을 추정하지 않았습니다.

## 실행한 검증
주 검증 사본: /tmp/finance-review-current-20261011-3r7g3hmz/workspace
실행기: python3 /tmp/finance-review-current-20261011-3r7g3hmz/run.py <label> <command>
bwrap unshare-all, 네트워크 차단, 원본 HOME/source/DB 미마운트, 새 /state/database/finance.db 및 /state/planning.
독립 Windows 검토 런타임은 위 durable 경로에서 실행합니다.

| 검사 | 실제 결과 |
| --- | --- |
| product-list provenance RED | 수정 전 4 실패/2 통과 |
| profile/quickstart RED | 수정 전 4 실패/15 통과 |
| product-list provenance + freshness + fallback | 9 통과 |
| profileNormalize + planningQuickStart | 19 통과 |
| form/legacy debt/storage/onboarding/workspaceQuickStart/resultDto 회귀 | 82 통과 |
| corepack pnpm lint | 오류 0, 기존 경고 12 |
| corepack pnpm typecheck | 통과 |
| corepack pnpm build | production build 통과 |
| planning:v2:desktop:build -- --no-next-build --artifact-dir=.dist/review-candidate | 공식 패키지 생성 통과 |
| 공식 install.sh, 새 검토 사본 설치 및 갱신 | pristine 검사 통과, 실제 기존 사용자 설치와 별도 |
| production E2E 아래 5개 파일, workers=1/retries=0 | 27 통과 |
| git diff --check | 통과 |

단위·통합 명령은 corepack pnpm exec vitest run <파일들> --maxWorkers=1이며 Planning은 --pool=forks를 사용했습니다.
정확한 각 명령/종료코드/소요시간은 evidence/*.result.json에 기록했습니다.
첫 quickstart RED 호출에서 Vitest 4가 지원하지 않는 --minWorkers 옵션으로 실행 자체가 실패했으므로 이를 RED 증거로 세지 않았습니다. 옵션을 고친 실제 실패와 로그를 함께 보존했습니다.

production E2E:
```text
node /evidence/production-e2e.mjs
  tests/e2e/planning-navigation-recovery.spec.ts
  tests/e2e/planning-release-persistence.spec.ts
  tests/e2e/planning-quickstart-preview.spec.ts
  tests/e2e/products-list-query.spec.ts
  tests/e2e/fx-freshness.spec.ts
  --workers=1 --retries=0
```
래퍼는 production과 테스트 전용 인증을 설정하고 기존 Playwright 실행 경계/공식 런처를 사용합니다.
저장·재열기·암호화 백업 복원 데이터 동등성, 제목만 남은 정지·CSS 숨김·정상 지연·확인 취소/수락·저장 상태 변경을 포함합니다.
fault E2E 중 서버의 destination stream closed early 로그가 남아 있으며 숨기지 않았습니다. 이 로그가 없는 정상 Windows 브라우저 기록과 구별합니다.
전체 release/전체 단위 suite/네이티브 Windows 설치 검증을 이번에 수행했다고 주장하지 않습니다.

## 실제 Windows 화면
공식 desktop launcher가 one-shot bootstrap을 통해 Windows 기본 브라우저 Chrome을 열었고 실제 인증 후 UI를 조작했습니다. 쿠키 주입으로 인증을 우회하지 않았습니다.

| 흐름 | 관측 |
| --- | --- |
| 인증·대시보드 → 재무진단 | 정상 화면 확인 |
| 간단 시작 → 미리보기 → 적용 → 저장 | 수정 전 목표 이름 소실 재현, 수정 후 검토용 비상금 보존 |
| 실행·기록 저장 → 리포트 → 별도 보관 리포트 | 정상, 사용자 목표 이름 표시 |
| 앱 종료·공식 재시작 → 프로필·리포트 재열기 | 저장 자료 유지 |
| 예금·적금 목록/상세 | 각각 39/59개, 원천 수집 시각 표시 |
| 신용/주담대/전세/연금 | API 키 미포함으로 CONFIG 오류, 빈 성공 처리하지 않음 |
| 환율 계산 | 예시 데이터/기준 시점 오래됨/출처 기준일 2026-02-17/실제 환전 전 확인 안내 |
| 정상 흐름 console warn/error | 수집된 두 최종 탭 로그 0건; 전체 브라우저 예외 계측 완료를 뜻하지 않음 |

재무진단 새 데이터 루트에는 가정 스냅샷이 없어 기본 가정 사용/기준일 미확인 안내가 실제 표시됩니다.
화면 결과를 최신 금융 조건에 근거한 판단으로 해석해서는 안 됩니다.

## 데이터 보존
- 새 검토 DB에 검증된 공개 스냅샷만 canonical persistence와 maintenance writer 경계로 오프라인 입력했습니다.
- 5개 상품군 합계 217상품/663옵션, foreign_key_check 0.
- 예금 39/158, 적금 59/178, 신용대출 44/139, 주택담보 34/108, 전세 41/80 (상품/옵션).
- 파일 원문·옵션·공시월·generatedAt은 변경하지 않았습니다. 5개 상품군 원문 공시월은 202609입니다.
- 원본 연금 343개와 EXIM/Gov24 스냅샷도 그대로입니다.
- 예금 수집 시각 2026-10-11 00:11:59 KST, 적금 00:11:42 KST. 대출 수집은 00:26:28~29 KST입니다.
- 초기 검토 준비 helper가 snapshot.meta.generatedAt 대신 상위 generatedAt을 읽은 오류 및 오프라인 입력을 동기화 완료로 기록한 5개 신규 receipt를 바로잡았습니다. 이 검토 DB의 그 receipt만 제거했고 상품/옵션은 그대로 유지했습니다. 최신성 근거는 원본 snapshot meta입니다. live refresh를 수행한 것으로 표시하지 않습니다.
- 검토본 갱신 전후 19개 파일 해시 일치, 최종 재시작·재열기 전후 핵심 저장 23개 파일 해시 일치.
- 기존 사용자 DB나 이전에 오염된 검증 DB를 재사용하지 않았습니다.
증거: public-products-final.json, offline-import-correction.json, installer-data-preservation.json, restart-data-preservation.json.

## 복구 검증 구분
별도 fault 사본 /tmp/finance-review-recovery-20261011-5c06qfei의 planning page에 인증 이후 최초 제목만 표시하도록 주입했습니다.
실제 최초 간헐 오류와 같은 원인이라고 주장하지 않습니다. root/layout/loading/복구 컴포넌트는 후보와 해시가 같으며 fault 코드가 최종 패키지에 없습니다.
Windows에서 본문 부재 → 상위 복구 안내 → 저장하지 않은 입력 경고 → 실제 confirm 표시까지 확인했습니다.
브라우저 도구의 input/focus timeout으로 documented dialog.dismiss 및 tab.close가 완료되지 않았습니다.
**Windows 취소·확인 후 정상 복귀는 TOOL_BLOCKED/NOT_VERIFIED**입니다. confirm을 mock 처리하거나 우회하지 않았습니다.
정지 주입 서버는 종료했습니다. 43181 테스트 확인창이 남아 있으면 사용자가 취소 후 해당 탭을 닫을 수 있습니다.
Linux production E2E 10개 복구 검사는 통과했으며 Windows 완료 증거를 대신하지 않습니다.

## 발견됐으나 남긴 제한과 결함
1. 같은 run의 workspace '위험'과 report '양호' 불일치.
   - workspaceResultInsights.ts는 worstCashKrw <= 0을 risk로 분류합니다.
   - interpretationVm.ts는 여유현금/비상금개월/DSR로 종합 GOOD을 결정하며 최저현금 위험 진단은 별도로 생성합니다.
   - 최저현금 0/GOOD 교차 계약을 확인하지 못했습니다. 금융 판정 정책을 임의로 재정의하지 않았습니다.
2. 금융상품 UI는 수집 시각을 보여주지만 실제 공시월 202609는 표시하지 않습니다. '원천 공시월을 화면에서 확인'은 미충족입니다.
3. productsHttp의 저장 snapshot 조회는 예금/적금에 한정됩니다. API 키 없는 검토본의 대출 화면은 승인된 데이터가 있어도 조회되지 않습니다. 키를 복사하거나 새 조회 기능을 추가하지 않았습니다.
4. 연금 upstream/최신성 차단 및 braces 보안 차단 유지. EXIM_CONTRACT_PASS를 이 검토본의 live FX 조회 PASS로 확대하지 않습니다.
5. Windows native 복구 확인창 조작과 실제 복구 완료 미검증.
6. 최초 간헐 빈 화면 ROOT_CAUSE_OPEN. 이번 정상 사용 관측에서 재발하지 않았다는 사실만으로 FIXED 처리하지 않습니다.

## 증거 위치
- durable: /home/xpdlqj/finance-review/20261011-current-source/evidence
- 저장소 로컬 사본: work/local/finance-review-candidate-20261011/
- candidate-final-report.jpg, candidate-restart-profile-dom.txt, candidate-fx-dom.txt, candidate-pension.jpg
- windows-recovery-before.jpg, windows-recovery-dialog-result.json
- review-only-changes.patch, source-promotion.json, candidate-*.result.json 및 실제 로그

핵심 재무진단 저장 흐름을 직접 평가할 검토본은 준비됐지만 금융 데이터 전 범위와 Windows 복구까지 완전 검증된 출시본은 아닙니다.
