# 2026-07-10 Issue #197 FINLIFE inventory drift 관측성

## 연결 Issue

- 기존 ownership/freshness Issue: https://github.com/hsnasforum/financeproject/issues/197
- active/prune migration follow-up: https://github.com/hsnasforum/financeproject/issues/206

## 변경 파일

- `docs/finlife-sync.md`
- `scripts/finlife_persistence.d.mts`
- `scripts/finlife_persistence.mjs`
- `scripts/finlife_sync.mjs`
- `tests/finlife-sync-persistence.test.ts`
- `work/7/10/2026-07-10-finlife-inventory-drift-observability.md`

## 사용 skill

- `finance-skill-routing`: FINLIFE 외부 데이터 변경에 필요한 조건부 skill 조합 확인
- `dart-data-source-hardening`: 부분 실패, provenance, freshness와 query availability 불변 조건 점검
- `planning-gate-selector`: script/DB evidence 변경에 맞는 focused test, lint, full test, build 선택
- `work-log-closeout`: 변경·검증·계약 영향·후속 migration 경계 기록
- `manager` subagent: 첫 요청은 제한 시간 내 결과 없이 종료했고, 재요청 결과로 관측성 PR과 migration Issue를 4단계로 분리
- `analyzer` subagent: stale 고우선순위 row의 비대칭 cross-kind blocker와 signed drift 필요성 확인
- `tester` subagent: direct Prisma mock, evidence 보존, status/onlyNew 불변 테스트 세트 제안
- `documenter` subagent: Favorite/ExternalProductMatch 보존을 포함한 Issue #206 초안 작성
- `reviewer` subagent: same-kind duplicate가 signed delta를 음수로 오탐하는 P2와 closeout 검증 구분 P3를 발견했고 둘 다 수정 후 focused/full gate 재실행

## 변경 이유

- 마지막 완료 run의 fetched/upserted count와 실제 `Product(kind)` 누적 inventory가 달라도 기존 evidence만으로는 차이를 직접 확인하기 어려웠습니다.
- upstream에서 사라진 row를 바로 prune하면 Favorite와 ExternalProductMatch 참조 및 cross-kind priority가 깨질 수 있어, query나 schema를 바꾸기 전에 비파괴 관측값이 필요했습니다.
- stale 고우선순위 row가 lower-priority 활성 상품을 막으면 stored inventory가 fetched count보다 작아질 수 있으므로 양수 차이뿐 아니라 signed 차이를 남겨야 했습니다.

## 핵심 변경

- FINLIFE kind DB 반영 직후 `Product.count({ where: { kind } })`를 best-effort로 읽습니다.
- 완료 증거 `lastRun`에 `candidateItems`, `inventoryItems`, signed `inventoryDeltaItems`, `staleCandidateItems`를 내부 필드로 기록합니다.
- same-kind 중복 code는 후보 수와 signed delta 계산 전에 제거해 음수 drift 오탐을 막습니다.
- count 조회가 실패하면 inventory 계열 세 필드를 `null`로 남기고 이미 성공한 Product write와 sync 완료를 실패로 바꾸지 않습니다.
- CLI 완료 로그에 네 관측값을 출력하되 status 응답과 unified query filter에는 연결하지 않습니다.
- active/prune schema와 visibility 전환은 별도 Issue #206으로 분리했습니다.

## 실행한 검증

- `node --check scripts/finlife_persistence.mjs`: PASS
- `node --check scripts/finlife_sync.mjs`: PASS
- 변경 파일 ESLint: PASS
- focused FINLIFE/status/onlyNew test: PASS, 6 files / 39 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, compile/TypeScript/250 static pages
- reviewer 수정 후 `lint -> test -> build` 연속 최종 재실행: PASS
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- 격리 SQLite replay 1차: fetched 2, inventory 2, delta 0, stale candidate 0
- 같은 DB replay 2차: fetched 1, inventory 2, delta 1, stale candidate 1, 기존 row 삭제 없음
- cross-kind 격리 replay: saving owner 1건 뒤 같은 code의 deposit run이 skip 1, deposit inventory 0, delta -1

## 미실행 검증

- data-source E2E: public route, selector, response, query semantics를 변경하지 않아 실행하지 않음
- FINLIFE live upstream smoke: 외부 상태 대신 deterministic replay 3개 경로로 검증
- planning 전용 complete/compat/regress gate: planning 코드 영향 없음
- raw `tsc --noEmit`: production build의 TypeScript 단계로 대체
- GitHub Actions: PR 생성 전이라 미실행

## 계약 영향

- Public URL/API/HTTP 응답 shape: 변경 없음
- source status의 `counts`, `lastRun` public projection, freshness: 변경 없음
- unified Product query filter, `onlyNew`, `changedSince`, sort: 변경 없음
- DB schema/migration: 변경 없음
- Product/Provider/ProductOption upsert 및 prune semantics: 변경 없음
- Prisma query: 각 kind sync 성공 뒤 best-effort `Product.count({ where: { kind } })` 1회 추가
- DB write: 기존 `ExternalSourceSnapshot.metaJson.lastRun`에 내부 관측 필드 4개 추가
- cache/revalidation: 변경 없음
- package script: 변경 없음
- CLI stdout: inventory 관측값 4줄 추가

## 남은 리스크

- aggregate 수치만으로 stale row의 code나 정상 cross-kind owner와 stale blocker를 구분할 수 없습니다.
- count 시점에 다른 process가 같은 Product inventory를 바꾸면 일시적인 delta가 기록될 수 있습니다.
- count 조회 실패는 의도적으로 sync 성공을 유지하므로 관측값이 `null`일 수 있습니다.
- 실제 운영 populated DB의 kind별 drift와 Favorite/ExternalProductMatch 참조 수는 확인하지 못했습니다.
- active set visibility, cross-kind owner 재결정, soft-inactive/migration은 Issue #206 범위입니다.

## 롤백 기준

- inventory count 실패가 Product sync 또는 snapshot 완료를 실패로 바꾸는 경우
- 내부 관측 필드가 public status/API 응답이나 query filter에 연결되는 경우
- Product prune, kind 변경, cache invalidation 같은 비관측 동작이 발생하는 경우
- CLI/package entrypoint 계약이 달라지는 경우

## 다음 라운드 우선순위

1. populated DB와 최신 snapshot/dump를 read-only로 대조해 code 단위 blocker와 참조 보유 stale 후보를 확인합니다.
2. Issue #206에서 soft-inactive 또는 sidecar ownership, 이전 active set visibility, migration/rollback을 설계합니다.
3. FINLIFE 이후 product/catalog/recommend 구조 리스크를 최신 main 기준으로 재분류합니다.
