# 2026-07-10 Issue #197 FINLIFE source status 완료 증거 정렬

## 변경 파일

- `docs/finlife-sync.md`
- `src/components/ProductListPage.tsx`
- `src/lib/sources/status.ts`
- `tests/product-list-freshness-contract.test.ts`
- `tests/sources-status.test.ts`
- `work/7/10/2026-07-10-source-finlife-status-evidence.md`

## 사용 skill

- `finance-skill-routing`: FINLIFE status/freshness 작업에 필요한 최소 skill 조합 선택
- `dart-data-source-hardening`: legacy, partial, mock, DB read failure fallback과 사용자 안내 점검
- `planning-gate-selector`: focused test, lint, 전체 test, build, data-source E2E 검증 범위 선택
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 다음 라운드 기준으로 정리
- `manager` subagent: source status read ownership을 4단계로 분해하고 중단 조건 제안
- `analyzer` subagent: ProductListPage, recommend, freshness banner의 status 값 소비 영향 검토
- `reviewer` subagent: 세 차례 리뷰에서 fallback/count/timestamp finding을 검출하고 수정 후 재검토

## 변경 이유

- PR #202가 FINLIFE CLI 완료 증거를 DB에 기록했지만 `/api/sources/status`는 계속 file snapshot 시각만 사용했습니다.
- 실제 사용자 상품 query는 Prisma `Product`를 읽으므로 runtime snapshot만 새로워진 상태를 DB sync 완료로 표시하지 않아야 합니다.
- public 응답 shape, DB schema, cache를 바꾸지 않고 `lastSyncedAt`/`isFresh`의 근거만 단계적으로 정렬할 필요가 있었습니다.

## 핵심 변경

- FINLIFE status는 `ExternalSourceSnapshot(sourceId=finlife, kind)`의 `completionState=complete`만 freshness 근거로 사용합니다.
- marker는 완료 증거보다 우선하며 `db-complete`, mock/fallback, completionRate 0.95 미만, hard-cap truncation은 fresh로 표시하지 않습니다.
- evidence가 없거나 evidence table이 없는 기존 설치는 file snapshot으로 fallback하되 같은 provenance/completion 기준을 적용합니다.
- 실제 DB read failure는 전체 status API를 500으로 만들지 않고 해당 FINLIFE row만 `isFresh=false`와 안전한 안내를 반환합니다.
- `Product` sync에는 prune 계약이 없으므로 public `counts`는 누적 DB inventory가 아닌 file snapshot item 수를 유지합니다.
- 상품 목록의 `기준 확인` 시각은 source status 완료 시각을 snapshot 수집 시각보다 우선합니다.

## 검증

- 변경 전 `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/sources-status.test.ts tests/freshness-summary.test.ts tests/data-freshness-banner-copy.test.tsx`: PASS, 3 files / 7 tests
- 최종 `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/sources-status.test.ts tests/freshness-summary.test.ts tests/data-freshness-banner-copy.test.tsx tests/product-list-freshness-contract.test.ts`: PASS, 4 files / 19 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc:data-sources`: PASS, 1 test
- reviewer 1차: table-missing fallback, Product count drift, synthetic `lastAttemptAt` finding 3건 확인 후 수정
- reviewer 2차: legacy partial/mock freshness, ProductListPage 기준 시각, closeout 공백 finding 3건 확인 후 수정
- reviewer 3차: actionable finding 없음
- 미실행: 실제 `pnpm finlife:sync`, 전체 `corepack pnpm e2e:rc`, production smoke
- 실제 sync는 외부 API와 DB/snapshot 쓰기를 수반하므로 이번 read-side status 변경에서는 실행하지 않았습니다.

## 계약 영향

- Public URL/API/HTTP 응답 shape 변경 없음.
- FINLIFE status의 기존 필드 값 의미는 변경됨: evidence가 있으면 `lastSyncedAt`, `isFresh`, `lastAttemptAt`, `lastRun`이 DB-backed 완료 증거를 사용합니다.
- `counts` 의미는 변경하지 않고 file snapshot item 수를 유지합니다.
- DB schema, migration, DB write 동작 변경 없음.
- Prisma read 동작은 변경됨: status 요청이 FINLIFE `deposit`/`saving`의 `ExternalSourceSnapshot`을 kind별로 조회합니다.
- unified Product query와 `onlyNew` query semantics 변경 없음.
- HTTP cache/revalidation과 애플리케이션 cache 동작 변경 없음.
- 상품 목록 카드의 `기준 확인` 시각은 source status 완료 시각을 우선합니다.

## 남은 리스크

- `Product` sync는 upstream에서 사라진 상품을 prune하지 않아 DB inventory count를 status count로 사용할 수 없습니다.
- unified `onlyNew`는 여전히 file snapshot `generatedAt`을 기준으로 Prisma Product를 필터링합니다.
- runtime `runFinlifeSnapshotSync`는 계속 snapshot만 갱신하고 Prisma 상품 DB를 갱신하지 않습니다.
- table-missing fallback은 SQLite 메시지 회귀 테스트를 추가했지만 PostgreSQL 오류는 정규식 분기만 정적 확인했습니다.
- evidence가 없는 매우 오래된 snapshot에 provenance/completion 필드가 없으면 안전하게 stale로 표시될 수 있습니다.
- 롤백 기준은 marker 또는 `db-complete`가 fresh가 되는 경우, mock/partial snapshot이 fresh가 되는 경우, status DB read 실패가 전체 API 500으로 번지는 경우입니다.

## 이번 라운드 완료 항목

- FINLIFE source status freshness 시점을 DB-backed 완료 증거로 정렬했습니다.
- legacy와 DB failure fallback을 유지하고 partial/mock 오표시를 회귀 테스트로 막았습니다.
- 상품 목록의 사용자 노출 기준 시점을 status 완료 시각과 맞췄습니다.

## 다음 라운드 우선순위

1. unified `onlyNew`를 DB 완료 증거로 옮길 때 `Product.createdAt` filter 의미가 어떻게 바뀌는지 별도 Issue/PR로 설계합니다.
2. DB inventory count를 authoritative하게 쓰려면 먼저 kind별 prune 또는 active/inactive 상품 계약을 합의합니다.
3. runtime snapshot refresh가 DB query를 갱신하지 않는 ownership 차이는 외부 API/DB write 범위 합의 후 별도 adapter로 다룹니다.
4. query semantics, DB schema, cache 변경이 필요하면 Issue #197에 breaking/migration 판단을 먼저 남깁니다.
