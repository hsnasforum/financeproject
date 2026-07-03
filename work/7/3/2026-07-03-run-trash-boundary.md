# 2026-07-03 run trash boundary

## 변경 전 정리
- 수정 대상 파일: `src/lib/planning/store/runStore.ts`, `src/lib/planning/store/runTrashStore.ts`, `tests/planning/runTrashStore.test.ts`, `work/7/3/2026-07-03-run-trash-boundary.md`
- 변경 이유: Issue #116 후속으로 `runStore.ts`에 남아 있던 run trash/delete/restore 파일 조작 책임을 작은 단위로 분리해 index 갱신 책임과 파일 이동 책임의 변경 범위를 줄입니다.
- 실행할 검증 명령: `corepack pnpm test tests/planning/runTrashStore.test.ts`, `corepack pnpm test tests/planning-store.test.ts tests/planning-v2-api/trash-route.test.ts`, `corepack pnpm lint`, `corepack pnpm planning:v2:complete`, `corepack pnpm planning:v2:compat --keep-sandbox`, `corepack pnpm test`, `corepack pnpm planning:v2:regress`, `corepack pnpm build`, `git diff --check`, `corepack pnpm multi-agent:guard`

## 사용 skill
- `github:github`: PR #127/#133/#134, Issue #116/#117 상태 확인에 사용했습니다.
- `planning-gate-selector`: runStore v2 core 변경에 필요한 검증 범위를 판단하는 데 사용했습니다.
- `work-log-closeout`: 이번 라운드의 변경, 검증, 리스크, 다음 우선순위를 `/work` 형식으로 남기는 데 사용했습니다.
- `manager subagent`: PR #127 이후 stacked PR 상태와 #116/#117 후속 후보를 분해하는 데 사용했습니다.

## 이번 라운드 완료 항목
- PR #127/#133/#134는 manager subagent 기준으로 모두 `open`, `mergeable=true`, `draft=false`, review thread/comment 없음, head SHA 기준 CI/E2E Smoke 성공 상태임을 확인했습니다.
- Issue #116 후속 중 migration/backfill 전체 재작성은 제외하고, `trash/delete/restore` 파일 시스템 경계만 이번 PR 범위로 고정했습니다.
- `src/lib/planning/store/runTrashStore.ts`를 추가해 run meta 이동, trash 복구, trash 영구 삭제, partition/legacy hard delete 파일 작업을 분리했습니다.
- `runStore.ts`의 public export와 반환 shape는 유지하고, index 제거/복구 갱신은 기존 `runStore.ts`에 남겼습니다.
- partitioned run meta, legacy run file fallback, hard delete 파일 삭제 경계를 검증하는 단위 테스트를 추가했습니다.

## 변경 파일
- `src/lib/planning/store/runStore.ts`
- `src/lib/planning/store/runTrashStore.ts`
- `tests/planning/runTrashStore.test.ts`
- `work/7/3/2026-07-03-run-trash-boundary.md`

## 실행한 검증
- `corepack pnpm test tests/planning/runTrashStore.test.ts`: PASS, 1 file / 3 tests
- `corepack pnpm test tests/planning-store.test.ts tests/planning-v2-api/trash-route.test.ts`: PASS, 2 files / 19 tests
- `corepack pnpm lint`: PASS
- `corepack pnpm planning:v2:complete`: PASS, fast e2e 6 passed
- `corepack pnpm planning:v2:compat --keep-sandbox`: 첫 실행은 도구 제한 124초로 timeout, 300초 제한 재실행 PASS
- `corepack pnpm test`: PASS, 759 files / 2516 tests
- `corepack pnpm planning:v2:regress`: PASS, regression 9 cases + full e2e 8 passed
- `corepack pnpm build`: PASS
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS, staged 최신 work note `work/7/3/2026-07-03-run-trash-boundary.md` 기준

## 영향 범위
- Public URL 변경 없음.
- Public API/응답 shape 변경 없음.
- DB schema 변경 없음.
- Prisma query semantics 변경 없음.
- cache/revalidation 동작 변경 없음.
- 저장 payload schema와 run index 계약 변경 없음. 파일 조작 책임만 `runTrashStore.ts`로 이동했습니다.

## 남은 리스크
- Issue #116의 migration/backfill 전체 재작성, legacy fallback 전체 재구성, trash metadata migration은 이번 PR 범위에서 제외했습니다.
- restore 시 trash payload에서 profileId를 읽어 partition meta로 복구하는 기존 동작은 유지했지만, 손상된 trash payload의 관측성 보강은 별도 후속이 안전합니다.
- `runStore.ts`에는 아직 read/write, migration/fallback, index, blob 책임이 남아 있어 다음 PR에서도 단일 축으로만 좁히는 편이 안전합니다.

## 다음 라운드 우선순위
- #116 후속: migration/backfill 또는 legacy fallback 관측성 중 하나만 선택해 작은 PR로 분리합니다.
- #117 후속: create-run success response assembly 또는 stage pipeline helper 중 하나만 선택해 persistence adapter 경계를 더 좁힙니다.
- PR #127/#133/#134 이후 stacked PR 병합 상태를 먼저 확인하고, open 상태면 base를 기존 stack에 맞춰 유지합니다.
