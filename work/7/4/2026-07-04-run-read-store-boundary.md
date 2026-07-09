# 2026-07-04 run read store boundary

## 변경 파일
- `src/lib/planning/store/runReadStore.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runReadStore.test.ts`
- `work/7/4/2026-07-04-run-read-store-boundary.md`

## 사용 skill
- `finance-skill-routing`: financeproject 구조 개선 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: planning run store read 경계 변경에 필요한 검증 세트 선정
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목 확인
- `github:github`: PR `#152`, Issue `#116/#117` 상태 확인

## 변경 이유
- `#116` 후속으로 `runStore.ts`에 남아 있던 read source 순회, legacy fallback 이후 partition migration 조건, diagnostics attempt 조립 책임을 더 작은 helper 경계로 분리했습니다.
- 기존 helper인 `runReadSources`, `runMetaReader`, `runReadMigration`, `runReadObservability`를 조립하는 역할만 `runReadStore.ts`로 옮겼습니다.
- public run store 함수, route 응답 shape, 저장 payload/index/blob/trash file shape는 유지했습니다.

## 핵심 변경
- `createRunReadStore`를 추가해 `readRunMeta`와 `diagnoseRunRead` orchestration을 분리했습니다.
- `runStore.ts`는 index hint 조회, public wrapper, create/update/delete/retention/backfill wiring만 유지합니다.
- 단위 테스트로 source 순서, legacy hit의 `persistMigrations` 조건, diagnostics found response 조립을 고정했습니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작은 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/runReadStore.test.ts tests/planning/runReadSources.test.ts tests/planning/runReadObservability.test.ts tests/planning-store.test.ts`: PASS, 4 files / 26 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 773 files / 2553 tests
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-O0BPJl`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- 이번 변경은 read orchestration 경계 분리만 다루며, legacy fallback/backfill 전체 재작성은 하지 않았습니다.
- update write path와 blob persistence boundary는 아직 `runStore` 주변에 남아 있어 후속 작은 PR로 재검토해야 합니다.
- PR `#147`~`#152` 위 stacked PR이므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요합니다.

## 다음 라운드 우선순위
- `#116`: update write path 또는 blob read/write persistence boundary를 현재 코드 기준으로 작게 분리할 수 있는지 재검토합니다.
- `#116`: legacy fallback/backfill 전체 재작성은 migration/trash/read 계약을 더 작은 증거 단위로 쪼갠 뒤 진행합니다.
- `#117`: 열린 `#116` stack 충돌 위험이 낮아진 뒤 persistence adapter 후속을 진행합니다.
