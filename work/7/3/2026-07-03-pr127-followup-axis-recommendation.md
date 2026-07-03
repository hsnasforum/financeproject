# 2026-07-03 PR #127 후속 축 재검토

## 변경 파일
- `work/7/3/2026-07-03-pr127-followup-axis-recommendation.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 문서와 현재 구현/검증 라운드의 기본 skill 조합을 고르는 데 사용했습니다.
- `github:github`: 열린 PR 상태를 GitHub connector로 확인해 다음 stacked PR 축을 고르는 데 사용했습니다.
- `planning-gate-selector`: `#116` run read 경계 변경에 필요한 focused/full gate를 고르는 데 사용했습니다.
- `work-log-closeout`: 이번 판단과 후속 라운드 기록 형식을 정하는 데 사용했습니다.
- `manager subagent`: 다음 PR 후보를 3~5단계로 분해하고 리스크를 비교하는 데 사용했습니다.

## 변경 이유
- PR #127 이후 열린 stacked PR이 많아, 다음 작업 축을 이전 기억이 아니라 현재 GitHub 상태와 최신 `/work` 기준으로 다시 고정할 필요가 있었습니다.
- manager subagent는 `#117` 후속을 권고했지만, live GitHub 상태에서는 `#117` 후속 PR #133~#139가 이미 열려 있어 같은 영역의 겹침 위험이 더 컸습니다.

## 핵심 변경
- PR #127은 open/mergeable true이고 head CI/E2E가 PASS임을 확인했습니다.
- PR #135, #140은 `#116` 후속으로 open/mergeable true이고, #140은 CI/E2E가 PASS임을 확인했습니다.
- PR #133~#139는 `#117` 후속 stack으로 이미 열려 있어 이번 라운드에서는 추가 `#117` 변경을 보류했습니다.
- 이번 구현 축은 `#116`의 read path 후보 선정 책임을 `runReadSources` helper로 분리하는 작은 PR로 정했습니다.
- `runStore.ts`에는 JSON decode, canonicalization, migration persistence, index scan/read/write orchestration을 그대로 남겨 public contract와 lazy migration 조건 변경을 피했습니다.

## 검증
- `git status --short --branch` PASS: 현재 브랜치와 미커밋 변경 확인
- GitHub connector `_get_pr_info` PASS: PR #127, #135, #140 상태 확인
- GitHub connector `_search_prs` PASS: 열린 PR #127, #133~#140 확인
- `corepack pnpm test tests/planning/runReadSources.test.ts tests/planning/runReadObservability.test.ts tests/planning-store.test.ts` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm test` PASS: 761 files / 2521 tests
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:compat --keep-sandbox` PASS: sandbox `/tmp/planning-v2-compat-1o1gJL`
- `corepack pnpm planning:v2:regress` PASS
- `corepack pnpm build` PASS

## 남은 리스크
- `#116`의 migration/backfill adapter, index scan/read/write, blob read/write 분리는 아직 남아 있습니다.
- 이번 분리는 read 후보 선정 helper만 대상으로 하므로, partition scan 성능 개선이나 migration 정책 변경은 포함하지 않았습니다.
- stacked PR 순서는 PR #127 -> #135 -> #140 -> 이번 후속 PR 순서로 유지해야 합니다.
