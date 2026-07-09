# 2026-07-03 #116 run read source 경계 분리

## 변경 파일
- `src/lib/planning/store/runReadSources.ts`
- `src/lib/planning/store/runStore.ts`
- `tests/planning/runReadSources.test.ts`
- `work/7/3/2026-07-03-pr127-followup-axis-recommendation.md`
- `work/7/3/2026-07-03-zzzzzz-run-read-sources-boundary.md`

## 사용 skill
- `finance-skill-routing`: 이번 구현 라운드의 기본 skill 조합을 정하는 데 사용했습니다.
- `github:github`: PR #127/#135/#140 및 열린 #117 후속 PR 상태를 확인하는 데 사용했습니다.
- `planning-gate-selector`: run store read 경계 변경의 focused/full 검증 범위를 고르는 데 사용했습니다.
- `work-log-closeout`: 변경, 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용했습니다.
- `manager subagent`: 다음 작업 축 후보를 분해하고 리스크를 비교하는 데 사용했습니다.

## 변경 이유
- Issue #116의 남은 리스크 중 `runStore.ts`가 partition hint, partition scan, legacy meta/file fallback 후보 선정 순서를 직접 조립하는 책임을 줄이기 위해서입니다.
- read source 순서만 helper로 분리하고 실제 read/decode/canonicalization/migration persistence는 기존 위치에 남겨 public API와 저장 계약 변경을 피했습니다.

## 핵심 변경
- `runReadSources.ts`를 추가해 `getRunPaths`, `findPartitionMetaPathByRunId`, `resolveRunReadSources`를 분리했습니다.
- `readRunMeta`는 새 helper가 반환한 후보를 순회하고, legacy meta/file에서 찾은 경우에만 기존 migration persistence를 유지합니다.
- `diagnoseRunRead`는 같은 source helper를 사용해 diagnostics attempt 순서와 실제 read 순서를 공유합니다.
- 새 단위 테스트로 profile hint, partition scan, legacy fallback 순서를 고정했습니다.
- 기존 diagnostics/store 테스트로 unreadable/missing/found 경로와 store read contract를 함께 확인했습니다.

## 검증
- `corepack pnpm test tests/planning/runReadSources.test.ts tests/planning/runReadObservability.test.ts tests/planning-store.test.ts` PASS: 3 files / 22 tests
- `corepack pnpm lint` PASS
- `corepack pnpm test` PASS: 761 files / 2521 tests
- `corepack pnpm planning:v2:complete` PASS: fast e2e 6 passed
- `corepack pnpm planning:v2:compat --keep-sandbox` PASS: sandbox `/tmp/planning-v2-compat-1o1gJL`
- `corepack pnpm planning:v2:regress` PASS: regression 9 cases + full e2e 8 passed
- `corepack pnpm build` PASS

## Public API / 응답 shape / DB / cache 영향
- Public URL 변경 없음.
- API 응답 shape 변경 없음.
- `RunReadDiagnostic` status/attempt shape 변경 없음.
- run JSON 저장 포맷, vault 경로, legacy migration persistence 조건 변경 없음.
- DB schema 및 Prisma query 변경 없음.
- cache/revalidation 동작 변경 없음.

## 남은 리스크
- `runStore.ts`에는 index scan/read/write, raw meta read, migration/backfill orchestration, create/update write path가 계속 남아 있습니다.
- 이번 PR은 PR #140 위에 쌓이는 `#116` 후속 PR이므로 PR #127 -> #135 -> #140 merge 순서 또는 rebase가 필요합니다.
- 다음 `#116` 후보는 migration/backfill adapter 또는 index scan/read/write 경계 분리입니다.

## 다음 라운드 우선순위
- PR #127, #135, #140과 이번 후속 PR의 merge 순서 또는 rebase 필요 여부를 먼저 확인합니다.
- `#116`을 계속 진행한다면 migration/backfill adapter와 index scan/read/write 중 하나만 골라 작은 PR로 분리합니다.
- `#117`은 PR #133~#139 stack이 정리된 뒤 persistence/side-effect 잔여 경계를 다시 평가합니다.
