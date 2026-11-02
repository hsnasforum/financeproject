# FINLIFE 회사·상품·옵션 식별 무결성 수정

작성: 2026-10-11 01:08 KST. 기준: main / e296a529f1e3d48c224aee36ca1b9bf65ee0cf44.
이전 기준은 [남은 출시 검증의 후속 확인](../10/2026-10-10-finance-remaining-release-validation.md)입니다.

## 판정

- **FINLIFE_LOANS: SOURCE_APPLIED / TEST_PASSED / ISOLATED_RUNTIME_VERIFIED.** 대출 3종의 교차 회사 연결 결함을 재현하고 수정했습니다.
- **PENSION: BLOCKED.** 공식 endpoint에서 받은 원문 자체가 기존 연금 schema·페이지 계약과 맞지 않습니다. 기존 343개를 보존했습니다.
- **MITIGATION: PASS 유지.** 최종 프로덕션 복구 회귀 10개가 통과했습니다. 최초 간헐 빈 화면의 근본 원인 확정은 아닙니다.
- **RELEASE: FAIL 유지.** braces 보안, EXIM 환율, 연금 최신성 차단이 남습니다. 전체 release를 재실행하지 않았습니다.
- 기존 사용자 DB/설치본 변경, commit/push/배포, 전역 설정 변경은 하지 않았습니다. 기존 DB 마이그레이션은 미적용입니다.

## 확인한 원인과 수정

CLI와 TypeScript 정규화/병합이 fin_prdt_cd만으로 상품·옵션을 연결했고, Product.finPrdtCd의 전역 unique 및 종류 우선순위 저장도 회사·상품군 충돌을 표현할 수 없었습니다.

안정적인 식별자는 **상품군 + 7자리 회사코드 + 상품코드**로 통일했습니다. 실제 신용대출 원문에는 같은 회사·코드의 서로 다른 crdt_prdt_type이 있어 이를 추가했습니다(0010016 / WR0002F, 종류 2·3). dcls_month는 안정적인 ID가 아닌 공시 버전이며, 옵션 연결에서는 회사·코드·월·신용대출 종류가 모두 일치해야 합니다.

공통 validator가 orphan, 충돌하는 중복 base, 상품군·페이지·건수·공시월·정규화 ID 불일치를 DB client 획득과 snapshot 쓰기 전에 거부합니다. null/빈 문자열/boolean total_count를 정상 0건으로 인정하지 않습니다. 최신 공시를 선택한 동일 후보를 DB와 snapshot에 전달합니다. 상품군별 transaction 실패는 롤백하며 일부 상품군 실패는 이전 snapshot과 실패 marker를 보존하고 CLI nonzero로 종료합니다.

Product.identityKey nullable unique를 추가하고 원본 finPrdtCd는 일반 index로 바꿨습니다. 확인 가능한 legacy row는 같은 Product.id를 유지합니다. Favorite/ExternalProductMatch 참조를 보존하고 불명확한 legacy 식별자는 자동 병합하지 않습니다. scoped 상세 조회, 목록·옵션·즐겨찾기·비교·최근 조회와 추천 링크를 함께 연결했습니다. 모호한 bare-code 상세 조회는 거부합니다.

공식 공개 스키마 문서 본문은 확보하지 못했습니다. 식별 규칙은 실제 공식 API 원문과 합성 충돌 검사에서 검증한 저장 계약이며, 공식 문서가 전역 유일성을 보증한다고 주장하지 않습니다.

## 실제 원문과 데이터

2026-10-11 00:26:28~30 KST, 기존 키를 출력하지 않고 공식 endpoint를 각 1회 조회했습니다. 대출은 은행 그룹 020000만 검증했으며 전체 업권 검증은 아닙니다.

| 종류 | 수정 전 상품 / 잘못 연결된 회사 옵션 | 수정 후 상품 / 옵션 | 잘못된 회사·종류 연결 |
| --- | ---: | ---: | ---: |
| 신용대출 | 24 / 55 | 44 / 139 | 0 |
| 주택담보대출 | 32 / 3 | 34 / 108 | 0 |
| 전세대출 | 40 / 1 | 41 / 80 | 0 |

신용대출에는 수정 전 대출 subtype 불일치도 8개 있었으며 수정 후 0개입니다. 공시월은 모두 202609입니다. 원문 총건수·완전 식별자 유일성·이름 필드·orphan 0·금리 유한수/null·회사 제출일의 유효성과 수집시각 이전 여부를 확인했습니다. 제출일 범위는 신용 09-03 14:26~09-18 17:52, 주담대 09-03 14:31~09-18 17:48, 전세 09-03 14:25~09-18 17:48입니다.

검증된 대출 snapshot 3개만 원본에 반영했습니다. generatedAt은 실제 원문 수집시각을 사용했으며, 보존 원문을 재생해 검증한 사실을 note/provenance에 기록했습니다. 원본 DB의 sync 완료로 간주하지 않습니다. 실제 갱신된 대출 3개 freshness 예외만 제거했고 날짜를 연장하지 않았습니다.

