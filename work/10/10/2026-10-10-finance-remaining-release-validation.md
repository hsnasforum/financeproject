# Finance 남은 출시 차단 및 Windows 후보 검증 — 2026-10-10

> 최신 후속 결과: 10월 11일 점검 종료 후 FINLIFE 인증이 복구되어 예금·적금만 검증 후 갱신했습니다. 나머지 4종은 무결성 문제로 보존했으며 출시 FAIL은 유지합니다. 아래 단발 후속 확인 절을 참조하세요.

## 판정

기준은 `2026-10-10-finance-security-quality-stabilization.md`이다. **RELEASE_GATES_FAIL을 유지한다.** 이번 작업에서 제품 소스·의존성·스냅샷을 추가 변경하지 않았다. 안전한 대체 후보는 동등성 검사에서 탈락했고, 독립 검토 패키지의 Windows Chrome 일반 사용 흐름을 추가 확인했다.

| 항목 | 실제 결과 |
| --- | --- |
| SECURITY | **BLOCKED**. braces High 1건 유지. 두 대체 후보가 실제 Next lint 진단을 누락하여 채택하지 않음 |
| DATA_FRESHNESS | **BLOCKED**. FINLIFE 6개와 EXIM 1개를 갱신하지 않음. 날짜·예외 불변 |
| WINDOWS_RUNTIME | **PARTIAL / RECOVERY_TOOL_BLOCKED**. 공식 WSL 런처 자동 열기, 인증, 입력·저장·리포트·앱 재시작 PASS. 복구 확인창 승인/취소 완료는 검증 불가 |
| DATA_SAFETY | 별도 합성 데이터의 저장 파일 12개가 재시작 전후 바이트 동일. 기존 설치본·사용자 DB·백업을 변경하지 않음 |
| MITIGATION | 기존 프로덕션 회귀 PASS 유지. 이번 Windows 정지 화면의 안내 표시까지 확인. 확인창 이후 복귀는 새 PASS로 세지 않음 |
| ROOT_CAUSE | **OPEN**. Next 16.3.8에서 관찰한 정상 SPA 진입 2회에 빈 본문 없음. 원인 해결 증거가 아님 |

`RELEASE_READY`, `FIXED`, `USER_GOAL_COMPLETE`, 배포 완료를 선언하지 않는다. 네이티브 Windows 설치·업데이트·바로가기 검사는 수행하지 않았다.

## 변경 파일·보존

- 새 기록: 이 문서.
- 새 재현 코드·결과: `work/local/finance-remaining-release-20261010/`의 최종 glob/Next lint 비교, build provenance, Windows 관찰 결과, 데이터 전후 해시, 개별 명령 결과.
- 제품 변경: **없음**. 기존 미커밋 파일 및 복구 구현을 보존했다. 기준선 28파일의 원본/후보 SHA가 종료 시점까지 동일했다. package/lock/Next 설정/Playwright 설정/복구·layout 등 이전 최종 build provenance 8파일도 동일하다.
- 공식 일반 후보 build ID `sjw-O_F1i7CVlfmmpS2oC`, Next 16.3.8 / React 19.2.3. 이전 최종 검증 build와 같다.
- 원본 HEAD `e296a529f1e3d48c224aee36ca1b9bf65ee0cf44`, Linux Node 22.22.2 / Corepack pnpm 9.15.9. 원본 node_modules는 기존 설치 상태를 유지했다.

사용 skill: Superpowers using-superpowers, systematic-debugging, test-driven-development, verification-before-completion; Finance planning-gate-selector, dart-data-source-hardening, work-log-closeout. Playwright skill의 실제 브라우저 검증 지침도 읽었으며 Windows 조작은 제공된 CUA 브라우저 API로 수행했다. 제품 패치를 하지 않았으므로 이번 작업의 실패 비교 실험을 제품 수정의 RED→GREEN으로 표현하지 않는다.

## braces 대체 실험

남은 GHSA는 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), `braces <=3.0.3`, 공식 수정 버전 없음이다. 체인은 eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces이다. `settings.next.rootDir`의 문자열 glob → getRootDirs → `@next/next/no-html-link-for-pages`가 실제 소비 경로다. Finance는 custom rootDir를 지정하지 않지만, 이를 감사 예외의 근거로 사용하지 않았다.

