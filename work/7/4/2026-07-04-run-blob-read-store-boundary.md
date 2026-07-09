# 2026-07-04 run blob read store boundary

## 변경 파일
- `src/lib/planning/store/runBlobReadStore.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runBlobReadStore.test.ts`
- `work/7/4/2026-07-04-run-blob-read-store-boundary.md`

## 사용 skill
- `finance-skill-routing`: financeproject 구조 개선 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: planning v2 run store blob read 경계 변경에 필요한 검증 세트 선정
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목 확인
- `github:github`: PR `#154`, Issue `#116` 상태 확인

## 변경 이유
- `#116` 후속으로 `runStore.ts`에 남아 있던 blob read orchestration 책임을 별도 helper로 분리했습니다.
- 기존 `getRunBlob` public 함수, route 계약, blob payload shape는 유지하면서 blob 이름 정규화, raw blob 합성, legacy blob fallback 위임 흐름을 `runBlobReadStore.ts`로 옮겼습니다.
- read/create/delete/retention/update boundary와 같은 방식으로 blob read path의 회귀 범위를 좁혔습니다.

## 핵심 변경
- `createRunBlobReadStore`를 추가해 non-raw blob read와 raw blob stage 합성 흐름을 주입형 helper로 분리했습니다.
- `runStore.ts`는 server-only guard, id sanitizing, public wrapper 호출만 유지합니다.
- 단위 테스트로 invalid blob name no-read, non-raw fallback delegation, missing-run legacy blob fallback, raw missing-run null, raw stage read order를 고정했습니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작은 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/runBlobReadStore.test.ts tests/planning/runBlobStore.test.ts tests/planning-v2-api/run-blob-route.test.ts tests/planning-store.test.ts`: PASS, 4 files / 28 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 775 files / 2561 tests
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-xdA8Je`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- 이번 변경은 blob read orchestration 분리만 다루며, blob write persistence boundary는 아직 별도 후보로 남아 있습니다.
- legacy fallback/backfill 전체 재작성은 하지 않았습니다.
- PR `#147`~`#154` 위 stacked PR이므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요합니다.

## 다음 라운드 우선순위
- `#116`: blob write persistence boundary 또는 legacy fallback/backfill 재구성을 현재 코드 기준으로 다시 분해합니다.
- `#117`: 열린 `#116` stack 충돌 위험이 낮아진 뒤 persistence adapter 후속을 재검토합니다.
