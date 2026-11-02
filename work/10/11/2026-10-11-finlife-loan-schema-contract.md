# FINLIFE 대출 스키마 불일치 7건 정리

기준: [금융 데이터 계약 복구](2026-10-11-financial-data-contract-recovery.md).
2026-10-11 KST, main / e296a529f1e3d48c224aee36ca1b9bf65ee0cf44.

## 결과

- **LOAN_SCHEMA_PASS / DATA_PRESERVATION_PASS**: schema breaking 7→1→0. 6개 누락 메타데이터를 복원하고, 관측 근거가 확인된 credit 공시 종료일의 타입 기준 하나만 갱신했습니다.
- **SOURCE_APPLIED**: 아래 5개 후보 파일만 검증 후 원본에 반영했습니다. 정식 CLI·저장 코드·Prisma·EXIM 코드는 변경하지 않았습니다.
- **DATA_DOCTOR_FAIL / RELEASE_NOT_RUN**: 연금 freshness 예외 만료와 기존 braces 보안 차단을 유지합니다. 전체 출시 PASS가 아닙니다.

## 원인과 수정

### 메타데이터 누락 6건

정식 scripts/finlife_sync.mjs는 lastUpstreamStatus=null로 시작하고, fetch 예외에서만 HTTP 오류 상태를 기록합니다. 따라서 성공 시 null은 HTTP 상태 200 자체를 뜻하지 않습니다. mergeAcrossGroups가 계산한 duplicateAcrossGroupsCount도 meta에 포함합니다. finlife_persistence.mjs는 meta를 spread하며, finlife_cli_common.mjs의 writeSnapshot은 이를 원자적으로 보존합니다.

누락은 이전 검증 전용 db-proof.mjs:31이 snapshot.meta를 별도로 구성하면서 두 필드를 빠뜨린 데서 발생했습니다. 해당 원문·스크립트와 실패 결과를 보존했습니다. 제품의 정상 수집·저장 경로에서는 유실이 재현되지 않아 불필요한 제품 코드 수정을 하지 않았습니다.

보존된 각 원문을 network 격리 상태에서 정식 CLI에 1회씩 재생했습니다. 세 원문은 은행020000, 단일 완주 페이지, HTTP200/err_cd000/시도1회라는 당시 capture 기록을 가집니다. 정식 병합 결과 중복0, 정상 CLI가 저장한 lastUpstreamStatus=null을 확인해 기존 스냅샷에 해당 두 값만 반영했습니다. 새로운 live 수집이나 사용자 DB 동기화로 표시하지 않았습니다.

### credit 공시 종료일 타입 1건

