# 2026-07-10 Issue #197 FINLIFE DB 완료 증거 보강

## 변경 파일

- `docs/finlife-sync.md`
- `scripts/finlife_cli_common.mjs`
- `scripts/finlife_sync.mjs`
- `src/lib/finlife/snapshot.ts`
- `tests/finlife-sync-attempt-marker.test.ts`
- `tests/finlife-sync-entrypoint-contract.test.ts`
- `tests/finlife-sync-persistence.test.ts`
- `work/7/10/2026-07-10-source-finlife-db-completion-evidence.md`

## 사용 skill

- `finance-skill-routing`: FINLIFE freshness 작업에 필요한 최소 skill 조합 선택
- `dart-data-source-hardening`: partial failure, provenance, stale 성공 오표시 방지 점검
- `planning-gate-selector`: focused test, lint, 전체 test, build 검증 범위 선택
- `work-log-closeout`: 변경·검증·잔여 리스크를 다음 작업자가 이어갈 수 있게 정리
- `manager` subagent: #197 남은 범위를 4단계로 분해하고 최소 PR 후보 선정
- `analyzer` subagent: `ExternalSourceSnapshot` 충돌과 metadata/실패 순서 검토
- `tester` subagent: 최소 회귀 테스트와 gate 분류
- `reviewer` subagent: stale 성공 오표시와 replay provenance 누락 검출, 수정 후 재검토

## 변경 이유

- CLI FINLIFE sync는 Prisma `Product`를 갱신하지만 실제 query 저장소의 완료 시각을 DB에 남기지 않아 file snapshot과 DB 상태의 ownership 차이를 직접 관측하기 어려웠습니다.
- 단순히 DB 반영 직후 `lastSyncedAt`을 갱신하면 snapshot 실패를 전체 성공으로 오해할 수 있으므로 단계 상태가 필요했습니다.
- public API, 응답 shape, DB schema, 기존 read query, cache를 바꾸지 않고 완료 증거 write 경계와 실패 상태만 추가하는 범위로 제한했습니다.

## 핵심 변경

- kind별 DB 반영 뒤 `ExternalSourceSnapshot(sourceId=finlife, kind)`에 `completionState=db-complete` 중간 증거를 upsert합니다.
- 중간 증거는 기존 `lastSyncedAt`을 유지하고 최초 row는 epoch를 써 generic freshness reader의 성공 오표시를 막습니다.
- snapshot 교체 뒤에만 `completionState=complete`, `lastSyncedAt`, `resultCode=OK`를 확정합니다.
- 최종 증거 실패는 새 내부 marker `phase=completion`, `COMPLETION_WRITE_FAILED`로 남기며 CLI/runtime reader가 같은 계약을 읽습니다.
- live/replay provenance를 구분하고 replay 파일은 basename만 저장합니다.
- PR #201의 AST entrypoint guard는 `syncRunner` 문자열이 없는 파일을 파싱하지 않게 해 전체 suite timeout을 제거했습니다.

## 검증

- 변경 전 `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/finlife-sync-persistence.test.ts tests/sources-status.test.ts tests/finlife-unified-refresh-contract.test.ts`: PASS, 3 files / 8 tests
- 1차 focused test: FAIL, 새 `completion` phase를 CLI marker reader가 거부하는 계약 누락 1건 확인
- 최종 `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/finlife-sync-persistence.test.ts tests/finlife-sync-attempt-marker.test.ts tests/finlife-sync-if-stale.test.ts tests/finlife-unified-refresh-contract.test.ts tests/sources-status.test.ts`: PASS, 5 files / 16 tests
- `corepack pnpm vitest run tests/finlife-sync-entrypoint-contract.test.ts`: PASS, 1 file / 2 tests, 정적 scan 255ms
- `node --check scripts/finlife_sync.mjs`: PASS
- `node --check scripts/finlife_cli_common.mjs`: PASS
- `corepack pnpm lint`: PASS
- 1차 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: FAIL, `finlife-sync-entrypoint-contract` 기본 5초 timeout 1건
- 정적 scan 최적화 후 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS
- reviewer 1차: generic freshness 성공 오표시와 replay provenance 누락 finding 확인
- reviewer 2차: actionable finding 없음
- 미실행: 실제 `pnpm finlife:sync`, 실제 `pnpm finlife:sync -- --fromFile=...`, e2e, production smoke
- 실제 sync는 외부 API 호출과 상품 DB/snapshot 쓰기를 수반하고, 이번 변경은 dependency-injected 회귀 검증으로 범위를 제한해 실행하지 않았습니다.

## 계약 영향

- Public URL/API/HTTP 응답 shape 변경 없음.
- DB schema와 migration 변경 없음.
- 기존 Prisma read query와 query semantics 변경 없음.
- DB write 동작은 변경됨: kind별 CLI sync가 기존 `ExternalSourceSnapshot`에 `db-complete`와 `complete` 두 단계 upsert를 추가합니다.
- HTTP cache/revalidation과 애플리케이션 cache 동작 변경 없음.
- FINLIFE snapshot JSON format 변경 없음.
- sync-attempt marker 내부 계약에 `phase=completion`, `COMPLETION_WRITE_FAILED`가 추가됩니다.
- source status와 unified `onlyNew`는 아직 완료 증거 row를 소비하지 않아 기존 public 값 계산은 유지됩니다.

## 남은 리스크

- Prisma 상품 및 option 쓰기는 kind 전체 transaction이 아니어서 중간 실패 시 일부 row 반영 가능성이 남아 있습니다.
- 완료 증거 upsert는 mock Prisma payload와 전체 build/test로 검증했지만 실제 live/replay sync round-trip은 실행하지 않았습니다.
- `ExternalSourceSnapshot` 신규 consumer는 `completionState=db-complete`와 `resultCode=DB_COMPLETED`를 incomplete로 해석해야 합니다.
- source status의 count/freshness와 unified `onlyNew`는 여전히 file snapshot 시각을 사용합니다.
- runtime `runFinlifeSnapshotSync`는 계속 snapshot만 갱신하며 Prisma 상품 DB를 갱신하지 않습니다.
- 롤백 기준은 snapshot 실패 뒤 `lastSyncedAt`이 현재 시각으로 갱신되는 경우, marker가 completion 실패를 읽지 못하는 경우, replay가 live provenance로 저장되는 경우입니다.

## 이번 라운드 완료 항목

- FINLIFE CLI DB/snapshot 완료 상태를 기존 DB 모델에 단계적으로 기록했습니다.
- DB 성공/snapshot 실패와 DB+snapshot 성공/최종 증거 실패를 서로 구분하는 marker와 회귀 테스트를 추가했습니다.
- reviewer finding 두 건과 전체 suite timeout을 수정하고 focused/full/lint/build를 통과했습니다.

## 다음 라운드 우선순위

1. source status가 `completionState=complete`인 FINLIFE row를 snapshot marker와 함께 소비할 최소 read adapter를 설계합니다.
2. source status 값 의미 변경은 기존 응답 shape를 유지하되 count/freshness 회귀를 별도 PR로 검증합니다.
3. unified `onlyNew`의 기준을 DB 완료 증거로 옮기는 작업은 query semantics 변경 가능성이 있으므로 별도 Issue/PR 판단으로 분리합니다.
4. runtime snapshot refresh와 Prisma Product sync ownership 통합은 외부 API/DB 쓰기 범위를 합의한 뒤 진행합니다.
