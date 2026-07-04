# 2026-07-04 run update store boundary

## 변경 파일
- `src/lib/planning/store/runUpdateStore.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runUpdateStore.test.ts`
- `work/7/4/2026-07-04-run-update-store-boundary.md`

## 사용 skill
- `finance-skill-routing`: financeproject 구조 개선 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: planning v2 run store update 경계 변경에 필요한 검증 세트 선정
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목 확인
- `github:github`: PR `#153`, Issue `#116` 상태 확인

## 변경 이유
- `#116` 후속으로 `runStore.ts`에 남아 있던 update write orchestration 책임을 별도 helper로 분리했습니다.
- 기존 `updateRun` public 함수와 `UpdateRunPatch` import 계약은 유지하면서, patch merge, canonicalization, meta write, index upsert 흐름을 `runUpdateStore.ts`로 옮겼습니다.
- read/create/delete/retention boundary와 같은 방식으로 update write path의 회귀 범위를 좁혔습니다.

## 핵심 변경
- `createRunUpdateStore`를 추가해 update patch merge, canonical meta write, run index upsert를 주입형 helper로 분리했습니다.
- `runStore.ts`는 startup migration, id sanitizing, public wrapper 호출만 유지합니다.
- 단위 테스트로 shallow patch merge, `actionCenter: null` 삭제, action center 보존, missing run no-write 계약을 고정했습니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작은 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/runUpdateStore.test.ts tests/planning/runMetaWriter.test.ts tests/planning-store.test.ts tests/planning/store/planningStoreNamespace.test.ts`: PASS, 4 files / 25 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 774 files / 2556 tests
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-iNVE8p`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- 이번 변경은 update write orchestration 분리만 다루며, blob read/write persistence boundary는 아직 별도 후보로 남아 있습니다.
- legacy fallback/backfill 전체 재작성은 하지 않았습니다.
- PR `#147`~`#153` 위 stacked PR이므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요합니다.

## 다음 라운드 우선순위
- `#116`: blob raw/read persistence boundary 또는 legacy fallback/backfill 재구성을 현재 코드 기준으로 다시 분해합니다.
- `#117`: 열린 `#116` stack 충돌 위험이 낮아진 뒤 persistence adapter 후속을 재검토합니다.
