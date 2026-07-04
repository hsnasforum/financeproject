# 2026-07-04 run blob write store boundary

## 변경 파일
- `src/lib/planning/store/runBlobWriteStore.ts`
- `src/lib/planning/store/runCreateStore.ts`
- `tests/planning/runBlobWriteStore.test.ts`
- `tests/planning/runCreateStore.test.ts`
- `work/7/4/2026-07-04-run-blob-write-store-boundary.md`

## 사용 skill
- `finance-skill-routing`: financeproject 구조 개선 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: planning v2 run create/blob write 경계 변경에 필요한 검증 세트 선정
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 항목 확인
- `github:github`: PR `#155`, Issue `#116` 상태 확인

## 변경 이유
- `#116` 후속으로 `runCreateStore.ts`에 남아 있던 stage blob write persistence 책임을 별도 helper로 분리했습니다.
- 기존 create run public API, 저장 payload shape, blob 파일명, meta/index/retention 순서는 유지하면서 raw output compact, stage blob write, `WRITE_BLOB` journal step 기록을 `runBlobWriteStore.ts`로 옮겼습니다.
- read/update/blob-read boundary와 같은 방식으로 create path의 blob write 회귀 범위를 좁혔습니다.

## 핵심 변경
- `createRunBlobWriteStore`를 추가해 raw output compact, stage blob write, blob journal step 기록을 주입형 helper로 분리했습니다.
- `createRunInFileStore`는 blob write helper를 호출하고 meta write, index upsert, retention, rollback 흐름만 유지합니다.
- 단위 테스트로 compact-before-write, optional transaction behavior, missing ref skip, create store delegation 계약을 고정했습니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작은 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/runBlobWriteStore.test.ts tests/planning/runCreateStore.test.ts tests/planning/runBlobStore.test.ts tests/planning-store.test.ts`: PASS, 4 files / 25 tests
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 776 files / 2564 tests
- `corepack pnpm lint`: 1차 병렬 실행은 124초 제한으로 timeout, 단독 재실행 PASS
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-RZowjo`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- 이번 변경은 create path의 blob write persistence boundary만 다루며, legacy fallback/backfill 전체 재구성은 별도 후보로 남아 있습니다.
- `runCreateStore`의 rollback 정책 자체는 변경하지 않았습니다.
- PR `#147`~`#155` 위 stacked PR이므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요합니다.

## 다음 라운드 우선순위
- `#116`: legacy fallback/backfill 재구성 가능성을 현재 코드 기준으로 다시 분해합니다.
- `#117`: 열린 `#116` stack 충돌 위험이 낮아진 뒤 persistence adapter 후속을 재검토합니다.
