# 2026-07-04 run delete store boundary

## 변경 파일
- `src/lib/planning/store/runDeleteStore.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runDeleteStore.test.ts`
- `work/7/4/2026-07-04-run-delete-store-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록과 이번 구현 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: run store 저장 경계 변경에 필요한 planning v2 검증 세트 선정
- `work-log-closeout`: closeout 문서 형식과 필수 기록 정리
- `github:github`: PR `#147`~`#150`, Issue `#116/#117` 상태 확인
- `manager subagent`: PR `#150` 이후 작은 후속 범위 재분해

## 변경 이유
- `#116` 후속으로 `runStore.ts`에 남은 삭제, 복구, hard-delete orchestration 책임을 read/create/index 경계와 분리할 필요가 있었습니다.
- 기존 public run store 함수명과 route 응답 shape는 유지하면서, trash 이동과 index remove/upsert 순서를 helper 단위 테스트로 고정했습니다.
- legacy fallback 전체 재작성은 범위가 크므로 이번 PR에서는 delete/trash/restore boundary만 분리했습니다.

## 핵심 변경
- `runDeleteStore.ts`를 추가해 `deleteRun`, `restoreRunFromTrash`, `hardDeleteRun`, `hardDeleteRunFromTrash` orchestration을 분리했습니다.
- `runStore.ts` public API는 그대로 두고 새 helper에 index remove/upsert와 run lookup dependency를 주입합니다.
- `runDeleteStore` 단위 테스트를 추가해 trash 이동, restore 후 index upsert, hard delete 성공/실패 시 index remove 조건을 검증합니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작은 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/runDeleteStore.test.ts tests/planning-store.test.ts tests/planning/store/planningStoreNamespace.test.ts`: PASS, 3 files / 23 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 771 files / 2548 tests
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-qz4jI3`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS

## 남은 리스크
- 이번 변경은 delete/trash/restore orchestration 분리만 다루며, legacy fallback/backfill 전체 재작성은 하지 않았습니다.
- retention purge는 기존처럼 `runStore.purgeRunsByRetention`에서 `deleteRun` public wrapper를 호출하므로 별도 retention helper 분리는 후속 범위입니다.
- PR `#147`~`#150` 위 stacked PR이므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요합니다.

## 다음 라운드 우선순위
- `#116`: retention purge helper 분리 여부를 현재 호출 경로와 테스트 기준으로 재검토합니다.
- `#116`: legacy fallback/backfill 전체 재작성 전에 read fallback 진단/관측성 계약을 더 좁게 고정합니다.
- `#117`: 열린 `#116` stack 충돌 위험이 낮아진 뒤 persistence adapter 후속을 진행합니다.
