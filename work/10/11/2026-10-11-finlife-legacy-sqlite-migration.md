# FINLIFE 기존 SQLite 데이터 호환 마이그레이션

작성: 2026-10-11 KST. 기준: main / e296a529f1e3d48c224aee36ca1b9bf65ee0cf44.
이전 기준: [FINLIFE 식별 무결성 수정](2026-10-11-finlife-identity-integrity.md).

## 판정

- **MIGRATION_READY: PASS — 지원하는 legacy SQLite에 대한 구현·격리 검증·로컬 소스 반영 완료.**
- **DATA_PRESERVATION: PASS — 합성 legacy DB와 보존된 공개 snapshot replay 범위.** 실제 사용자 DB에 실행한 결과가 아닙니다.
- **INSTALLER_COMPATIBILITY: PASS — Linux bwrap의 실제 설치 CLI/stage 전환과 production desktop launcher.** Windows-native ACL·바로가기·전원 손실 및 실제 설치본 업데이트는 NOT_VERIFIED입니다.
- **REMAINING_BLOCKERS:** 연금 upstream/schema, braces 보안, EXIM 환율 차단 유지. 전체 출시 PASS가 아니며 전체 release를 재실행하지 않았습니다.
- 기존 사용자 DB·설치본·공개 snapshot은 변경하지 않았습니다. commit/push/배포·전역 설정 변경도 없습니다.

## 확인한 결함과 최소 수정

이전 schema는 Product.finPrdtCd 전역 unique를 사용하므로 회사가 다른 동일 코드 두 상품을 저장할 수 없었습니다. 새 nullable identityKey schema에 대해 기존 설치기가 곧바로 Prisma db push를 실행하던 경로에는 기존 row 식별·백업·안전한 이전 절차가 없었습니다.

새 마이그레이션은 기존 identity.mjs를 재사용합니다. 회사·상품군·원본 코드·신용대출 subtype을 확인하고, 옵션의 회사·코드·공시월·종류가 해당 상품과 일치해야 진행합니다. 원문/Provider가 불일치하거나 종류가 확정되지 않는 row, orphan·중복 옵션, 중복 scoped identity, 알려지지 않은 unique 제약, 지원하지 않는 구형 schema·generated column은 차단합니다. 과거 오연결을 임의 재배정하거나 이미 사라진 상품을 복원하지 않습니다.

새 명령은 다음과 같습니다. 이 작업에서는 아래 apply를 합성 DB에만 실행했습니다.

- corepack pnpm finlife:identity:migrate — readonly inspect, empty/required/ready/blocked 구분.
- corepack pnpm finlife:identity:migrate:apply — canonical maintenance writer를 통한 적용.

writer lease와 BEGIN IMMEDIATE로 단일 writer를 확인합니다. 트랜잭션 안에서 재검사한 뒤 SQLite online backup으로 WAL 확정분까지 포함하고, 전체 테이블·schema·integrity/FK·fsync를 검증합니다. 그 후 identityKey만 추가·채우고 인덱스를 전환합니다. Product.id와 모든 기존 컬럼의 ID·건수·내용 digest가 일치할 때만 commit합니다. Product 테이블 재생성·FK 비활성화·데이터 삭제는 하지 않습니다.

적용 전 실패는 DDL과 데이터 전체를 rollback합니다. 백업 및 prepared receipt는 유지하고, commit 뒤 완료 receipt 쓰기에 실패하면 migrationCommitted:true로 보고합니다. 재실행은 ready일 때 DB/백업을 다시 쓰지 않습니다. SQLite REAL의 Infinity가 JSON에서 NULL과 같게 보이는 초기 fingerprint 결함도 실제 trigger로 재현하여 구분하도록 수정했습니다.

설치기는 복사 전부터 activation/rollback 종료까지 원래 control root의 maintenance lease를 유지하고 stage DB만 이전합니다. 검증 중 발견된 “기존 DB가 src 등 설치기 교체 대상 폴더에 있어 stage 복사에서 빠지고 새 DB로 판단되는” 결함은 DB 및 WAL/SHM/journal의 존재·크기·SHA-256 비교로 초기화 전에 차단했습니다. 원본 설치본과 파일을 보존합니다. control root가 설치 폴더 내부인 구성도 자동 이전하지 않습니다.

기존 nonempty DB의 prisma:db:push는 검사 후 준비된 DB에만 readonly no-op이며, 미이전/모호한 DB·reset/data-loss/대상 override는 거부합니다. 신규 empty DB 초기화만 허용합니다. bootstrap, startup, desktop launcher 및 artifact 필수 파일 목록도 연결했습니다.

## 데이터 보존 증거

