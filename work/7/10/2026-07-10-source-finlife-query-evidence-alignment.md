# 2026-07-10 Issue #197 FINLIFE query 완료 증거 정렬

## 변경 파일

- `docs/finlife-sync.md`
- `src/lib/finlife/completionEvidence.ts`
- `src/lib/sources/status.ts`
- `src/lib/sources/unifiedLoaders.ts`
- `tests/finlife-unified-only-new-evidence.test.ts`
- `tests/sources-status.test.ts`
- `work/7/10/2026-07-10-source-finlife-query-evidence-alignment.md`

## 사용 skill

- `finance-skill-routing`: FINLIFE query/freshness 변경에 필요한 최소 skill 조합 선택
- `dart-data-source-hardening`: stale, snapshot-only refresh, evidence missing/error fallback 점검
- `planning-gate-selector`: focused test, lint, 전체 test, build, data-source E2E 검증 범위 선택
- `work-log-closeout`: 실제 재현·live/replay 검증·계약 영향·잔여 리스크 정리
- `manager` subagent: 남은 #197 범위를 실증 검증과 정책 합의 필요 항목으로 분리
- `reviewer` subagent: 정적 검토를 요청했으나 제한 시간 내 결과를 반환하지 않아 종료, PASS 판정에 사용하지 않음

## 변경 이유

- unified FINLIFE 상품 query는 Prisma `Product`를 읽지만 `onlyNew`는 최신 file snapshot `generatedAt`을 사용했습니다.
- DB 완료 뒤 runtime snapshot-only refresh가 실행되면 DB는 그대로인데 snapshot 기준만 전진해 `onlyNew` 결과와 status count가 실제 query 저장소에서 이탈했습니다.
- 격리 재현에서 Prisma 상품 2건을 유지한 채 mock snapshot이 3건으로 전진하자 `onlyNew`는 2건에서 0건, status count는 2건에서 3건으로 바뀌었습니다.

## 핵심 변경

- FINLIFE `ExternalSourceSnapshot` 완료 증거 read와 legacy/missing/error 판정을 공용 reader로 분리했습니다.
- `onlyNew`는 `completionState=complete` 증거의 `snapshotGeneratedAt`을 우선하고, 증거가 없거나 구형이면 기존 file snapshot 시각으로 fallback합니다.
- source status count는 complete evidence의 `lastRun.fetchedItems`를 우선해 snapshot-only refresh가 완료 DB sync의 count를 덮지 못하게 했습니다.
- `db-complete`는 기존 snapshot 기준을 유지하고, evidence read 오류는 query/status 전체 실패 대신 기존 fallback과 안전한 상태를 유지합니다.
- public 응답 필드는 추가하거나 제거하지 않았습니다.

## 검증

- 격리 DB 준비 1차 `DATABASE_URL=file:/tmp/financeproject-finlife-197-replay-20260710-2017.db corepack pnpm prisma db push --skip-generate`: FAIL, 현재 Prisma CLI가 `--skip-generate`를 지원하지 않음
- 격리 DB 준비 재실행 `DATABASE_URL=file:/tmp/financeproject-finlife-197-replay-20260710-2017.db corepack pnpm prisma db push`: PASS
- replay `DATABASE_URL=file:/tmp/financeproject-finlife-197-replay-20260710-2017.db node scripts/finlife_sync.mjs --kind=deposit --fromFile=tests/fixtures/finlife_deposit.normalized.json`: PASS
  - Provider 2, Product 2, ProductOption 3
  - `completionState=complete`, provenance `replay`, marker 제거
- 변경 전 격리 재현: runtime mock snapshot-only refresh 뒤 Product 2, snapshot 3, unified 전체 2, `onlyNew` 0, status count 3
- 변경 후 같은 격리 상태 재검증: unified 전체 2, `onlyNew` 2, status count 2
- live smoke `DATABASE_URL=file:/tmp/financeproject-finlife-197-live-20260710-2032.db node scripts/finlife_sync.mjs --kind=deposit --maxPages=1 --topFinGrpNo=020000`: PASS
  - upstream deposit 상품 37, 옵션 146
  - DB Product 37, ProductOption 146, completion evidence `complete/live`
  - unified 전체 37, `onlyNew` 37, status count 37, `isFresh=true`
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/finlife-unified-only-new-evidence.test.ts tests/sources-status.test.ts tests/finlife-unified-refresh-contract.test.ts tests/finlife-sync-persistence.test.ts`: PASS, 4 files / 25 tests
- 최종 focused 재검증 같은 명령: PASS, 4 files / 26 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc:data-sources`: PASS, 1 test
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- reviewer subagent: 제한 시간 내 결과 없음, 메인에서 `db-complete` onlyNew fallback 테스트 공백을 확인해 보강

## 계약 영향

- Public URL/API/HTTP 응답 shape 변경 없음.
- FINLIFE status의 기존 `counts` 값 의미는 file snapshot 최신 건수에서 마지막 완료 DB sync의 fetched item 수 우선으로 변경됩니다.
- unified `onlyNew` query semantics는 완료 증거가 있는 설치에서 변경됩니다. 최신 file snapshot이 아니라 실제 Prisma `Product` 반영과 같은 sync의 snapshot 수집 시각을 기준으로 `Product.createdAt`을 필터링합니다.
- evidence가 없거나 구형 evidence에 `snapshotGeneratedAt`이 없으면 기존 file snapshot 기준을 유지합니다.
- DB schema, migration, Prisma write, product upsert/prune 동작 변경 없음.
- Prisma read는 `onlyNew=1` FINLIFE query에 `ExternalSourceSnapshot.findUnique` 1회가 추가됩니다. 일반 query와 status의 read 횟수는 변경하지 않습니다.
- HTTP cache/revalidation 및 애플리케이션 cache 동작 변경 없음.

## 남은 리스크

- runtime `runFinlifeSnapshotSync`는 계속 file snapshot만 갱신하고 Prisma `Product`를 갱신하지 않습니다. 완료 증거 기반 소비자는 보호되지만 snapshot 자체의 이중 ownership은 남습니다.
- `Product` sync는 upstream에서 사라진 상품을 prune하지 않습니다. status count는 마지막 완료 sync fetched count이며 현재 DB inventory count와 다를 수 있습니다.
- `onlyNew`는 기존 `Product.createdAt` 의미를 유지하므로 재등장 상품이나 prune/active 정책까지 표현하지 못합니다.
- evidence read 오류 시 availability를 위해 file snapshot 기준으로 fallback하므로 장애 중 snapshot-only refresh가 실행되면 일시적 기준 이탈 가능성이 남습니다.
- deposit/saving 외 FINLIFE kind는 unified query/status 범위 밖입니다.
- 롤백 기준은 complete evidence가 있는데도 snapshot-only refresh 뒤 `onlyNew` 또는 status count가 전진하는 경우, evidence missing/error fallback이 query/status를 실패시키는 경우, 일반 query 결과나 cache 동작이 바뀌는 경우입니다.

## 다음 라운드 우선순위

1. runtime `refresh=1`이 Prisma 상품 DB와 completion evidence를 함께 갱신하도록 CLI persistence 경계를 공용화합니다.
2. Product prune/active 정책을 별도 Issue로 합의해 fetched count와 누적 DB inventory 차이를 해소합니다.
3. DB write ownership 또는 Product query 결과 집합이 바뀌는 변경은 Issue #197에 영향과 롤백 기준을 먼저 남깁니다.
