# 2026-07-03 #116 run read migration 경계 분리

## 작업 범위
- 대상 Issue: #116 runStore migration/trash/legacy fallback 경계 분리 후속.
- 기준 브랜치: `codex/116-read-sources-boundary` 위 stacked 후속 브랜치 `codex/116-read-migration-boundary`.
- 목표: legacy run read fallback 이후 partition으로 저장하는 파일 mutation 책임을 `runStore` read orchestration에서 분리한다.

## 사용 skill
- `finance-skill-routing`: financeproject 조건부 skill 선택.
- `github:github`: PR/Issue/CI 상태 확인.
- `planning-gate-selector`: planning v2 core 변경에 필요한 검증 게이트 선택.
- `work-log-closeout`: `/work` 종료 기록 작성 기준 확인.
- `manager subagent`: PR #127 이후 후속 축 분해와 #116 우선순위 확인.

## 변경 파일
- `src/lib/planning/store/runReadMigration.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runReadMigration.test.ts`
- `work/7/3/2026-07-03-zzzzzzz-run-read-migration-boundary.md`

## 변경 내용
- `migrateLegacyRunToPartition` helper를 추가해 legacy meta/file에서 읽은 run을 profile partition meta로 옮기는 책임을 분리했다.
- partition meta가 이미 있으면 overwrite하지 않고 false를 반환하도록 유지했다.
- profile partition target이 없는 run은 migration을 skip하도록 명시했다.
- `runStore`의 public read 흐름과 `persistMigrations` 조건은 유지하고, 내부 helper 호출만 새 모듈로 옮겼다.
- legacy migration 결과 보존과 skip 조건을 단위 테스트로 고정했다.

## 검증 결과
- `corepack pnpm test tests/planning/runReadMigration.test.ts tests/planning/runReadSources.test.ts tests/planning-store.test.ts` PASS.
- `corepack pnpm lint` PASS.
- `corepack pnpm test` PASS.
- `corepack pnpm planning:v2:complete` PASS.
- `corepack pnpm planning:v2:compat --keep-sandbox` 1차 FAIL: nested `planning:v2:complete` code 1, 보관 sandbox `/tmp/planning-v2-compat-nySThi`, 상세 nested 로그 미확보.
- `corepack pnpm planning:v2:compat --keep-sandbox` 재실행 PASS, sandbox `/tmp/planning-v2-compat-vZxUw3`.
- `corepack pnpm planning:v2:regress` PASS, regression 9 cases 및 planning v2 fast/full e2e 8 tests 통과.
- `corepack pnpm build` PASS.

## 영향
- Public URL/API 변경 없음.
- 응답 shape 변경 없음.
- DB schema 및 Prisma query 변경 없음.
- cache/revalidation 동작 변경 없음.
- 파일 저장 동작은 기존 `persistMigrations === true` 조건과 legacy-to-partition semantics를 유지하며, 내부 책임만 분리했다.

## 남은 리스크
- #116 전체 범위 중 run index scan/read/write와 trash 경계의 추가 분리는 남아 있다.
- raw meta read와 backfill orchestration은 아직 `runStore` 주변에 남아 있으므로 다음 후속에서 작은 단위로 나누는 것이 안전하다.
- 현재 브랜치는 PR #141 위 stacked 변경이므로, #141 merge/rebase 후 base 최신화가 필요하다.
- 첫 `planning:v2:compat` 실패는 재현되지 않았지만, CI에서 다시 발생하면 nested complete 로그 확보가 필요하다.

## 다음 라운드 우선순위
1. PR #127, #135, #140, #141 및 이번 후속 PR의 merge/rebase 상태를 확인한다.
2. #116 후속으로 run index scan/read/write 또는 raw meta/backfill orchestration 경계를 현재 코드 기준으로 다시 분해한다.
3. #117 persistence adapter 분리는 PR #133~#139 stack 상태를 확인한 뒤 충돌이 적은 파일부터 진행한다.
4. PR별 CI와 E2E Smoke 결과를 확인하고 실패 시 해당 PR 범위 안에서만 수정한다.
