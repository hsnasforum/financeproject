# 2026-07-11 Issue #222 테스트 fixture 타입 드리프트 해소

## 변경 파일

- `tests/finlife-sync-persistence.test.ts`
- `tests/planning-storage-mode-guard.test.ts`
- `tests/planning-v2-api/create-run-input-context.test.ts`
- `tests/planning-v2-api/create-run-success-response.test.ts`
- `tests/planning-v2-api/persistence-routes.test.ts`
- `tests/planning/runBlobReadStore.test.ts`
- `tests/planning/runBlobWriteStore.test.ts`
- `tests/planning/runCreateStore.test.ts`
- `tests/planning/runLegacyBackfillStore.test.ts`
- `tests/planning/runMetaRecord.test.ts`
- `work/7/11/2026-07-11-issue-222-test-fixture-type-drift.md`

## 사용 skill

- `planning-gate-selector`: test-only 타입 fixture 변경에 필요한 typecheck, focused/full test, release verify 범위를 선택했습니다.
- `work-log-closeout`: 실제 변경, 검증, reviewer finding과 잔여 타입 경계를 표준 종료 기록으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/222
- 기준 main: `32b85356a3faba481eee80fad281c468790d1bd4`
- 작업 브랜치: `codex/222-test-fixture-type-drift`
- 최신 main에서 `tsc --noEmit`가 production 코드는 통과했지만 테스트 fixture 10개 파일의 타입 진단 16건으로 중단됐습니다.
- Issue 본문의 17건 표기는 최신 main 실제 출력보다 1건 많아 https://github.com/hsnasforum/financeproject/issues/222#issuecomment-4942946932 에 정정 근거를 남겼습니다.
- runtime 타입, `tsconfig` exclude, package script를 약화하지 않고 현재 production 계약에 fixture와 mock만 맞췄습니다.

## 핵심 변경

- FINLIFE sync mock이 완전한 `FinlifeDbSyncResult`를 반환하고 production storage env가 literal type을 유지하도록 정렬했습니다.
- planning profile fixture에 필수 `version: 1`을 추가하고 비계약 stage `label`을 제거했으며 throwing `outputs` getter가 `never`를 반환하도록 명시했습니다.
- persisted run read fixture에는 필수 blob `ref`를 추가했습니다.
- ref 생성 전 raw output fixture는 가짜 경로를 넣지 않고 현재 production 경계와 같은 명시적 `unknown` 변환으로 유지했습니다.
- legacy backfill anomaly recorder mock이 `Array.push()`의 number가 아니라 `void`를 반환하도록 block body로 바꿨습니다.
- public URL/API/응답 shape, stored run/blob JSON shape, DB schema, Prisma query semantics, cache/revalidation은 변경하지 않았습니다.

## 검증

- baseline `corepack pnpm exec tsc --noEmit --pretty false`: FAIL, 지정 test fixture 10개 파일 / 16 diagnostics 재현
- `corepack pnpm exec tsc --noEmit --pretty false`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/finlife-sync-persistence.test.ts tests/planning-storage-mode-guard.test.ts tests/planning-v2-api/create-run-input-context.test.ts tests/planning-v2-api/create-run-success-response.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning/runBlobReadStore.test.ts tests/planning/runBlobWriteStore.test.ts tests/planning/runCreateStore.test.ts tests/planning/runLegacyBackfillStore.test.ts tests/planning/runMetaRecord.test.ts --reporter=dot`: PASS, 10 files / 60 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm verify`: PASS; dump fixture, schema/freshness report, security checks, route security scan, lint, typecheck, full Vitest 완료
- `pnpm verify`의 DART rules quality는 `tmp/dart/rules_eval.json` 부재로 기존 정책대로 SKIP됐고 command 전체 exit code는 0이었습니다.
- reviewer는 pre-write raw fixture에 가짜 `ref`를 넣은 첫 수정이 실제 input을 왜곡한다는 P3 finding 1건을 냈습니다.
- finding 수정 후 `corepack pnpm exec tsc --noEmit --pretty false`: PASS
- finding 수정 후 `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/planning/runBlobWriteStore.test.ts tests/planning/runCreateStore.test.ts tests/planning/runMetaRecord.test.ts --reporter=dot`: PASS, 3 files / 8 tests
- finding 수정 후 최종 `DATABASE_URL=file:./prisma/dev.db corepack pnpm verify`: PASS
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- `pnpm verify`가 생성한 시점성 report 3개는 이번 test-only 변경에 포함하지 않고 기준 main 내용으로 복원했습니다.
- `pnpm build`와 browser E2E는 runtime, route, page, build output 변경이 없어 이번 라운드에서 실행하지 않았습니다.

## 남은 리스크

- pre-write raw output과 persisted blob-ref output이 같은 `PlanningRunRecord["outputs"]` 타입을 공유해 internal fixture와 assembler에 명시적 변환이 남습니다. 별도 Issue #225로 분리했습니다.
- DART rules evaluation fixture가 없어 `pnpm verify` 안의 해당 quality gate는 SKIP 상태입니다. 이번 타입 fixture 변경과는 무관합니다.
- native runtime, public response, stored JSON은 변경하지 않았으므로 build/E2E 회귀는 이번 라운드에서 직접 재실행하지 않았습니다.
- rollback은 테스트 10개 파일의 fixture 변경만 파일 단위로 되돌리며 production 코드는 롤백 대상이 아닙니다.

## 다음 라운드 우선순위

1. Issue #223에서 desktop artifact의 unmanaged absolute symlink와 checksum provenance 정책을 검토합니다.
2. Issue #225에서 raw output과 persisted blob-ref output의 internal 타입 경계를 stored/public contract 변경 없이 좁힙니다.
3. Windows 가능한 환경에서 Issue #220의 junction 및 packaged install/start 검증을 보강합니다.