[공식 개인신용대출 문서](https://finlife.fss.or.kr/finlife/api/indvlCrdtApi/list.do?menuNo=700057)는 필드를 공시 종료일로 설명하며 JSON 예제는 null입니다. 명시적인 response 타입/nullable 선언은 없으므로 공식 예제와 승인 원문·과거 저장 자료를 함께 검증했습니다.

- 현재 공식 원문/승인44개: null34, string10, 누락/기타 타입0. 식별자별44/44 값 일치.
- 문자열은 99991231, 20261019, 20261020, 20261031, 20270916 각2개로 모두 8자리 유효 달력 날짜입니다. 99991231의 특수 의미는 추정하지 않았고 원문 그대로 보존했습니다.
- HEAD의 과거24개에도 문자열4개가 있었으나 앞3개가 모두null이었습니다. fingerprint의 arraySampleSize=3/prefix 표본이 null-only 기준을 만든 원인입니다. 신규 upstream 타입 변경으로 단정하지 않았습니다.

canonical generator를 증거용 sidecar에서 실행한 뒤, docs/schema-baselines.json의 credit $.items[].raw.dcls_end_day entry만 null|string로 갱신했습니다. 다른 baseline entry·생성 시각·배열 표본 범위·게이트는 그대로입니다.

## 변경 파일

- .data/finlife_credit-loan_snapshot.json
- .data/finlife_mortgage-loan_snapshot.json
- .data/finlife_rent-house-loan_snapshot.json
- docs/schema-baselines.json
- tests/finlife-loan-snapshot-contract.test.ts

새 회귀 테스트는 실제 승인 대출 스냅샷을 schema contract와 비교하고, 후속 표본이 전부 null이어도 credit 종료일의 null/string 두 관측 타입을 검사합니다. 기존 테스트 기대값은 수정하지 않았습니다.

## 데이터 보존

| 종류 | 상품 | 옵션 | 공시월 | 보존한 실제 수집 시각 UTC |
| --- | ---: | ---: | --- | --- |
| 신용 | 44 | 139 | 202609 | 2026-10-10T15:26:28.992Z |
| 주담대 | 34 | 108 | 202609 | 2026-10-10T15:26:29.257Z |
| 전세 | 41 | 80 | 202609 | 2026-10-10T15:26:29.463Z |

세 snapshot의 items 영역은 **바이트 단위로 동일**합니다. 기존 meta도 전부 보존했습니다. 재생 CLI의 새 generatedAt/note로 교체하지 않았습니다. 새 SQLite의 Product.raw 및 옵션 raw를 기존 승인 데이터와 전수 비교했으며 회사·상품·subtype·공시월 오연결0, integrity_check=ok, foreign_key_check=0입니다.

EXIM source/receipt, 예금39·적금59, Gov24, 연금343, 이전 마이그레이션·복구 소스는 이번 변경에서 보존했습니다. 사용자 DB·설치본은 접근·변경하지 않았고 과거 오염 검증 DB도 사용하지 않았습니다.

## 실행한 검증

신규 사본 /tmp/finance-loan-schema-20261011-p99tfnqe/workspace 및 새 state/database/finance.db. bwrap unshare-all, 별도 Planning root, Node22.22.2/pnpm9.15.9, 준비된 의존성 재사용. 공식 문서 공개 조회 외에 API live 호출·기존 키 사용은 없었습니다.

| 명령/검사 | 결과 |
| --- | --- |
| corepack pnpm schema:report, 수정 전 | exit1, snapshots10 / breaking7 |
| 신규 contract test, 수정 전 | 5개 중4 FAIL·1 PASS; 오류7건 및 유효 문자열 거부 재현 |
| corepack pnpm prisma:db:push | 새 격리 DB 초기화 PASS; 기존 DB 이전 아님 |
| corepack pnpm finlife:sync --kind=<대출3종> --topFinGrpNo=020000 | 각각 exit0. fetch만 보존 원문으로 재생, 실제 CLI→Prisma→snapshot 실행 |
| node /evidence/verify-and-repair-metadata.mjs | 원문·정식 CLI·DB·보존 스냅샷 일치 및 메타6개만 복원 PASS |
| corepack pnpm schema:report, 메타만 복원 후 | exit1, breaking1; credit 종료일 기준만 남음 |
| Vitest 관련12파일 | 77/77 PASS; 신규5, identity13, live9, persistence11, partial1, group merge3, scan merge2, CLI best3, attempt7, schema fingerprint2, schema diff3, freshness18 |
| corepack pnpm typecheck | PASS |
| 새 테스트 ESLint | PASS |
| corepack pnpm data:doctor, 최종 | schema snapshots10/breaking0/nonBreaking0. 이후 연금 예외 만료로 exit1 유지 |
| 원본 drift·반영 해시·diff check | source-promotion.json 및 diff-check.log 참조 |

제품 실행 코드·의존성·라우팅 변경이 없어 이번 delta에는 전체 build/브라우저 E2E/전체 release를 재실행하지 않았습니다. 이 검증을 새 Windows 실행 또는 전체 출시 검증으로 확대하지 않습니다.

## 사용 skill

Superpowers using-superpowers, systematic-debugging, test-driven-development(좋은 테스트 작성 참조), verification-before-completion; dart-data-source-hardening, planning-gate-selector, work-log-closeout.

## 증거 및 남은 차단

증거: work/local/finance-loan-schema-20261011/. schema-before/after-metadata, contract-red, 공식 문서/원문, credit-date-proof, metadata-repair-proof, semantic-delta, CLI 로그 및 .result.json, source-promotion.json에 실제 실패·성공과 보존 결과를 기록했습니다. 기존 실패 증거는 수정하지 않았습니다.

- **PENSION_BLOCKED**: 종류·페이지 계약에 맞는 공식 최신 데이터 미확보, 기존343개 stale 및 예외 만료.
- **SECURITY_BLOCKED(braces)**: 기존 차단 유지, 감사 우회 없음.
- 최초 간헐 빈 화면 ROOT_CAUSE_OPEN 및 전체 출시·Windows 검증의 기존 미완료 상태는 이번 범위에서 바뀌지 않습니다.
- commit/push/배포, 실제 DB 이전·설치본 교체·전역 설정 변경 없음.