다음 파일은 전후 SHA-256이 동일합니다.

| 보존 대상 | SHA-256 |
| --- | --- |
| 예금 39개 | 01fbe50df2479a060d9d747195ba9dc46ccae51efb114214df052266a5b9f432 |
| 적금 59개 | 58d951a75185a9a29a7309f037f27ac8823084a197d7f87a239cb8a73a19719f |
| Gov24 | 0daafe7c1dcc2e65ca1550f8cb95cf99a014e5d756654ac7d0a18c4dfc89ca8a |
| 연금 343개 | 65347082abae554143bd0df88e2402411bb239b57f760183ed0cc5deef86b367 |

## 연금 별도 조사

로컬 설정의 annuitySavingProductsSearch.json을 실제 호출했습니다.

- 050000: err_cd=000 / prdt_div=P인데 base 4개가 loan_type, 일반대출상품 종류와 대출 옵션 필드를 가집니다. pnsn_kind·prdt_type이 없어 정규화 전 원문 검사에서 거부했습니다.
- 060000: 요청 page1에 now_page_no=24, base/option 빈 배열, total_count=297이 반환되어 페이지 계약 검사에서 거부했습니다.
- 현행 endpoint·그룹·schema의 공식 문서 본문 및 외부 응답 이상 원인은 미확정입니다. 일반 대출을 연금으로 강제 분류하지 않았고 추가 반복 요청도 하지 않았습니다.

## 격리·마이그레이션·보존

새 사본은 /tmp/finance-finlife-integrity-20261011-2kk80tfd/workspace이며, bwrap unshare-all과 새 state/database/finance.db 및 Planning 데이터 루트를 사용했습니다. 과거 오염 후보 DB를 재사용하지 않았습니다. Node 22.22.2 / pnpm 9.15.9 / Next 16.3.8 / React 19.2.3 / Prisma 7.9.1입니다. 의존성 버전은 이번 작업에서 변경하지 않았습니다.

독립 legacy SQLite fixture에 Favorite와 ExternalProductMatch를 만든 후, 검토용 SQL로 schema를 변경하고 동일 Product.id·외부 참조를 확인했습니다. 중간 insert 강제 실패 시 products/providers/options transaction 전체 롤백, 신규 DB backup/restore 논리 동등성, integrity_check=ok, foreign key 오류 0, 이전 schema 백업의 정확한 복원도 확인했습니다.

격리된 legacy fixture에 대한 prisma:db:push는 unique 추가 경고로 중단됐습니다. 경고를 끄거나 accept-data-loss를 사용하지 않았습니다. 검토용 SQL은 새 합성 DB에만 적용했습니다. 실제 기존 DB에는 별도 백업·writer 종료·기존 row 정합성 확인과 승인된 migration 절차가 필요합니다. PostgreSQL 실DB migration과 새 쓰기까지 보존하는 무손실 downgrade는 미검증입니다. 기존 오연결로 이미 의미가 바뀐 사용자 참조를 자동 복구했다고 주장하지 않습니다.

반영 직전 원본 3,276개 baseline 파일의 drift는 0이었습니다. 승인 범위 48개 파일을 원자적으로 반영한 뒤 예상 외 변경 0, 격리 검증본과 동일 SHA를 확인했습니다. 기존 미커밋 변경은 보존했습니다.

## 실행한 검증

| 검사 | 실제 결과 |
| --- | --- |
| 수정 전 합성·원문 검사 | 회사코드 충돌/신용 subtype/orphan/잘못된 연금 등을 red로 재현 |
| 관련 Vitest 회귀 | 78개 파일 / 346개 PASS |
| 최종 정규화 ID guard 추가 후 | 영향 받는 4개 파일 / 34개 PASS, 신규 실패 1개 red→green 포함; 앞 행과 중복 집계하지 않음 |
| 소비 경로 별도 테스트 | 15개 파일 / 73개 PASS, 위 회귀와 일부 중복 |
| planning:current-screens:guard | 5개 파일 / 11개 PASS |
| lint | 전체 PASS, 기존 Next 경고 12개; 마지막 변경 파일 추가 lint PASS |
| typecheck | PASS, 마지막 소스의 production build TypeScript도 PASS |
| production build | PASS, BUILD_ID=qXhnTzi7NoIV7SSVpALyy |
| 첫 production E2E | 27개 중 24 PASS / 3 FAIL, 실패 trace 보존 |
| 수정 후 관련 production E2E | 22개 모두 PASS, retries=0; 실제 scoped API·상품 상세·새로고침·모바일 shelf·기존 상품 목록·복구 10개 포함 |
| 저장·암호화 백업·복원 범위 E2E | 첫 production 실행에서 5개 PASS; 관련 구현이 이후 변경되지 않아 재실행하지 않음 |
| 실제 원문→새 DB→snapshot | 예금/적금 및 대출 3종 PASS, 잘못된 후보 쓰기 차단, 참조·transaction·복원 보존 PASS |
| freshness:release | FAIL: expired freshness exception exchange_snapshot.json; 연금 예외도 미해결 |