[Next 16.3.8 get-root-dirs 원문](https://raw.githubusercontent.com/vercel/next.js/v16.3.8/packages/eslint-plugin-next/src/utils/get-root-dirs.ts)과 [tinyglobby migration 문서](https://superchupu.dev/tinyglobby/migration)를 대조했다. 후보 1은 이미 설치된 tinyglobby 0.2.16, 후보 2는 안전 버전 brace-expansion 5.0.12로 먼저 전개한 뒤 tinyglobby를 호출했다. expandDirectories, cwd, absolute, trailing slash 차이를 보정한 **최종 실험**을 판정 기준으로 삼았다.

- 정상 경로, star, nested brace, extglob, negative, absolute 등 포함 18가지 비교.
- 후보 1: 7가지 불일치 — numeric, padded, step, reverse step, directory symlink, escaped braces, 1000 초과 range.
- 후보 2: 3가지 불일치 — directory symlink, escaped braces, 1000 초과 range.
- 실제 Next rule을 각 후보와 연결한 독립 프로세스 검사: 일반 경로 진단은 같지만 후보 1의 숫자 range 및 두 후보의 symlink에서 기존 오류 진단이 사라졌다. 과도한 range에서 기존 RangeError 거부도 동등하게 유지되지 않았다.

실험용 CJS module hook은 해당 테스트 프로세스에서 Next plugin의 fast-glob import만 치환했다. 제품 node_modules, package.json, lockfile, eslint 설정을 패치하지 않았다. 동등성 실패를 먼저 확인했으므로 대체를 설치하거나 전체 lint/type/build를 반복하지 않았다. **대체 환경의 전체 동등성 PASS는 주장하지 않는다.** 모든 가능한 대안이 불가능하다는 결론도 아니다. 이번 두 최소 대안은 안전하게 채택할 증거가 부족하다.

초기 실험의 brace-expansion named export 및 tinyglobby import 시점 cwd 차이를 수정했다. 초기 exit 0 결과는 동등성 PASS로 세지 않으며 원본 실패 파일을 삭제하지 않았다. 최종 `glob-comparison-final`과 `next-lint-equivalence-final`은 차이가 있으면 명시적으로 exit 1이다.

## FINLIFE·EXIM

**2026-10-10 19:34 KST 관측 시점은 FINLIFE 공식 점검 종료 24:00보다 이르다.** [공식 중단 공지](https://finlife.fss.or.kr/error_kor.html)의 종료 예정 시각을 실제 복구로 간주하지 않았다. 이번 작업에서 점검 중 API를 반복 조회하지 않았다. 기존 키의 유효성 및 6개 JSON의 최신 공시일·건수·필드는 아직 확인되지 않았다.

사용자의 점검 종료 후 확인 요청에 따라 **2026-10-11 00:10 KST 1회만** 현재 대화에 후속 확인을 예약했다. automation ID는 `finance-finlife`, heartbeat ACTIVE, count 1이다. 단일 대표 공식 응답이 계속 HTML이면 중단하고, 정상 인증 JSON일 때에만 기존 격리 runner로 6개 공식 sync와 원천 날짜·건수·필드를 검증하도록 했다. 유효한 실제 갱신만 반영하고, 비밀값 출력·날짜 조작·사용자 DB/설치본 변경을 금지했다. 예약은 API 복구나 갱신의 증거가 아니다. 실행 전 최신 source drift와 이 기록을 읽어야 한다.

EXIM [공식 공공데이터포털](https://www.data.go.kr/data/3068846/openapi.do)에서는 2025-06-25 `www.koreaexim.go.kr` → `oapi.koreaexim.go.kr` 변경 및 구 endpoint 2026-04-30 폐쇄 예정 메타데이터를 확인했다. 그러나 [은행 상세 API 명세](https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2&viewtype=C)는 웹 timeout/502와 WSL TLS peer reset으로 읽지 못했다.

AP01의 정확한 응답 필드, searchdate와 실제 원천 날짜의 관계, 정상 영업일/응답 시각 계약을 확인하지 못했다. 날짜 없는 정상 응답일 수 있다는 가설만으로 provider의 날짜 검사를 제거하지 않았다. 서로 다른 두 읽기 경로가 실패한 뒤 API 재시도 없이 중단했다. 기존 7개 stale 자료와 만료 예외를 그대로 유지했다. 금리·한도·상품 조건 및 환율의 현재 정확성은 출시 차단 상태다.

## Windows 독립 후보의 실제 실행

위치: `/home/xpdlqj/finance-review/20261010-security-candidate/`.

일반 후보와 오류 주입 후보는 각각 별도 설치 디렉터리/HOME/XDG data/SQLite/포트를 사용했다. 기존 검토 설치본과 사용자 DB는 사용하지 않았다. **Windows Chrome은 기존 브라우저 integration/profile을 이용했으며 Chrome profile까지 격리한 것은 아니다.** 네이티브 Windows 설치·바로가기·권한·전역 설정을 변경하지 않았다.

공식 `planning:v2:desktop:build -- --no-next-build` 패키지 생성 후 공식 `install.sh`를 신규 경로에 실행했다. 설치 시 의존성 재설치·바로가기는 생략했고 manifest 검증 및 별도 SQLite 초기화는 실제 수행했다. 일반 후보 41,347파일, 주입 후보 41,088파일 검증 완료. `planning_v2_desktop_verify.mjs --mode=runtime` 후 공식 desktop launcher가 WSL→Windows opener를 호출했고 실제 Chrome 탭이 자동으로 열렸다.

일반 후보 포트 43178에서 수행한 동작:

1. 인증된 Dashboard → SPA 재무진단.
2. 합성 월 소득 5,100,000원, 지출 2,100,000원, 목표 25,000,000원/12개월 입력 → 미리보기 → draft 반영 → 저장.
3. 플래닝 실행·기록 저장 → 리포트 → 저장된 리포트로 보관 → 상세 표시.
4. 소유한 launcher만 종료하고 해당 검증 탭을 닫은 뒤 공식 launcher 재실행. 새 탭의 인증된 Dashboard와 재무진단 입력값, 보관 리포트 확인.
5. profiles/runs/reports 관련 12파일 SHA와 bytes가 전후 동일. 관측한 일반 흐름 console error 0개.

CUA 복합 selector 1회 deadline은 새 accessibility state와 정확한 textbox-role 조회로 해결했다. 해당 시점에는 본문이 정상 표시돼 있었고 이를 제품 빈 본문 재현으로 분류하지 않았다.

## 통제된 정지 및 확인창 차단

`/tmp/finance-autonomy-20261010-d0bd4l_g/fault-workspace-remaining`만 수정했다. 실제 인증 성공 후, 유일한 `recoveryProbe` query의 첫 요청에서 `h1`만 반환하며 같은 URL의 다음 요청은 정상 page를 반환하는 테스트 전용 주입이다. 전체 patch는 증거 폴더의 `TEST_ONLY-fault-page.patch`에 있다. 원본과 일반 후보의 page는 불변이고 recovery component 및 root layout SHA도 그대로다. 이 주입을 최초 React/Next 간헐 결함과 같은 원인이라고 주장하지 않는다.

주입 build `RueabRMUUK1I4HSired2J`를 별도 `fault-probe/installed`, 포트 43179에서 실행했다. 실제 Chrome에서 제목만 있는 본문 → 지연 후 한국어 복구 안내 및 미저장 입력 경고를 확인했다. Enter로 복구 버튼을 실행해 native confirm이 열린 사실도 확인했다.

하지만 제공된 `getJsDialog().dismiss()` 및 새 탭의 `getJsDialog().accept()`가 모두 `CDP Emulation.setFocusEmulationEnabled` timeout으로 막혔다. 일반 키 동작과 비동기 키 동작, 별도 새 탭의 두 조건에서 같은 도구 실패였다. 취소 이후 본문 유지, 승인 이후 reload 완료, 홈 복귀는 **NOT_VERIFIED**다. 단순히 confirm 객체가 사라진 것을 성공으로 세지 않았다. 재검증을 위해 confirm을 가짜 함수로 교체하거나 제품 경고를 제거하지 않았다.

해당 탭의 close도 같은 도구 오류로 실패했다. **오류 주입 검증 탭 2개가 브라우저에 남아 있을 수 있다.** 다른 Chrome 프로세스를 종료하거나 브라우저 전역 설정을 변경하지 않았다. 소유한 검증 launcher만 cwd/PID를 확인해 종료했으며 43178/43179 모두 연결 불가임을 확인했다. 일반 후보 데이터와 로그는 보존했다.

## 실행한 검사와 기존 결과 재사용

| 실제 명령/검사 | 결과 |
| --- | --- |
| bwrap `corepack pnpm exec node /evidence/release-remaining/glob-comparison-final.cjs` | exit 1, 두 대체의 glob 동등성 실패 증거 |
| bwrap `corepack pnpm exec node /evidence/release-remaining/next-lint-equivalence-final.cjs` | exit 1, 실제 Next 오류 진단 누락 |
| 일반 후보 `corepack pnpm planning:v2:desktop:build -- --no-next-build --artifact-dir=.dist/planning-v2-security-candidate` | exit 0 |
| TEST ONLY 사본 `corepack pnpm build` | exit 0, 168.15초 |
| TEST ONLY `corepack pnpm planning:v2:desktop:build -- --no-next-build --artifact-dir=.dist/planning-v2-fault-candidate` | exit 0 |
| 두 신규 경로의 공식 `bash install.sh`, `planning_v2_desktop_verify.mjs --mode=runtime`, 공식 launcher | 설치/시작 성공; 실제 Windows 자동 탭 확인 |
| 일반 Windows Chrome 저장·리포트·재시작 | 확인 완료, 저장 파일 12개 바이트 동일 |
| Windows 복구 안내·키보드 confirm 열기 | 확인 완료 |
| Windows confirm 취소/승인·정상 복귀 | TOOL_BLOCKED, 완료 검사 미실행 |
| 원본/후보 보존 및 이전 build provenance | 기준선 28파일 drift 0; build provenance 8파일 동일; 정상 build ID 동일 |

이전 전체 단위 4,221 PASS/4 SKIP, 이후 영향 범위 66/6 PASS, 최종 lint/typecheck/build, production contracts 14 및 core 24 PASS는 **이전 기록의 범위 그대로** 재사용한다. 마지막 전체 unit 이후 delta의 한계도 이전 기록대로 유지한다. 이번에 전체 테스트를 다시 실행했다고 쓰지 않는다. 주입용 build를 일반 제품 build 검증의 대체로 사용하지 않는다.

필수 audit 및 freshness의 실패 조건이 해소되지 않았으므로 사용자 지시대로 전체 release를 반복 실행하지 않았다. 기존 공식 release:verify의 audit High 1 중단 및 freshness FAIL을 유지한다. 검사 삭제·예외 연장·감사 우회·기대값 완화를 하지 않았다.

## 남은 출시 조건

1. 기존 glob 의미와 Next lint 진단 범위를 유지하는 검증된 braces 대체 또는 공식 수정 버전.
2. FINLIFE 점검 종료 후 실제 JSON·키 유효성·공시일·6개 무결성 검사. 00:10 1회 예약 결과는 아직 미확인.
3. EXIM의 공식 날짜/영업일 계약과 실제 유효 환율 응답.
4. Windows 브라우저 native confirm을 실제 승인/취소하고 정상 복귀를 관측할 수 있는 검증 경로. 현재 브라우저 도구 timeout은 제품 결함으로 확정되지 않았다.
5. 위 차단 해소 후 전체 필수 release/RC. 이번 범위 밖인 native Windows 설치·업데이트 검증과 최초 빈 본문 원인 미확정도 별도로 유지.

commit/push/배포/release:prepare/기존 설치본 교체는 수행하지 않았다. 재현 코드와 원본 로그는 기존 격리 환경에 보존했고, 공유 가능한 안전한 결과만 `work/local/finance-remaining-release-20261010/`에 모았다. 원본 trace·비밀값·인증 세션을 새 증거 폴더로 복사하지 않았다.


## 2026-10-11 00:10 KST 단발 후속 확인

예약 `finance-finlife`를 한 번 실행했다. 실제 시각은 2026-10-10 15:10:14 UTC = **10월 11일 00:10:14 KST**, 공지 종료 이후였다. 두 기준 기록 및 main/HEAD/미커밋 상태를 확인했고, 시작 시 원본·후보 기준선 28파일의 drift는 0이었다. 이전 Superpowers 디버깅·완료 검증 및 데이터 소스 안전 원칙을 이어 적용했다.

**새 결과: FINLIFE 전송·인증 복구 확인 / 예금·적금만 갱신 / DATA_FRESHNESS_PARTIAL_BLOCKED / RELEASE_GATES_FAIL 유지.** 기존 MITIGATION_PASS 및 ROOT_CAUSE_OPEN은 변경하지 않았다.

### 공식 조회와 무결성 판정

공식 `https://finlife.fss.or.kr/finlifeapi` 경로임을 비밀값 출력 없이 먼저 확인했다. 기존 bwrap/별도 데이터 루트에서 대표 deposit 요청을 1회, retry 0으로 실행했다. HTTP 200, `application/json;charset=utf-8`, JSON 있음, `err_cd=000`, HTML 아님을 확인했다. 기존 키의 인증 성공은 이 응답으로 확인되지만 다른 모든 API의 정상 동작까지 의미하지 않는다.

그 뒤 공식 `corepack pnpm finlife:sync --kind=all`을 1회 실행해 6종의 live 동기화가 exit 0이었다. 페이지 완주율 100%만으로 무결성을 판정하지 않고 raw의 공시월·제출시각·종류·회사/상품 참조·금리와 snapshot 메타를 별도 검사했다.

| 종류 | 새 상품/옵션 수 | 원천 공시월 | 무결성 및 반영 |
| --- | ---: | --- | --- |
| 예금 | 39 / 158 | 전부 202609 | 원천 건수·참조·필드 PASS, 원본 갱신 |
| 적금 | 59 / 178 | 전부 202609 | 원천 건수·참조·필드 PASS, 원본 갱신 |
| 신용대출 | 24 / 139 | 전부 202609 | 타 금융회사 옵션 참조 55개, 반영 안 함 |
| 주택담보대출 | 32 / 108 | 전부 202609 | 타 금융회사 옵션 참조 3개, 반영 안 함 |
| 전세대출 | 40 / 80 | 전부 202609 | 타 금융회사 옵션 참조 1개, 반영 안 함 |
| 연금 | 4 / 4 | 전부 202609 | 연금 필드 대신 일반 대출 상품/loan 필드, 반영 안 함 |

예금·적금은 받아 온 후보의 상품/옵션 수가 정확한지 입증하기 위해 **각 1회만 추가 read-only 조회**했다. outage 재시도가 아니라 `total_count`, maxPage=1, 원문 base/option 수, composite key 유일성, orphan=0, raw를 정규화한 결과와 후보의 완전 일치를 확인하는 구분 가능한 검사였다. 결과는 각각 39/158, 59/178로 일치했다. 다른 4종의 추가 API 요청은 하지 않았다.

두 승인 자료는 식별/회사/상품명 누락 없음, `(dcls_month, fin_co_no, fin_prdt_cd)` 옵션 참조 불일치 0, 유효 공시월, 실제 달력상 유효한 12자리 제출시각, 유한 금리/null 및 raw→정규화 값 일치였다. 예금 제출시각은 `202609210842~202610081156`, 적금은 `202609210842~202610081046`이다. 제출시각을 수집시각으로 대체하지 않았다.

### 새로 확인한 차단

대출의 회사 참조 불일치 55/3/1개는 기존 6월 원본에도 같은 회사코드 쌍과 건수로 존재했다. 7자리 패딩 후에도 유지되어 문자열 형식 차이가 아니다. `scripts/finlife_cli_common.mjs`의 `mergeProducts`가 회사+상품의 복합키가 아닌 `fin_prdt_cd` 하나로 연결하는 경로와 맞는다. 합성 두 회사/동일 상품코드의 독립 최소 재현도 기대 상품 2개 → 실제 1개 및 타회사 옵션 1개로 **exit 1**이었다. 이번 갱신이 새로 만든 회귀라고 하지 않는다. 잘못 연결된 대출 데이터를 갱신해 최신으로 표시하지 않았다.

연금 후보에는 `pnsn_kind`/`prdt_type` 대신 `fin_prdt_type_nm=일반대출상품`, `loan_*`, `lend_rate_*`가 있었다. 기존 endpoint/추출 코드에는 다른 종류로 대체하는 fallback이 없지만, 연금 원문 전체를 이 실행에서 저장하지 않았으므로 upstream 종류 혼입의 상세 원인은 확정하지 않았다. 연금 원본 343개를 새 대출 4개로 교체하지 않았다. 이후에는 연금 공식 응답 계약과 원문을 확인하고, 대출 join과 persistence의 식별키를 함께 검증해야 한다. 이번 단발 데이터 확인에서 광범위한 저장 schema·사용자 DB 변경을 하지 않았다.

### 실제 변경과 검증

원본에 반영한 파일은 **3개뿐**이다.

- `.data/finlife_deposit_snapshot.json`: 실제 공식 수집 결과. generatedAt `2026-10-10T15:11:59.810Z`.
- `.data/finlife_saving_snapshot.json`: 실제 공식 수집 결과. generatedAt `2026-10-10T15:11:42.846Z`.
- `config/data-freshness-exceptions.json`: 실제 fresh가 된 위 두 파일의 만료 예외만 제거. 나머지 5개는 그대로이며 날짜를 연장하지 않음.

두 snapshot은 `items` 내용도 기존과 달라졌으며 timestamp만 변경한 것이 아니다. 예금 SHA `01fbe50df2479a060d9d747195ba9dc46ccae51efb114214df052266a5b9f432`, 적금 SHA `58d951a75185a9a29a7309f037f27ac8823084a197d7f87a239cb8a73a19719f`. 반영 직전 다시 원본 drift를 확인하고 이전 바이트를 증거 폴더에 보관했다. 그 외 기준선 27파일 및 승인하지 않은 스냅샷은 불변이다.

실제 bwrap 검사:

- `corepack pnpm exec vitest run tests/finlife-snapshot-storage.test.ts tests/finlife-snapshot-policy.test.ts tests/finlife-cli-best.test.ts tests/finlife-sync-persistence.test.ts tests/finlife-sync-attempt-marker.test.ts tests/finlife-sync-groups.test.ts tests/data-freshness-report.test.ts --maxWorkers=1`: **7파일, 46 PASS**.
- `corepack pnpm freshness:release --json-report=/evidence/finlife-post-maintenance-20261011/freshness-release.json`: **exit 1**, 기존 exchange 만료 예외에서 차단.
- 별도 진단 `corepack pnpm exec node scripts/data_freshness_report.mjs --strict --check-only --json-report=/evidence/finlife-post-maintenance-20261011/freshness-strict-diagnostic.json`: **3 fresh / 5 stale, exit 1**. 예외 없는 진단을 정식 gate의 대체 PASS로 사용하지 않았다.
- `join-minimal-repro.mjs`: 기존 회사 간 옵션 오연결을 합성 데이터로 재현, **exit 1**. 제품 결함 증거이며 테스트를 삭제하거나 통과로 바꾸지 않았다.

원본 TS/JS 제품 코드·package·lock·복구·테스트 기대값은 이번 후속 실행에서 변경하지 않았다. 따라서 전체 lint/type/build/E2E를 반복하지 않았으며 새 데이터가 포함된 배포 패키지/Windows 실행까지 검증했다고 주장하지 않는다. braces, 환율, 4개 FINLIFE의 필수 차단이 남아 전체 release를 실행하지 않았다.

### 데이터 및 증거 보존

공식 sync는 원본이 마운트되지 않은 기존 격리 사본과 **별도 합성 테스트 DB**에만 썼다. 이 테스트 DB에는 거절된 live 동기화 결과도 남아 있으므로 `/tmp/finance-autonomy-20261010-d0bd4l_g/state/database/FINLIFE_VALIDATION_BLOCKED.txt`로 사용 금지를 기록했다. 다음 release/runtime 검증에는 새 격리 데이터 루트가 필요하며 이 DB를 PASS 증거로 재사용하면 안 된다. 사용자 DB/기존 설치본/백업은 변경하지 않았다.

거절된 4개 후보는 private evidence에 보존한 뒤 candidate snapshot만 기존 원본 바이트로 복원했다. 원본을 새 오류 데이터로 바꾸지 않았다. 증거 생성 중 candidate에 원래 없는 `benefits_snapshot_partial.json`을 해시하려던 도구 오류 1회는 absent를 null로 구분해 수정했으며 제품/원천 오류로 세지 않았다.

- 공유 가능한 결과와 정확한 argv/exit: `work/local/finance-finlife-post-maintenance-20261011/`.
- 원본 live 로그·거절 후보·이전 바이트: `/tmp/finance-autonomy-20261010-d0bd4l_g/evidence/finlife-post-maintenance-20261011/` 및 같은 evidence root의 `finlife-post-maintenance-20261011-*`.
- offline 재검증: `python3 .../validate-candidates.py .../candidate-snapshots .../source-before <새 report.json>`. 전부 같은 private evidence 하위 경로이며 network/DB 접근 없이 검사한다.
- 다음 작업의 drift 기준: 위 공유 증거의 `baseline-after.json`, 이번 승인 delta는 `promotion-proof.json`.

이번 예약은 실행 완료했고 추가 반복 예약을 만들지 않았다. commit/push/배포/기존 설치본 교체/전역 설정 변경은 하지 않았다.
