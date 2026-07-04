# 2026-07-04 run legacy backfill read boundary

## 변경 파일
- `src/lib/planning/store/runLegacyBackfillReadStore.ts`
- `src/lib/planning/store/runLegacyBackfillStore.ts`
- `tests/planning/runLegacyBackfillReadStore.test.ts`
- `work/7/4/2026-07-04-run-legacy-backfill-read-boundary.md`

## 사용 skill
- `finance-skill-routing`: financeproject 구조 개선 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: planning v2 legacy run/backfill 경계 변경에 필요한 검증 세트 선정
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목 확인
- `github:github`: PR `#156`, Issue `#116`, `#117` 상태 확인

## 변경 이유
- `#116` 후속으로 `runLegacyBackfillStore.ts`에 남아 있던 raw legacy meta source 읽기와 경로 fallback 책임을 별도 helper로 분리했습니다.
- 기존 legacy candidate 판정, migration 실행, public API, 저장 payload shape는 유지하면서 partition meta, legacy meta, legacy file 순서의 read fallback만 `runLegacyBackfillReadStore.ts`로 옮겼습니다.
- backfill service wiring과 raw source reader를 분리해 legacy fallback/backfill 회귀 범위를 좁혔습니다.

## 핵심 변경
- `createRunLegacyBackfillReadStore`를 추가해 raw meta read, stored payload decode, raw run normalize, path fallback 순서를 주입형 helper로 분리했습니다.
- `createRunLegacyBackfillStore`는 summary/candidate/backfill service wiring과 raw reader 연결만 유지합니다.
- 단위 테스트로 partition -> legacy meta -> legacy file 순서, decode payload normalize 실패 시 fallback, unreadable source no-decode 계약을 고정했습니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작은 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/runLegacyBackfillReadStore.test.ts tests/planning/runLegacyBackfillStore.test.ts tests/planning/runReadStore.test.ts tests/planning-store.test.ts`: PASS, 4 files / 28 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 777 files / 2567 tests
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-yyFMiJ`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- 이번 변경은 legacy backfill의 raw source read boundary만 다루며, legacy migration/backfill 정책 자체는 변경하지 않았습니다.
- `#116`의 큰 구조 개선은 여러 stacked PR로 나뉘어 있으므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요합니다.
- `#117` persistence adapter 후속은 아직 별도 작업 후보입니다.

## 다음 라운드
- `#116` 선행 stacked PR merge 순서에 맞춰 base rebase 또는 retarget 필요 여부를 확인합니다.
- `#116` migration/trash/legacy fallback 정책 변경 필요성은 현재 PR들이 merge된 뒤 별도 작은 Issue/PR 단위로 재평가합니다.
- `#117` persistence adapter와 audit/metrics side-effect 경계 추가 분리를 다음 우선순위 후보로 유지합니다.
