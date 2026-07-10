# 2026-07-10 Issue #197 FINLIFE persistence freshness 1차 보강

## 변경 파일

- `docs/finlife-sync.md`
- `scripts/finlife_cli_common.mjs`
- `scripts/finlife_sync.mjs`
- `scripts/finlife_sync_if_stale.mjs`
- `src/lib/finlife/snapshot.ts`
- `src/lib/sources/status.ts`
- `src/lib/sources/unifiedLoaders.ts`
- `tests/finlife-sync-attempt-marker.test.ts`
- `tests/finlife-sync-if-stale.test.ts`
- `tests/finlife-sync-persistence.test.ts`
- `tests/finlife-unified-refresh-contract.test.ts`
- `tests/sources-status.test.ts`
- `work/7/10/2026-07-10-source-finlife-persistence-freshness.md`

## 사용 skill

- `finance-skill-routing`: data-source freshness 작업에 필요한 최소 skill 조합 선택
- `dart-data-source-hardening`: partial failure, stale snapshot, safe status 안내와 기존 데이터 보존 점검
- `planning-gate-selector`: focused test, lint, build, data-source E2E 검증 범위 선택
- `work-log-closeout`: 실제 변경·검증·잔여 리스크를 한글 closeout으로 정리
- `github:github`: Issue #197의 현재 범위와 수용 기준 확인
- `manager` subagent: #197을 3~5단계로 분해하고 첫 persistence 경계 후보 제안
- `reviewer` subagent: fresh snapshot 오표시와 running marker 동시 실행 finding 검출 및 수정 후 재검토

## 변경 이유

- Issue https://github.com/hsnasforum/financeproject/issues/197 재검증 결과, CLI sync는 file snapshot을 먼저 교체한 뒤 Prisma 상품 DB를 갱신해 DB 실패 시 새 snapshot이 fresh로 남을 수 있었습니다.
- unified query는 Prisma `Product`를 읽지만 runtime refresh와 source status는 file snapshot을 기준으로 삼아 partial failure를 완료 상태로 오해할 여지가 있었습니다.
- public API, DB schema, Prisma query, cache를 바꾸지 않고 persistence 완료 여부만 안전하게 관측하는 첫 단계가 필요했습니다.

## 핵심 변경

- kind별 persistence를 `sync-attempt marker -> DB sync -> atomic snapshot write -> marker clear` 순서로 고정했습니다.
- DB 또는 snapshot 실패 시 marker에 안전한 error code를 남기고 CLI 오류에 `phase=db|snapshot` 근거를 유지합니다.
- `finlife:sync:if-stale`는 failed marker를 fresh snapshot보다 우선 재시도하고, running marker는 동시 실행을 피하려고 skip합니다.
- unified runtime refresh는 incomplete marker가 있는 동안 snapshot을 덮어쓰지 않으며 source status는 기존 shape 안에서 `isFresh=false`와 안전한 안내를 반환합니다.
- snapshot/DB/query/status의 현재 소유권, 6개 CLI kind와 2개 status kind 차이, 수동 복구 절차를 `docs/finlife-sync.md`에 문서화했습니다.

## 검증

- 변경 전 focused Vitest 6 files / 15 tests: PASS
- 최종 focused Vitest 10 files / 24 tests: PASS
- `node --check scripts/finlife_sync_if_stale.mjs`: PASS
- `corepack pnpm lint`: PASS, 최종 76.5초
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 최종 77.3초
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 186.3초
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc:data-sources`: PASS, 1 test, 23.1초
- reviewer 1차: fresh한 이전 snapshot이 실패를 가리는 High finding과 완료 시각/테스트 공백 Medium finding 확인
- reviewer 2차: running marker 자동 재시도 동시성 Medium finding 확인
- reviewer 최종: actionable finding 없음
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS, closeout 작성 전 확인
- 미실행: 실제 `pnpm finlife:sync`, 실제 `pnpm finlife:sync:if-stale`, production 배포 smoke, 전체 `corepack pnpm e2e:rc`, `corepack pnpm release:verify`
- 실제 FINLIFE sync는 upstream API와 로컬 상품 DB를 변경하므로 이번 dependency-injected 회귀 검증에서는 실행하지 않았습니다.

## 계약 영향

- Public URL/API/HTTP 응답 shape 변경 없음.
- DB schema와 Prisma query/query semantics 변경 없음.
- HTTP cache/revalidation 및 애플리케이션 cache 동작 변경 없음.
- FINLIFE snapshot JSON format 변경 없음.
- 새 내부 storage artifact `.data/finlife_<kind>_sync_attempt.json`이 추가되며 성공 시 제거되고 실패 또는 중단 시 유지됩니다.
- CLI kind별 write 순서는 snapshot-first에서 marker/DB/snapshot commit 순서로 변경됩니다.
- source status는 기존 optional `lastAttemptAt`/`lastError` 필드와 `isFresh`를 사용해 incomplete marker를 표시하므로 shape는 같지만 실패 상태 값은 더 보수적으로 바뀝니다.
- runtime `refresh=true`는 incomplete DB sync marker가 있으면 snapshot refresh를 skip합니다.

## 남은 리스크

- Prisma 상품 upsert와 option 교체는 아직 kind 전체 transaction이 아니므로 DB 중간 실패 시 일부 row가 먼저 반영될 수 있습니다. 이번 단계는 이를 성공으로 오표시하지 않고 재실행 근거를 남깁니다.
- process 강제 종료로 running marker가 남으면 자동 재시도하지 않습니다. 실제 process 종료를 확인한 뒤 수동 `pnpm finlife:sync`가 필요합니다.
- marker는 동시 실행을 관측하지만 OS-level lock은 아닙니다. 두 개의 직접 `pnpm finlife:sync` 실행을 동시에 시작하는 운영은 여전히 피해야 합니다.
- snapshot `generatedAt`은 upstream 수집 완료 시각이고 DB commit 시각이 아닙니다. unified `onlyNew` 기준과 DB-backed 완료 시각의 완전 정렬은 후속 과제입니다.
- runtime `runFinlifeSnapshotSync`는 여전히 file snapshot만 갱신하고 Prisma 상품 DB를 갱신하지 않습니다. Issue #197은 이 PR로 종료하지 않습니다.
- source status는 `deposit`/`saving`만 다루며 pension/loan snapshot status는 아직 노출하지 않습니다.
- 롤백 기준은 failed marker인데 `isFresh=true`가 되는 경우, running marker로 자동 중복 sync가 시작되는 경우, 기존 snapshot 유실, DB query/public response/cache 계약 변화입니다.

## 다음 라운드

1. Issue #197 연결 PR을 게시하고 최종 head의 리뷰, conflict, Actions job step 실행 여부를 확인합니다.
2. 이 PR은 Issue #197의 1차 persistence 경계로 남기고 Issue를 닫지 않습니다.
3. 다음 단계는 runtime snapshot refresh와 Prisma 상품 DB sync의 공용 adapter 또는 DB-backed completion evidence를 schema 변경 없이 분리 가능한지 최신 `main`에서 재검토합니다.
