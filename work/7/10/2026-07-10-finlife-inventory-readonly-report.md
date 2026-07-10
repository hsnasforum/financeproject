# 2026-07-10 Issue #206 FINLIFE inventory read-only report

## 연결 Issue

- https://github.com/hsnasforum/financeproject/issues/206

## 변경 파일

- `docs/finlife-sync.md`
- `docs/package-scripts.md`
- `package.json`
- `scripts/finlife_inventory_report.mjs`
- `tests/finlife-inventory-report.test.ts`
- `work/7/10/2026-07-10-finlife-inventory-readonly-report.md`

## 사용 skill

- `finance-skill-routing`: FINLIFE 후속 변경에 필요한 조건부 skill 조합 확인
- `dart-data-source-hardening`: 외부 데이터 provenance, evidence mismatch, 빈 데이터와 안전한 실패 경계 점검
- `planning-gate-selector`: package script/순수 로직/운영 문서 변경의 focused/full gate 선택
- `work-log-closeout`: 실제 변경·검증·미실행·잔여 migration 리스크 기록
- `manager` subagent: 입력 계약, read-only 분류, package script, 검증, 문서화를 5단계로 분해
- `tester` subagent: pure builder, Prisma read boundary, package/docs contract, temp SQLite smoke 제안
- `analyzer` subagent: 분류 edge case 검토를 요청했으나 제한 시간 내 결과가 없어 종료, PASS 근거에 사용하지 않음
- `reviewer` subagent: 타 kind Product만 있어도 readiness가 true가 되는 false-positive를 발견했고 target-kind 기준으로 수정

## 변경 이유

- PR #207의 aggregate inventory drift 값만으로는 어떤 code가 stale인지, 어떤 고우선순위 owner가 현재 후보를 막는지, stale row가 어떤 참조를 보유하는지 알 수 없었습니다.
- active/prune migration 전에 Product/Favorite/ExternalProductMatch를 파괴적으로 변경하지 않고 code 단위 위험을 확인할 반복 실행 도구가 필요했습니다.
- normalized dump 또는 snapshot이 실제 완료 증거와 같은 실행인지 확인하지 않으면 stale 판정이 오탐일 수 있어 provenance 정렬을 별도 계약으로 두었습니다.

## 핵심 변경

- `pnpm finlife:inventory:report --kind=<kind>` read-only 운영 명령을 추가했습니다.
- explicit `--fromFile` normalized dump를 우선하고, 미지정 시 `.data/finlife_<kind>_snapshot.json`을 사용합니다.
- candidate code를 `kept`, `missing`, `blocked-by-priority`, `replaceable-owner`로 분류합니다.
- 현재 kind DB row가 candidate에 없으면 `staleObserved`로 기록하고 ProductOption, Favorite, ExternalProductMatch 참조 수를 표시합니다.
- dump replay basename 또는 snapshot generatedAt이 complete evidence와 일치하는지 표시하며 mismatch에서는 stale row를 `evidence-unaligned`로 제한합니다.
- Prisma는 `Product.findMany`와 `ExternalSourceSnapshot.findUnique`만 호출하고 write/mutation을 수행하지 않습니다.
- 요청 kind Product와 completion evidence가 모두 없으면 다른 kind row가 있어도 `readiness.ready=false` JSON과 non-zero로 종료합니다.

## 실행한 검증

- `node --check scripts/finlife_inventory_report.mjs`: PASS
- 변경 파일 ESLint: PASS
- focused `vitest`: PASS, 3 files / 20 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS
- `git diff --check`: PASS
- `pnpm finlife:inventory:report --help`: PASS
- populated cross-kind SQLite: saving owner code를 deposit report에서 `blocked-by-priority`, ProductOption 1, delta -1로 확인
- populated stale SQLite: 같은 kind stored-only code를 `staleObserved`, `owned-options-only`로 확인
- initialized empty SQLite: `readiness.ready=false`, missing/evidence warning, non-zero 종료
- 다른 kind row만 있는 SQLite: blocker는 출력하되 요청 kind readiness false와 non-zero 유지
- schema 미초기화 SQLite: Prisma 내부 invocation 로그 없이 안전한 초기화 필요 메시지와 non-zero 종료

## 미실행 검증

- data-source E2E: public route, page, selector, response를 변경하지 않아 실행하지 않음
- FINLIFE live upstream: 외부 호출 없이 normalized replay와 snapshot fixture로 검증
- 운영 populated DB 진단: 실제 사용자/운영 DB 경로와 데이터 제공이 없어 미실행
- planning complete/compat/regress: planning 코드 영향 없음

## 계약 영향

- Public URL/API/HTTP 응답 shape: 변경 없음
- 사용자 상품 query/status/freshness/onlyNew/cache: 변경 없음
- DB schema/migration: 변경 없음
- 기존 sync DB write/upsert/prune semantics: 변경 없음
- 신규 CLI 실행 시 Prisma read: 전체 Product code/kind/relation count 1회, target kind completion evidence 1회
- DB write: 없음
- snapshot/dump write: 없음
- cache/revalidation: 변경 없음
- package script: `finlife:inventory:report` 1개 추가
- CLI stdout: schemaVersion 1의 read-only JSON report

## 남은 리스크

- report는 전체 Product와 relation count를 읽으므로 매우 큰 inventory에서 메모리/쿼리 비용을 추가 측정해야 합니다.
- replay evidence는 개인정보 경로를 피하기 위해 basename만 보존하므로 같은 이름 파일의 내용 동일성까지 증명하지 못합니다.
- aggregate evidence와 code-level report가 정렬돼도 stale row 삭제 가능성을 확정하지 않습니다.
- Favorite와 ExternalProductMatch 참조 정책, 이전 active set visibility, cross-kind owner migration은 여전히 Issue #206의 후속 범위입니다.
- 현재 CLI Prisma adapter는 기존 FINLIFE sync와 같은 SQLite 경로를 사용합니다. PostgreSQL 운영 경로가 필요하면 별도 adapter 합의가 필요합니다.
- Actions billing/spending limit 외부 차단은 PR 생성 후 별도 확인이 필요합니다.

## 롤백 기준

- report 실행이 Product/evidence/snapshot/cache를 수정하는 경우
- evidence mismatch인데 stale/prune 가능 상태로 표시하는 경우
- 다른 kind inventory만으로 요청 kind readiness를 true로 만드는 경우
- package script가 기존 FINLIFE sync entrypoint를 대체하거나 성공 gate로 오해되는 경우
- schema 미초기화 오류에 내부 DB 경로나 raw Prisma invocation이 노출되는 경우

## 다음 라운드 우선순위

1. 제공 가능한 populated DB 복사본에서 report를 실행해 실제 blocker/stale/reference 목록을 확보합니다.
2. Issue #206에서 soft-inactive와 sidecar ownership schema를 비교하고 이전 active set visibility를 설계합니다.
3. report 결과를 migration dry-run 입력으로 사용할 때 content hash 또는 run identity 보강 필요성을 검토합니다.