정식 legacy 전역 unique DB와 전역 unique만 제거된 부분 전환 DB를 따로 구성했습니다. 후자는 회사 0010001/0010002에 SHARED-CODE를 각각 보유합니다.

- Product 40/41, ProductOption 60/61, Favorite 70/71, ExternalProductMatch 80/81이 같은 ID·내용을 유지했습니다.
- User·UserProfile·PlannerSnapshot과 나머지 모든 기존 테이블을 비교했습니다. 새 identityKey만 비교에서 제외했습니다.
- runtime fixture의 이전 전체 내용 SHA-256과 migration 직후 SHA-256은 모두 fbb10f42bd39497926dd0db7e1984057e418883198957f1277c27fa317457814입니다.
- 실제 Prisma client로 저장·재조회하고 SQLite backup을 별도 사본으로 복원했습니다. WAL 데이터, 트리거 실패·부작용 rollback, 다른 writer, 백업 저장 실패, commit 후 receipt 실패, no-op 재실행을 검사했습니다.
- 보존된 예금39·적금59·신용44·주담대34·전세41·연금343개 snapshot의 전체 상품/옵션을 새 DB에 replay하여 이전 전후 내용·참조·백업 일치를 확인했습니다. 연금343은 기존 자료 호환성 검사이며 최신 공식 데이터 검증이 아닙니다.
- production browser 종료 후에도 위 legacy row 및 상품·옵션·즐겨찾기·외부 매칭 전체 건수/내용이 동일했습니다.
- 예금·적금·Gov24·대출3종·연금 snapshot의 원본 SHA는 이전 기록과 같습니다. 이번 작업에는 외부 API 갱신이나 snapshot 반영이 없습니다.

## 실행한 검증

환경: 새 /tmp/finance-finlife-migration-20261011-_x596xo6/workspace, bwrap --unshare-all, 독립 state/database·Planning root. 원본 HOME/source/DB는 mount하지 않았습니다. Node22.22.2 / pnpm9.15.9 / Next16.3.8 / React19.2.3 / Prisma7.9.1. 의존성·lockfile 변경 없음.

| 검사 | 실제 결과 |
| --- | --- |
| TDD / 실패 재현 | 초기 stub의 행동 검사19실패, 구형/모호한 데이터3실패, unknown index2실패, REAL 값 손상1실패, generated column1실패 → 수정 후 통과. 모듈 부재/0 test 결과는 행동 증거로 세지 않음 |
| 설치 누락 재현 | integration-owned-db-red에서 잘못된 db push 진입 → 보존 guard 후 설치22개 PASS |
| 최종 타깃 | 8파일104개 PASS: core29, CLI, safe Prisma, installer, runtime DB/startup, writer registry, artifact provenance |
| 기존 저장/백업/인증 | 6파일52개 PASS: backup-bundle/export-planning/validate-runtime, compat-fixtures, doctorMigrationCheck, planningRouteUserScopeCoverage |
| 공개 snapshot replay | 6개 상품군 PASS; 별도 Prisma save/reopen/backup 포함 타깃7개 PASS, 후속 전체 core/replay 검사에서도 통과 |
| planning:v2:compat --skip-complete | legacy fixture 및 8개 검사 PASS. skip-complete를 전체 complete PASS로 확대하지 않음 |
| 전체 Vitest 최초 실행 | 921파일: 912PASS/9FAIL. 4,343검사: 4,321PASS/18FAIL/기존4SKIP |
| 위 전체 실행 실패 조사 | PLANNING_DATA_DIR/DATABASE_URL 강제 env 제거 후 실패15개 해소. 동일 mount의 TMPDIR 및 mock fixture example.com용 오프라인 hosts를 사용한 나머지3파일7개 PASS. 제품/기존 테스트 기대값 변경 없이 모든 최초 실패 대상 재검증 통과 |
| lint | exit0, 제품의 기존 Next 경고12개 + 원본에 반영하지 않는 evidence-only replay test의 unused import 경고1개. 오류0 |
| typecheck | exit0; 이후 production build의 TypeScript도 PASS |
| production build | exit0, BUILD_ID=EoD_s2FmdTFaaWzYXGwDp. 기존 middleware/Edge 호환 경고는 보존 |
| 마이그레이션 DB의 production E2E | 15/15 PASS, workers1/retries0: navigation recovery10, release persistence2, backup UI scope3 |
| 실제 encrypted backup roundtrip | 프로필·목표·run·saved report 변경 후 실제 export/preview/finalize/restore·재열기·새로고침 내용 동일 |
| 복구 및 화면 | 정상/11.5초 pending Flight, 강제 빈 본문, 확인 취소·reload·홈 이동, 인증·저장 오류, 입력/저장 도중 복구, 모바일/데스크톱 회귀 PASS |
| 브라우저 trace | 15개 보존. pageError0; console error1은 테스트가 의도적으로 반환한 STORAGE_CORRUPT HTTP500이며 별도 오류 UI 확인 |
| 최종 정적 검토 | 이전 P1 설치 DB 누락 해결 확인, 남은 확정 finding 없음. 테스트 실행 증거는 위 실제 로그 |

