# FINLIFE 상품 식별 및 저장 무결성

2026-10-11 검증 기준. 공식 응답 원문과 재현 검사에 근거한 저장 계약입니다. 현행 [FINLIFE 연금 Open API 문서](https://finlife.fss.or.kr/finlife/api/anntySvingsApi/list.do?menuNo=700054)는 base/option 결합 키를 회사코드·상품코드·공시월로 명시합니다. 상품군을 포함한 영구 identityKey 및 신용대출 하위 종류는 Finance의 저장 계약이며, 이를 모든 원천 상품의 영구 유일성 보증으로 확대하지 않습니다.

## 식별 범위

- 원본 상품코드 `fin_prdt_cd`는 회사 간 중복됩니다. DB의 `Product.finPrdtCd`는 원본 코드 그대로 보존하며 전역 unique를 사용하지 않습니다.
- 안정적인 `identityKey`: 상품군 + 7자리 회사코드 + 상품코드. 신용대출은 같은 회사/상품코드에 서로 다른 `crdt_prdt_type`이 존재하므로 이 필드를 추가합니다.
- `dcls_month`는 상품 ID가 아닌 공시 버전입니다. base와 option은 회사·코드·월·신용대출 종류가 모두 일치해야 합니다. 여러 월을 합칠 때 최신 월의 옵션만 유지합니다.
- 그룹 간 동일 원문만 중복 제거합니다. 같은 키의 서로 다른 base는 거부합니다. 옵션은 원문 전체로 중복을 비교하므로 예금 금리 필드가 없는 대출 옵션도 보존합니다.
- 공식 응답의 상품군, 요청/응답 페이지, 건수, 필수 식별 필드를 검증합니다. 연금은 기존 연금 schema의 `pnsn_kind`, `prdt_type`과 대출 필드 혼입을 검사합니다. 계약이 다른 응답은 임의로 연금으로 분류하지 않습니다.

## 저장 및 실패

`scripts/finlife_sync.mjs` → 공통 무결성 검사 → `persistFinlifeSyncKind` → 상품군별 Prisma transaction → DB 완료 기록 → atomic snapshot → 최종 완료 기록 순서입니다.

유효하지 않은 후보는 DB client 획득 및 snapshot 쓰기 전에 거부됩니다. 정규화된 identityKey가 제공되면 원문에서 계산한 회사·상품군·상품코드·신용대출 종류 식별자와도 일치해야 합니다. 상품군 하나의 DB 중간 실패는 해당 transaction을 롤백합니다. DB와 파일은 하나의 transaction이 아니므로 snapshot 쓰기 실패 시 DB가 완료됐다는 사실과 실패 marker를 함께 남깁니다. 이를 전체 성공으로 취급하지 않습니다.

복수 상품군 중 하나가 실패해도 나머지를 처리하고, 실패 상품군의 이전 snapshot을 보존하며 최종 명령은 nonzero로 종료합니다. `integrity`/`fetch` 실패 marker는 CLI와 런타임 reader가 모두 인식합니다.

## 기존 SQLite 설치본 이전 절차

스키마 전환은 `src/lib/finlife/sqliteIdentityMigration.mjs`의 사전 검사와 트랜잭션을 사용합니다. 이 문서의 절차는 기존 사용자 DB에 실행했다는 의미가 아닙니다.

앱과 모든 writer를 종료한 후, 대상 설치본/checkout에서 읽기 전용 검사를 실행합니다.

```sh
corepack pnpm finlife:identity:migrate
```

결과는 `empty`(신규 DB), `required`(검증 가능한 이전 필요), `ready`(이전 완료), `blocked`(수동 조사 필요)로 구분합니다. `blocked`는 nonzero로 종료합니다. 설치본은 관리되는 env의 DATABASE_URL·PLANNING_DATA_DIR를 사용하고, checkout은 명시한 환경값을 보존합니다. raw JSON·사용자 값은 보고하지 않습니다.

승인된 유지보수에서는 다음 canonical writer 명령을 사용합니다. 직접 CLI의 `--apply`나 대상 경로 override는 허용하지 않습니다.

```sh
corepack pnpm finlife:identity:migrate:apply
```

1. 지원하는 기존 Prisma 컬럼·Product 인덱스 형태, SQLite integrity/FK, 회사·코드·공시월·신용대출 종류·상품군 원문과 옵션을 검사합니다. Provider 불일치, 불명확한 상품군, 중복 상품/옵션, 잘못 연결된 옵션, 기존 identityKey 충돌, 알 수 없는 unique 제약은 DB 쓰기 전에 차단합니다. 과거 잘못 연결된 옵션을 다른 회사로 옮기거나 삭제하지 않습니다.
2. 설정된 control root의 유지보수 writer lease를 확보합니다. `BEGIN IMMEDIATE` 안에서 재검사하고 SQLite 자체 쓰기 잠금도 유지합니다. 별도 읽기 연결의 online backup으로 WAL에만 있는 확정 데이터까지 백업하고 전체 테이블·스키마·FK·무결성과 파일 동기화를 확인합니다.
3. 기존 `Product.id` 및 모든 기존 컬럼을 보존하면서 nullable `identityKey`를 추가·채우고, scoped unique와 일반 상품코드 인덱스를 생성한 뒤 기존 상품코드 전역 unique를 제거합니다. 테이블을 재생성하거나 foreign keys를 비활성화하지 않습니다.
4. ProductOption, Favorite, ExternalProductMatch, 사용자·프로필·저장 내역을 포함한 **모든 테이블의 이전 컬럼**에 대해 ID·건수·내용 digest를 비교한 뒤 commit합니다. DB 오류나 내용 불일치는 transaction 전체를 rollback합니다.
5. `ready` 재실행은 DB 재쓰기와 추가 백업을 만들지 않습니다.

백업은 설정된 control root의 `backups/finlife-identity/<unique-id>/before.sqlite`에 남습니다. `prepared.json`은 검증된 이전 상태와 SHA-256, `applied.json`은 DB commit 이후 완료 증거입니다. prepared만 있으면 성공으로 간주하지 말고 현재 DB를 다시 inspect해야 합니다. commit 후 receipt 기록 실패는 `migrationCommitted:true` 오류로 보고합니다. Linux에서는 파일 0600/새 디렉터리 0700 및 fsync를 적용합니다. Windows의 실제 ACL·전원 손실 동작은 별도 네이티브 검증 대상입니다.

실패한 transaction은 기존 DB를 유지하므로 백업으로 자동 덮어쓰지 않습니다. 수동 복구가 필요한 경우 앱/writer 종료와 승인 후 먼저 **별도 복원 사본**에서 백업 SHA-256·SQLite integrity/FK 및 보존 데이터 동등성을 확인합니다. 구형 전체 백업에는 이후 저장분이 없으므로 최신 DB를 보존하고, 승인 없이 교체하지 않습니다. 새 schema 이후 저장분을 구형 schema로 무손실 downgrade하는 기능은 제공하지 않습니다.

## 설치·시작 보호

공식 installer는 원래 control root의 writer lease를 데이터 복사 전부터 activation/rollback까지 유지하며 **stage DB만** 이전합니다. 사용자 데이터와 기존 설치본은 실패 시 보존합니다. lease·영구 백업이 설치 디렉터리 교체와 함께 이동할 수 있는 내부 control root 구성은 자동 업데이트를 차단합니다.

기존 nonempty DB에는 Prisma db push를 실행하지 않습니다. `prisma:db:push`는 신규 empty DB만 생성하고, 준비된 DB는 검사 후 무변경 종료하며, 이전 필요/모호한 DB와 reset·data-loss·대상 override 옵션은 거부합니다. `bootstrap:local`도 같은 경로를 사용합니다. 시작 검사도 컬럼 존재만으로 통과하지 않고 identity/index/data readiness를 요구합니다.

정식 구형 전역 unique DB는 같은 상품코드의 두 회사 저장을 원래 허용하지 않습니다. 검증 fixture는 이 DB와, 전역 unique만 제거된 부분 전환 DB의 동일 코드/서로 다른 두 회사를 각각 다룹니다. 삭제되거나 과거 덮어쓴 상품 기록을 이번 이전으로 복구했다고 주장하지 않습니다.

SQLite backup과 transaction 동작 근거: [SQLite Online Backup API](https://www.sqlite.org/backup.html), [SQLite transaction](https://www.sqlite.org/lang_transaction.html). PostgreSQL 실제 migration은 지원·검증 범위 밖입니다.

## 조회 및 브라우저 호환성

scoped ID는 exact 조회합니다. 기존 bare-code URL은 후보가 정확히 하나일 때만 조회하고 모호하면 거부합니다. 외부 매칭은 기존 Product.id를 유지합니다. 새 브라우저 favorite/compare/recent-viewed는 scoped ID를 사용합니다. 회사·상품군 정보가 없는 과거 localStorage 값은 삭제하지 않으며 모호한 값을 다른 회사의 상품에 자동 적용하지 않습니다.

## 실제 검증 범위

은행 그룹 `020000`의 2026-10-11 00:26 KST 공식 원문에서 공시월 `202609`의 신용대출 44개/옵션139개, 주택담보34/108, 전세41/80을 확인했습니다. 이는 전체 업권 검증을 의미하지 않습니다. 원문을 보존한 replay와 실제 SQLite 저장에서 연결 무결성을 검증했습니다.

연금 공식 JSON/XML 예제의 endpoint는 `annuitySavingProductsSearch`, 상품 구분은 `P`, 그룹은 보험 `050000`·금융투자 `060000`입니다. 요청 `pageNo`와 응답 `now_page_no`가 대응합니다. base는 `pnsn_kind`·`prdt_type`, option은 연금수령기간·가입나이·월납입액·납입기간·개시나이·수령액 필드를 사용합니다. 문서의 201510 예제 5개/옵션240개는 현재 무결성 검사를 통과하지만 최신 데이터로 사용하지 않습니다. 문서 상단 Request URL과 option 설명표에는 다른 상품 예제가 섞여 있어 JSON/XML 원문·실제 응답과 구분합니다.

2026-10-11 02:07~02:08 KST 직접 응답에서 `050000`은 여전히 대출 필드를 포함한 4개/옵션4개(공시월 202609)를 반환했고, `060000`은 총297건·최대30페이지·현재1페이지에 빈 본문을 반환했습니다. 이전 요청 page1→응답 page24는 이번에는 재현되지 않았지만 빈 본문과 건수 모순은 지속됐습니다. 문서에 없는 `pageSize`를 빼도 그룹별 응답 SHA-256이 같았습니다. 두 후보 모두 Finance 정규화 전에 계약이 어긋나며 기존 검사가 저장 전에 거부합니다. 실패 응답을 공식 CLI에 재생했을 때 각 exit 1, 신규 격리 SQLite 및 기존 스냅샷 바이트 불변을 확인했습니다. 원천 내부 장애 원인·완전한 최신 연금 페이지·원천 제출 시각 무결성은 미확인입니다. 기존 연금343개를 보존하고 연금 최신성 차단을 유지합니다.