최종 runtime 입력 1,834개 파일 해시: a6e1d349feaf3b3b336ca5b0af967653ef23c3d26ef461d0fff659bf65ff1b48. Windows 실사용/기존 설치본/전체 release를 이번 검증으로 대체하지 않습니다. 원본 사용자 DB에 연결한 실행은 하지 않았습니다.

첫 E2E 실패는 각각 다음 근거로 수정했습니다.

1. 모바일에서 큰 ProductExplorerHeaderCard가 sticky로 고정되어 checkbox 클릭을 가렸습니다. trace의 pointer interception과 화면을 확인하고 lg 이상에서만 고정하도록 1줄 수정했습니다. 강제 click이나 timeout 변경 없이 같은 테스트가 통과했습니다.
2. 기존 shelf 테스트의 bare-code 기대값은 검증된 새 식별 계약과 달랐습니다. 회사가 포함된 정확한 ID로만 변경했고 기존 저장값·개수·hydration 기대는 유지했습니다.
3. 복구 취소/홈 이동의 모든 assertion 성공 후 destination prefetch handler와 context 종료가 경합했습니다. trace 타이밍을 확인하고 마지막에 unrouteAll({behavior:"wait"})로 요청 처리를 완료하도록 했습니다. 예외 무시나 제품 기대값 변경은 없습니다.

## 변경 파일과 증거

주요 변경은 scripts/finlife_cli_common.mjs, finlife_sync.mjs, finlife_persistence.mjs, finlife_inventory_report.mjs; src/lib/finlife의 공통 identity 및 normalize/source/productsHttp/syncRunner; prisma/schema.prisma와 schema.postgres.prisma; 목록·상세·추천 소비 경로와 관련 테스트입니다. 모바일 header 1줄, 복구 E2E 종료 처리, docs/finlife-identity.md, freshness 예외 및 대출 snapshot 3개도 포함합니다.

정확한 48개 파일과 전후 SHA는 [반영 manifest](../../local/finance-finlife-integrity-20261011/source-promotion.json)에 있습니다. 기존 파일 사본, 최종 diff, 원문, red/green 로그, DB proof, 실패 trace와 성공 화면은 [증거 목록](../../local/finance-finlife-integrity-20261011/evidence-manifest.json)에 보존했습니다. work/local은 Git ignored이며 DB 증거는 전부 새 합성 데이터입니다.

핵심 재현 증거:
- before-raw.log / before-raw-integrity.json / after-raw-integrity.json
- raw-*-020000.json / raw-pension-*.json / raw-capture-summary.json / raw-field-integrity.json
- identity-*-red.log / identity-key-green.log / partial-cli-expected-failure.log
- db-proof.mjs / db-integrity-proof.json / transaction-rollback.json / sqlite-restore-proof.json
- production-e2e-authenticated.log / browser-failure-classification.json / production-e2e-verified.log
- baseline-source/ / candidate-source.patch / verified-runtime-inputs.json

격리 사본 재실행은 해당 base의 run.py로 corepack pnpm 명령을 실행합니다. 원문 DB proof는 node /evidence/db-proof.mjs, 프로덕션 브라우저는 /evidence/production-e2e.mjs wrapper를 사용합니다. finlife-runtime-proof.spec.ts는 테스트 전용 DB를 요구하는 조사 fixture로 증거 폴더에만 보존하며 원본 tests에 반영하지 않았습니다. 원문 재생에는 키나 추가 외부 요청이 필요하지 않습니다.

## 미해결 사항

- 연금 공식 응답 및 현행 공개 계약 확인.
- braces 개발 의존성 보안 차단, EXIM 환율 기준일·정상 응답 차단.
- 기존 데이터의 승인된 schema migration·reconciliation·설치 업데이트 검증. 이번 source를 기존 DB에 즉시 실행할 수 있다고 판정하지 않습니다.
- 최초 간헐 빈 화면 ROOT_CAUSE_OPEN, Windows 및 전체 출시 검증 미완료. RELEASE_READY/FIXED(원래 빈 화면)를 선언하지 않습니다.

## 동일 요청 후속 확인 — 2026-10-11 01:12 KST

반영 48개 파일과 runtime 입력 1,834개를 원본·검증본 해시로 다시 대조했으며 drift는 0입니다. baseline 3,276개에서도 승인 범위 외 변경이 없습니다. bwrap 안에서 공통 validator와 원문 연결 assertions를 다시 실행해 예금39/158, 적금59/178, 신용44/139, 주담대34/108, 전세41/80의 상품/옵션 무결성이 모두 통과했습니다. Gov24·연금 파일 보존도 확인했습니다. 이번 확인에는 소스 수정, API 재호출, DB 쓰기, 전체 release 재실행이 없습니다. 기존 테스트·빌드 증거를 재사용하고 연금·braces·EXIM 및 migration 차단을 유지합니다. 증거: work/local/finance-finlife-integrity-20261011/duplicate-request-integrity.log 및 duplicate-request-verification.json.
