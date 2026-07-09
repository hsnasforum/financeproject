# 2026-07-03 #116 run index store 경계 분리

## 변경 파일
- `src/lib/planning/store/runIndexStore.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runIndexStore.test.ts`
- `work/7/3/2026-07-03-zzzzzzzz-run-index-store-boundary.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드에서 필요한 financeproject skill 조합 확인.
- `github:github`: PR #127/#135~#142 및 Issue #114~#132 상태 확인.
- `planning-gate-selector`: planning v2 core/run store 변경에 필요한 검증 게이트 선택.
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 사실 기록 기준 확인.
- `manager subagent`: PR stack과 #116/#117 다음 후보 비교. raw meta/backfill이 다음 작은 후보라는 권고를 후속 우선순위에 반영.

## 변경 이유
- #116 후속으로 `runStore.ts`에 남아 있던 run index scan/read/write/upsert/remove 책임을 분리해, run store 본문이 public wrapper와 run read/write orchestration에 더 집중하도록 한다.
- 기존 public API, run index payload, 저장 경로, repair semantics, journal/write lock 동작은 유지한다.

## 핵심 변경
- `createRunIndexStore`를 추가해 run index scan, read, repair, rebuild, upsert, remove 파일 I/O를 별도 helper로 분리했다.
- `runStore.ts`의 `listRunIndexEntries`, `readRunIndexEntries`, `rebuildRunIndexFromDisk`, `scanRunIndexEntriesFromDisk`, `getRun`, `diagnoseRunRead`, retention/create/update/delete/restore 경로는 기존 public 함수명과 반환 shape를 유지한 채 helper를 호출한다.
- partition run directory와 legacy run file scan은 기존 `readRunMeta`를 dependency로 주입받아 circular import를 만들지 않게 했다.
- 새 단위 테스트로 partition/legacy scan, missing index repair, upsert/remove ordering을 고정했다.
- Public URL/API, 응답 shape, DB schema/Prisma query, cache/revalidation 동작은 변경하지 않았다.

## 검증
- `corepack pnpm test tests/planning/runIndexStore.test.ts tests/planning/runIndex.test.ts tests/planning-store.test.ts` PASS, 3 files / 24 tests.
- `corepack pnpm lint` PASS.
- `corepack pnpm test` PASS, 763 files / 2527 tests.
- `corepack pnpm planning:v2:complete` PASS, fast e2e 6 tests 통과.
- `corepack pnpm planning:v2:compat --keep-sandbox` 1차 FAIL: migration fixture PASS 후 nested `planning:v2:complete` code 1, sandbox `/tmp/planning-v2-compat-1PV4bd` 보관.
- `PLANNING_DATA_DIR=/tmp/planning-v2-compat-1PV4bd/.data ... corepack pnpm planning:v2:complete` PASS, 같은 sandbox 직접 재실행.
- `corepack pnpm planning:v2:compat --keep-sandbox` 재실행 PASS, sandbox `/tmp/planning-v2-compat-1erGh4`.
- `corepack pnpm planning:v2:regress` PASS, regression 9 cases 및 planning v2 fast/full e2e 8 tests 통과.
- `corepack pnpm build` PASS.

## 남은 리스크
- #116의 raw meta read와 backfill orchestration wrapper는 아직 `runStore.ts`에 남아 있다.
- #116의 blob/create/update write path 추가 분리는 이번 범위가 아니다.
- 이번 PR도 #142 위 stacked PR이므로 #135, #140, #141, #142 merge 순서에 따라 rebase 또는 base 변경이 필요할 수 있다.
- `planning:v2:compat`의 nested complete 1회 실패는 직접 재실행과 전체 재실행에서 재현되지 않았지만, CI에서 반복되면 compat runner의 nested 로그 관측성 보강이 필요하다.

## 다음 라운드 우선순위
1. PR #127, #135, #140, #141, #142 및 이번 후속 PR의 merge/rebase 상태를 확인한다.
2. #116 raw meta/backfill boundary를 다음 작은 PR 후보로 검토한다.
3. #117 persistence adapter 후속은 PR #133~#139 stack 상태를 확인한 뒤 충돌이 적을 때 재개한다.
