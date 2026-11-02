# FINLIFE 연금·EXIM 공식 계약 확인 및 환율 수집 복구

기록: 2026-10-11 02:34 KST. 기준: [이전 SQLite 마이그레이션 기록](2026-10-11-finlife-legacy-sqlite-migration.md). main / `e296a529f1e3d48c224aee36ca1b9bf65ee0cf44`. 기존 작업과 증거를 보존한 이번 delta입니다.

## 결과

- **EXIM_CONTRACT_PASS / EXIM_REFRESH_PASS / SOURCE_APPLIED**: 공식 AP01 계약과 실제 23개 환율을 확인하고 두 provider 및 수집 CLI를 수정했습니다. 원천 기준일은 **2026-10-08**, 실제 수집 시각은 **2026-10-10T17:23:31.544Z**입니다. `exchange_snapshot.json`은 환율 캐시가 아닌 수집 receipt입니다.
- **PENSION_BLOCKED**: endpoint·그룹·기본 페이지/필드 계약은 확인했지만 공식 원문이 계약에 어긋납니다. 유효한 전체 최신 연금 데이터와 원천 내부 장애 원인은 미확정입니다. 기존 연금343개를 그대로 보존했습니다.
- **DATA_DOCTOR_FAIL / RELEASE_NOT_RUN**: 기존 대출 schema baseline 불일치7건, 연금 stale·만료 예외, 기존 braces 보안 차단을 유지합니다. 전체 release를 반복하지 않았습니다.
- 이전 MIGRATION_READY_PASS·DATA_PRESERVATION_PASS 및 FINLIFE 5개 상품군/Gov24 검증 자료를 보존했습니다. 마이그레이션 소스·Prisma 스키마·사용자 DB·설치본에는 이번 변경을 적용하지 않았습니다. 기존 간헐 빈 화면의 ROOT_CAUSE_OPEN도 바뀌지 않았습니다.

## 사용 skill 및 환경

Superpowers using-superpowers, systematic-debugging, test-driven-development(좋은 테스트 작성 참조 포함), verification-before-completion; dart-data-source-hardening, planning-gate-selector, work-log-closeout을 사용했습니다.

신규 격리 사본: `/tmp/finance-official-contract-20261011-fkgvjs76/workspace`. bwrap 파일시스템/PID 격리, Node22.22.2·pnpm9.15.9·Next16.3.8·React19.2.3. 새 state/database/finance.db와 별도 Planning root만 사용했습니다. 오염된 예전 검증 DB는 재사용하지 않았습니다. 정상 검사에서는 네트워크도 격리했습니다. 공식 조회 명령에서만 선택한 provider 키를 메모리로 전달했고, 실제 키의 증거 파일 노출 검사 결과0건입니다. 사용자 DB·기존 설치본·전역 설정 변경, commit/push/배포는 실행하지 않았습니다.

## 확인된 원인과 최소 수정

### EXIM

[공식 현재환율 API 명세](https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2&viewtype=C), 수정일2026-04-28를 Codex 브라우저 DOM에서 확인했습니다. endpoint는 `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`, `data=AP01`, 날짜는 `searchdate`입니다. 기존 www 도메인의 병행 가동 중단일2026-04-30도 같은 페이지 변경 이력에서 확인했습니다. 정상 응답은 result1과 통화/환율 필드를 제공하며 **날짜 필드는 없습니다**. 비영업일 또는 당일 게시 전에는 null이 올 수 있습니다.

기존 코드가 정상 undated 응답에도 `deal_bas_dt`를 요구해 수집을 거부하고, 별도 FX 경로는 이를 빈 live 성공으로 반환했습니다. FX 기본 endpoint도 구 도메인이었습니다. 공통 validator와 두 provider, 수집 CLI에 검증된 요청 날짜를 전달했습니다. AP01/result1/canonical cur_unit·deal_bas_r를 확인하고, 거래환율 tts/ttb 대용·중복 통화·잘못된 날짜/미래일·날짜 충돌·비정상 수치·malformed payload를 거부합니다. legacy dated no-context normalizer의 기존 별칭은 유지합니다. 기존 mock 대체는 degraded 표시 계약을 유지합니다.

