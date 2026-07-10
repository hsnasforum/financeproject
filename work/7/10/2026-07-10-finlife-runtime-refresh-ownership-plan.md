# 2026-07-10 Issue #197 FINLIFE runtime refresh ownership 정렬

## 변경 파일

- `docs/finlife-sync.md`
- `scripts/finlife_persistence.d.mts`
- `scripts/finlife_persistence.mjs`
- `scripts/finlife_sync.mjs`
- `src/lib/finlife/persistentSync.ts`
- `src/lib/finlife/snapshot.ts`
- `src/lib/finlife/syncRunner.ts`
- `src/lib/sources/unifiedLoaders.ts`
- `tests/finlife-runtime-persistence.test.ts`
- `tests/finlife-sync-entrypoint-contract.test.ts`
- `tests/finlife-sync-persistence.test.ts`
- `tests/finlife-sync-upstream-failure.test.ts`
- `tests/finlife-unified-refresh-contract.test.ts`
- `work/7/10/2026-07-10-finlife-runtime-refresh-ownership-plan.md`

## 사용 skill

- `finance-skill-routing`: FINLIFE runtime/data-source 변경에 필요한 최소 skill 조합 선택
- `dart-data-source-hardening`: upstream 실패, mock/fallback, marker, partial persistence, freshness 경계 점검
- `planning-gate-selector`: script, server runtime, data-source UI 영향에 맞는 검증 세트 선택
- `work-log-closeout`: 실제 변경·검증·계약 영향·잔여 리스크 정리
- `manager` subagent: 공용 코어 추출, runtime 전환, 동시성 중단 조건을 4단계로 분해
- `reviewer` subagent: 정적 리뷰를 요청했으나 제한 시간 내 결과를 반환하지 않아 종료, PASS 판정에 사용하지 않음

## 변경 이유

- unified FINLIFE query는 Prisma `Product`를 읽지만 `refresh=1`은 file snapshot만 갱신해 사용자 query 저장소와 write ownership이 달랐습니다.
- PR #204가 read 기준을 완료 증거로 보호했어도 runtime refresh 자체가 DB를 갱신하지 않는 구조적 차이는 남았습니다.
- CLI와 runtime이 같은 persistence 순서를 사용하면서 public response shape, DB schema, cache를 유지할 필요가 있었습니다.

## 핵심 변경

- CLI의 Product upsert, completion evidence, marker, snapshot 순서를 side-effect 주입형 `finlife_persistence.mjs` 공용 코어로 추출했습니다.
- FINLIFE 수집을 `collectFinlifeSnapshot`으로 분리하고 기존 snapshot-only helper의 반환 계약은 유지했습니다.
- runtime `refresh=1`은 verified live 수집만 공용 코어의 `DB -> db-complete -> snapshot -> complete` 순서로 반영합니다.
- mock/fallback 수집은 Product, evidence, snapshot 어디에도 쓰지 않고 기존 query 데이터를 유지합니다.
- 같은 process의 같은 kind refresh는 singleflight로 합치며, 수집 뒤 marker를 다시 확인해 CLI/recovery 작업과의 충돌 범위를 줄였습니다.
- refresh 실행 필요 여부도 complete evidence를 우선해 기존 snapshot-only 시각이 stale DB를 가리지 못하게 했습니다.
- CLI package script와 기존 `finlife_sync.mjs` export는 유지했습니다.

## 검증

- `node --check scripts/finlife_persistence.mjs`: PASS
- `node --check scripts/finlife_sync.mjs`: PASS
- 변경 파일 ESLint: PASS
- focused `vitest` 최종: PASS, 10 files / 46 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc:data-sources`: PASS, 1 test
- `corepack pnpm multi-agent:guard`: 1차 FAIL, PR #204 closeout의 다음 라운드 섹션 누락 보강 후 PASS
- `git diff --check`: PASS
- 격리 mock runtime: `UNVERIFIED_SOURCE`, Product 0, evidence 0, snapshot 없음, marker 없음
- 격리 verified live runtime: Product 37, ProductOption 146, `complete/live`, unified 전체 37, `onlyNew` 37, status count 37, snapshot 생성, marker 제거
- 격리 CLI replay: Product 2, ProductOption 3, `complete/replay`
- raw `tsc --noEmit`: FAIL, 저장소 기존 planning test type 오류와 함께 최초 FINLIFE test type 오류 확인
- FINLIFE test type 오류는 수정했고 production build의 TypeScript 단계는 PASS했습니다.
- reviewer subagent는 제한 시간 내 결과가 없어 종료했고, 메인 정적 검토에서 refresh decision의 file snapshot 잔존 문제를 찾아 complete evidence 기준으로 추가 수정했습니다.

## 계약 영향

- Public URL/API/HTTP 응답 shape 변경 없음.
- `refresh=0` 및 일반 unified Product read/query semantics 변경 없음.
- `refresh=1` write semantics는 변경됨: verified live 성공 시 Prisma `Provider`/`Product`/`ProductOption`, `ExternalSourceSnapshot` completion evidence, file snapshot을 함께 갱신합니다.
- DB schema, migration, Product query filter, prune 동작 변경 없음.
- HTTP cache key, revalidation, 애플리케이션 cache 동작 변경 없음.
- mock/fallback은 더 이상 runtime snapshot에도 기록하지 않습니다.

## 남은 리스크

- Product/Option upsert 전체는 하나의 DB transaction이 아니므로 중간 실패 시 일부 row가 먼저 반영되고 failed marker가 남을 수 있습니다.
- process-local singleflight는 같은 Node process만 보호합니다. 별도 CLI/process와의 경합은 수집 후 marker 재확인으로 줄였지만 원자적 cross-process lock은 아닙니다.
- explicit `refresh=1` 요청은 upstream 전체 수집과 DB write가 끝날 때까지 대기하므로 기존 snapshot-only 경로보다 persistence 지연이 추가됩니다.
- Product prune/active 계약이 없어 upstream에서 사라진 상품은 DB에 남습니다.
- deposit/saving 외 kind는 runtime unified refresh 범위 밖이며 CLI 전용입니다.
- 롤백 기준은 mock/fallback이 DB 또는 snapshot에 기록되는 경우, marker가 있는데 runtime persistence가 시작되는 경우, CLI replay 계약이 달라지는 경우, public response/cache가 바뀌는 경우입니다.

## 다음 라운드 우선순위

1. Product prune/active 정책을 별도 Issue로 합의하고 status fetched count와 DB inventory 차이를 해소합니다.
2. 필요하면 kind별 cross-process lock을 marker write보다 강한 원자적 경계로 보강합니다.
3. FINLIFE 이후 legacy planner, route policy, product/catalog/recommend 구조 리스크를 최신 main 기준으로 재분류합니다.
