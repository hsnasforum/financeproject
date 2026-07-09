# 2026-07-04 run retention store boundary

## 변경 파일
- `src/lib/planning/store/runRetentionStore.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runRetentionStore.test.ts`
- `work/7/4/2026-07-04-run-retention-store-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록과 이번 구현 라운드에 필요한 기본 skill 조합 확인
- `planning-gate-selector`: run store retention 경계 변경에 필요한 planning v2 검증 세트 선정
- `work-log-closeout`: closeout 문서 형식과 필수 기록 정리
- `github:github`: PR `#147`~`#151`, Issue `#116/#117` 상태 확인
- `manager subagent`: PR `#151` 이후 후속 후보 재분해

## 변경 이유
- `#116` 후속으로 `runStore.ts`에 남은 retention purge orchestration 책임을 delete/trash 경계와 분리할 필요가 있었습니다.
- 기존 public `purgeRunsByRetention` 함수와 `createRun`의 retention 적용 흐름은 유지하면서, index 읽기, retention target 선택, delete boundary 호출, 성공 id 조립을 helper로 옮겼습니다.
- legacy fallback/backfill 전체 재작성은 여전히 범위가 크므로 이번 PR에서는 retention purge boundary만 분리했습니다.

## 핵심 변경
- `runRetentionStore.ts`를 추가해 retention purge orchestration을 분리했습니다.
- `runStore.ts` public API는 그대로 두고 새 helper에 index listing, delete boundary, default max retention 값을 주입합니다.
- `runRetentionStore` 단위 테스트를 추가해 target 삭제 순서, 실패한 삭제 제외, profile filter trimming, invalid max fallback을 검증합니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation 동작은 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/runRetentionStore.test.ts tests/planning/runRetention.test.ts tests/planning/runDeleteStore.test.ts tests/planning-store.test.ts tests/planning/store/planningStoreNamespace.test.ts`: PASS, 5 files / 28 tests
- `corepack pnpm lint`: 1차 실행은 124초 timeout으로 종료 코드 미확인, 남은 프로세스 정리 후 재실행 PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 772 files / 2550 tests
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-8KUGYY`
- `corepack pnpm planning:v2:regress`: PASS, 9 regression cases + full e2e 10 passed
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS

## 남은 리스크
- 이번 변경은 retention purge orchestration 분리만 다루며, legacy fallback/backfill 전체 재작성은 하지 않았습니다.
- `runStore.ts`에는 read fallback/migration/backfill/update 경계가 아직 남아 있습니다.
- PR `#147`~`#151` 위 stacked PR이므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요합니다.

## 다음 라운드 우선순위
- `#116`: read fallback 진단/관측성 계약을 현재 helper 구조 기준으로 더 좁게 고정합니다.
- `#116`: legacy fallback/backfill 전체 재작성은 migration/trash/read 계약을 더 작은 증거 단위로 쪼갠 뒤 진행합니다.
- `#117`: 열린 `#116` stack 충돌 위험이 낮아진 뒤 persistence adapter 후속을 진행합니다.