공식 [날짜별 환율 화면](https://www.koreaexim.go.kr/wg/HPHKWG057M01)에서 10월8일 23통화, 10월9·10·11일 데이터 없음을 직접 조회했습니다. 10월8일 AP01 응답의 23개 기준환율이 공식 화면과 모두 일치했습니다. 진단1회와 canonical 수집1회, 합계2회 AP01 조회를 수행했고 두 응답 SHA-256이 같습니다. 이전 영업일을 임의 역산하거나 응답에 없는 날짜를 현재 시각으로 만들지 않았습니다.

수집 명령에 `--exchange-date=YYYYMMDD`를 추가했습니다. 명시 날짜만 정확히 조회하고 빈 응답에서 다른 날짜로 재시도하지 않습니다. 별도 공개 exchange route의 기존 날짜별 실제 재조회 정책은 변경하지 않았습니다. partial-write/rename 오류 주입으로 기존 receipt 손상을 재현하고 동일 디렉터리 임시 파일→rename으로 보존하도록 수정했습니다. 실제 갱신 후 EXIM 예외만 제거했으며 예외 날짜를 늘리지 않았습니다.

`docs/schema-baselines.json`의 exchange `asOf:null` 표본은 정상 수집의 string 계약과 맞지 않았습니다. 검증된 receipt로 canonical generator를 별도 디렉터리에서 실행하고 exchange 항목만 string으로 갱신했습니다. 다른 상품의 schema 기준이나 검사 코드는 완화하지 않았습니다.

### FINLIFE 연금

[현행 연금 공식 문서](https://finlife.fss.or.kr/finlife/api/anntySvingsApi/list.do?menuNo=700054)의 JSON/XML은 `annuitySavingProductsSearch`, prdt_div P, 보험050000·금융투자060000, 요청pageNo와 응답now_page_no를 명시합니다. base/option 결합 키는 회사·상품·공시월입니다. 연금 종류/상품 유형 및 연금 옵션 필드도 확인했습니다. 문서 상단 URL과 option 설명표의 다른 상품 예제 혼입은 실제 JSON/XML과 구분했습니다. 공식 201510 예제5개/옵션240개는 기존 엄격 검사를 통과하며 최신 데이터로 사용하지 않았습니다.

| 그룹 | 2026-10-11 직접 원문 | 판정 |
| --- | --- | --- |
| 050000 | P/정상 코드, 총46·최대5·현재1페이지, 대출 필드가 있는4개/옵션4개, 공시월202609 | 연금 schema/kind mismatch |
| 060000 | P/정상 코드, 총297·최대30·현재1페이지, 본문0개/옵션0개 | 빈 페이지와 총 건수 모순 |

각 그룹에서 기존 pageSize 포함 요청1회와 문서에 있는 파라미터만 사용한 요청1회를 비교했습니다(총4회). 그룹별 응답 해시가 같아 미문서화 pageSize가 이번 혼입/빈 본문의 원인이라는 가설은 배제됐습니다. 이전 page1→page24는 이번에는 재현되지 않았습니다. Finance 정규화 전 직접 원문부터 오류가 있으므로 제품의 페이지 변환/종류 강제 분류 문제로 단정하지 않았습니다.

보험 응답 제출 시각 필드는 202602191042·202609181500·202609161600·202608201000이지만 상품 종류가 맞지 않아 유효 연금 이력으로 승인하지 않았습니다. 금융투자는 본문 자체가 없어 원천 공시월/제출 시각을 확인할 수 없습니다. 첫 페이지부터 무효여서 전체 페이지 추가 조회/저장을 중단했습니다.

공식 CLI에 두 실패 원문을 재생했을 때 각 exit1과 integrity 실패를 확인했습니다. 그 전후 새 SQLite, 예금39·적금59·신용44·주담34·전세41·연금343 및 Gov24 스냅샷 SHA-256은 모두 같았습니다. 실패 marker는 증거에 보존했습니다. 연금 제품 코드/스냅샷은 수정하지 않았습니다.

## 변경 파일

- `src/lib/publicApis/providers/exchange.ts`
- `src/lib/publicApis/providers/fx.ts`
- `src/lib/publicApis/providers/exchangeNormalization.ts`
- `src/lib/publicApis/providers/exchangeNormalization.mjs`
- `src/lib/publicApis/providers/exchangeNormalization.d.mts`
- `scripts/warm_if_stale.mjs`
- `tests/exim-exchange-normalize.test.ts`
- `tests/exchange-error-codes.test.ts`
- `tests/public-api-provenance.test.ts`
- `tests/fx-ap01-contract.test.ts`
- `tests/warm-if-stale-env.test.ts`
- `docs/exim-exchange-contract.md`
- `docs/finlife-identity.md`
- `docs/package-scripts.md`
- `docs/schema-baselines.json`
- `config/data-freshness-exceptions.json`
- `.data/exchange_snapshot.json`

증거 및 재현 스크립트: `work/local/finance-financial-data-contract-20261011/`. `source-promotion.json`은 원본4481개 사전 해시 검사, 반영17개와 나머지4468개 불변, 검증 사본과 반영본의 해시 일치를 기록합니다. 신규 파일4개가 17개에 포함됩니다. `.next/BUILD_ID`: `JXWbdwCDvo_X7tCeXHVmV`. 원본의 기존 미커밋 변경을 포함한 사본에서 검증했습니다.

## 실제 검증

모든 실행 command·exit·시간은 각 `.result.json`/`.log`에 보존했습니다.

| 검사 | 결과 및 증거 |
| --- | --- |
| TDD | warm 최초23개 중10실패→수정 후 통과, 쓰기/rename/AP02 회귀3실패→통과. provider 최초87개 중56실패, canonical 필드 대용8실패, scalar3실패→최종 통과 |
| `vitest run` FINLIFE identity/live/sync-partial/persistence 4파일 | 34/34 PASS (`finlife-regression`) |
| `vitest run` EXIM normalizer/error/FX/provenance/schema-error/API-error 6파일 | 105/105 PASS (`exim-agent-final-green-2`) |
| `vitest run` warm/fx-status/provider/schema-error/API-error/diagnostics/freshness 7파일 | 58/58 PASS (`exchange-regression`); 앞선 검사와5개 중복, 전체 고유15파일192개 PASS |
| `corepack pnpm typecheck` | 초기 새 diagnostics enum 타입3건 오류→기존 contract 값으로 수정→PASS (`typecheck-final`), 타입 약화 없음 |
| 변경11개 코드/테스트 ESLint 및 mjs 문법 | PASS (`exim-agent-final-lint`, `warm-lint`, syntax 결과) |
| `corepack pnpm build` | PASS (`production-build`). Next middleware/Edge process.cwd 관련 경고는 보존 |
| production E2E wrapper, workers1/retries0 | 6/6 PASS (`production-exchange-e2e`): 기존 FX freshness2·dashboard 보조도구2 + 증거 전용 실제 원문 재생2 |
| production 런타임 원문 재생 | 공식 desktop launcher/standalone에서 두 실제 API 경로가 10월8일/23통화 또는 환산값을 반환. USD1000=1,339,200 KRW, JPY50000≈423,730 KRW. 10월10일 null은 NO_DATA, 당일 빈 응답은 화면 오류이며 성공 합계 없음. 페이지 예외0. 외부 네트워크 실조회와 구분한 offline replay |
| `corepack pnpm warm:if-stale --exchange-only --exchange-date=20261008` | 실제 공식 수집PASS. 기준일2026-10-08/23건/실제 generatedAt, 공식 화면과 전 통화 일치 (`exim-official-warm`, `exim-refresh-verification.json`) |
| 연금 official sample·실패 원문 CLI·실제 환율 원문 validator 재생 | PASS (`pension-sample-check`, `pension-contract-replay`, `exim-captured-replay-final`) |
| `corepack pnpm data:doctor` | FAIL 유지. 기존 대출 baseline7건이며 원본 receipt를 사용한 독립 비교도 같은7건 (`baseline-schema-check`, `data-doctor-final`) |
| strict freshness | FAIL 유지: 만료된 연금 예외. 예외 없는 진단 inventory는 fresh7·stale1(연금)·missing0·invalid0 (`freshness-strict`, `freshness-inventory-final`) |
| `git diff --check` | PASS |

환율 actual replay의 첫 IDR exact-float assertion은 7.49/100의 IEEE-754 표현차로 실패했고, 1e-14 허용오차의 독립 기대값으로 고쳐 통과했습니다. 금융 계산 코드는 바꾸지 않았습니다. 실패 로그를 삭제하지 않았습니다. 브라우저6개 중2개는 증거 전용 spec이며 원본 테스트에 합산 반영하지 않았습니다. 정규 회귀 테스트는 위 변경파일에 포함됩니다.

## 남은 출시 차단·검증 범위

1. **연금**: 정상 상품 종류/옵션/페이지 완주가 입증되는 공식 원문이 필요합니다. 기존343개는 stale이므로 최신 공시로 사용할 수 없습니다. upstream 내부 원인, 과거page24 원인은 OPEN입니다.
2. **기존 braces**: 해결/무시/감사 우회를 하지 않았으며 기존 보안 BLOCKED를 유지합니다.
3. **기존 대출 schema baseline7건**: credit dcls_end_day null→null|string 및 대출3종 meta.duplicateAcrossGroupsCount/lastUpstreamStatus 누락. 이번 원본과 사본에서 동일하게 재현됐습니다. 검증된 대출 데이터를 변경하거나 모든 schema 기준을 현재 출력으로 일괄 승인하지 않았습니다. 해당 계약의 별도 검토가 필요합니다.
4. 전체 release, 실제 Windows 설치본 교체/업데이트, 운영 DB 이전 및 새 source의 네이티브 Windows 실행은 미실행입니다. 현재 차단을 전체 출시PASS로 처리하지 않습니다. EXIM receipt는 오프라인 환율 저장소가 아니며 다음 영업일의 실제 게시/수집 성공을 보장하지 않습니다.