전체 Vitest 첫 실행 자체는 FAIL입니다. 격리환경 가정과 충돌한 대상의 원인을 구분하고 좁힌 재검증이 통과했다는 결과를 기록하며, 처음부터 전체 단일 실행이 녹색이었다고 주장하지 않습니다. 기존 skip4개도 미실행 그대로입니다. 전체 release와 Windows-native 실행을 이번 Linux 검증으로 대체하지 않습니다.

## 반영 파일과 증거

검증한 소스·테스트·문서 26개와 이 기록만 추가 반영했습니다. 파일별 전후 SHA와 반영 결과는 [source-promotion.json](../../local/finance-finlife-migration-20261011/source-promotion.json)에 있습니다.

- core/CLI: src/lib/finlife/sqliteIdentityMigration.mjs, scripts/finlife_identity_migrate.mjs
- 실행/설치 보호: scripts/planning_v2_desktop_install.mjs, planning_v2_desktop_launch.mjs, planning_runtime_startup.mjs, planning_writer_entry.mjs, prisma_cli_safe.mjs, bootstrap_local.mjs, release_artifact_provenance.mjs; deployment/runtimeDatabase.mjs·writerRegistry.mjs; package.json
- 타입/회귀: src/types/better-sqlite3.d.ts; tests/finlife-sqlite-identity-migration.test.ts, finlife-identity-migration-cli.test.ts, helpers/finlifeLegacyDatabase.ts; 기존 installer/startup/writer registry/Prisma/artifact 검사
- 문서: docs/finlife-identity.md, deploy.md, runtime.md, planning-v2-desktop-local.md, package-scripts.md

새 의존성·Prisma schema·snapshot 변경은 없습니다. 기존 uncommitted 변경을 포함해 시작한 사본에서 이번 delta만 반영했습니다. 반영 전 원본 baseline4,475개 파일 drift0, 반영 후 allowlist 밖 baseline 변경0과 검증본 SHA 일치를 확인했습니다.

[증거 manifest](../../local/finance-finlife-migration-20261011/evidence-manifest.json), candidate-source.patch, baseline-source/, 각 red/green 및 최종 검사 log/result JSON, migrated-runtime-summary.json에 재현 근거가 있습니다. work/local은 ignored입니다. 새 임시 DB와 원본 trace는 위 격리 base에 그대로 보존하며 실제 사용자 데이터는 포함하지 않습니다. trace에는 일회성 테스트 세션이 있어 공개용 증거 사본으로 옮기지 않았고 SHA와 위치만 기록했습니다.

재현 명령은 해당 격리 base의 run.py로 실행합니다. 핵심 명령은 corepack pnpm exec vitest run tests/finlife-sqlite-identity-migration.test.ts tests/finlife-identity-migration-cli.test.ts --maxWorkers=3입니다. migrated-runtime.mts는 매번 새 합성 legacy DB를 만들고 canonical writer로 적용한 뒤 공식 Playwright config/desktop launcher를 사용합니다. evidence-only snapshot replay test는 보존된 공개 .data를 필요로 하므로 원본의 일반 tests에는 추가하지 않았습니다.

적용한 workflow: Superpowers systematic-debugging, test-driven-development, verification-before-completion과 관련 설계·계획 지침, planning-gate-selector, work-log-closeout. 타깃 red→green·실제 SQLite/브라우저 증거로 판정했습니다.

## 남은 조건

지원하지 않는 구형 컬럼/제약, 회사·상품군이 불분명하거나 과거 오연결된 데이터는 명시적 BLOCKED이며 승인된 별도 조사·정정이 필요합니다. 이번 절차가 이미 덮어쓴 기록이나 새 schema 적용 후 저장분의 무손실 downgrade를 복구하지는 않습니다.

Windows-native 파일 ACL·전원 손실·실제 설치/업데이트는 미검증입니다. 실제 사용자 DB 이전과 기존 설치본 교체는 실행하지 않았으며 별도 대상 확인과 승인이 필요합니다. PostgreSQL 이전도 범위 밖입니다.

연금·braces·EXIM 차단과 최초 간헐 빈 화면의 ROOT_CAUSE_OPEN을 유지합니다. 복구 기능은 이번 production 회귀10개로 MITIGATION_PASS를 유지했으며 최초 결함을 FIXED라고 표현하지 않습니다.
