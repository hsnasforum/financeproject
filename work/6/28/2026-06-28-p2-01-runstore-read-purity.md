# 2026-06-28 P2-01 runStore read purity

## 변경 파일
- `src/lib/planning/store/runStore.ts`
- `src/lib/planning/store/runRecordCodec.ts`
- `tests/planning-store.test.ts`
- `work/6/28/2026-06-28-p2-01-runstore-read-boundary-plan.md`
- `work/6/28/2026-06-28-p2-01-runstore-read-purity.md`

## 사용 skill
- `planning-gate-selector`: planning storage/read boundary 변경에 필요한 focused store tests, ops safety, compat, complete/regress, lint/typecheck/build 검증 범위를 선택했습니다.
- `work-log-closeout`: `/work` 종료 기록의 섹션 순서와 실제 실행 결과 기록 기준을 확인했습니다.

## 변경 이유
- P2-01 기준은 `getRun`, `listRuns`, `getRunBlob` 조회가 run meta/index/blob 파일 hash와 mtime을 바꾸지 않아야 한다는 것입니다.
- 기존 `runStore`는 조회 중 startup migration, legacy partition 이동, vault rewrite, ResultDto/engine envelope backfill, index rebuild를 수행해 read-only filesystem과 장애 분석에 불리했습니다.
- public facade와 API 계약은 유지하면서 명시적 repair/backfill 경로에만 쓰기 책임을 남겨야 했습니다.

## 핵심 변경
- run meta/index/blob 조회 기본 경로에서 파일 재기록, legacy partition 이동, index rebuild, startup migration 호출을 제거했습니다.
- `backfillLegacyRuns`는 `persistMigrations: true`로 explicit backfill 쓰기를 계속 수행하도록 분리했습니다.
- index upsert/remove 같은 쓰기 경로는 `repair: true`로 기존 repair 동작을 유지했습니다.
- vault encode/decode와 JSON read/write codec을 `runRecordCodec.ts`로 분리했습니다.
- 테스트를 hash/mtime 불변, read-only run storage 조회 성공, legacy read 호환 유지 기준으로 갱신했습니다.

## 검증
- 선행 실패: `corepack pnpm test tests/planning-store.test.ts`가 구현 전 5개 테스트 실패(index rebuild, legacy partition 이동, meta mutation 3건).
- 통과: `corepack pnpm test tests/planning-store.test.ts` (16개 테스트)
- 통과: `corepack pnpm test tests/planning-store.test.ts tests/planning/store/planningStoreNamespace.test.ts tests/planning/storage-consistency-recovery.test.ts` (22개 테스트)
- 통과: `corepack pnpm planning:v2:ops:safety` (`legacyCandidates=0`, report `.data/planning/ops/reports/20260628-114948-safety.json`)
- 통과: `corepack pnpm planning:v2:compat`
- 통과: `corepack pnpm planning:v2:complete` (fast e2e 6개 포함)
- 통과: `corepack pnpm planning:v2:regress` (regression case 9개, full e2e 8개 포함)
- 통과: `corepack pnpm lint`
- 통과: `corepack pnpm typecheck`
- 통과: `git diff --check`
- 통과: `corepack pnpm build`

## 남은 리스크
- index/blob/migration/lifecycle의 더 큰 모듈 분리는 아직 모두 끝내지 않았습니다. 이번 라운드는 codec 분리와 read-purity 계약 고정에 집중했습니다.
- 읽기 중 legacy 보정은 파일에 저장하지 않으므로 같은 legacy run을 반복 조회하면 fallback usage 카운터가 반복 증가할 수 있습니다.
- migration 실패 노출은 write/explicit ops 경로에서 실패를 삼키지 않도록 바꿨고, `/ops/doctor` 상태 계약 자체는 기존 migration manager 경로에 의존합니다.
