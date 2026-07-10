# 2026-07-10 run read migration 상세 결과 계약

## 변경 파일

- `src/lib/planning/store/runReadMigration.ts`
- `tests/planning/runReadMigration.test.ts`
- `work/7/10/2026-07-10-run-read-migration-result-contract.md`

## 사용 skill

- `finance-skill-routing`: 이번 #116 구현/검증 라운드의 최소 skill 조합 선택
- `planning-gate-selector`: migration/read compatibility 변경에 필요한 검증 세트 선택
- `github:github`: Issue #116, PR #182/#192, open stack과 리뷰 상태 확인
- `github:gh-fix-ci`: GitHub Actions run/job/step 실행 여부 확인
- `work-log-closeout`: 한글 closeout과 다음 라운드 인계 기록

## 변경 이유

- 기존 `migrateLegacyRunToPartition`은 boolean만 반환해 migration 성공과 skip 원인을 좁은 테스트 계약으로 구분할 수 없었습니다.
- PR #182는 stale stack 위에 있어 최신 `main` 기준 replacement가 필요했습니다.
- 상세 결과를 실제 observer에 바로 연결하면 소비자 없는 추상화가 되므로, 이번 범위는 migration control-flow 결과와 기존 mutation 보존에 한정했습니다.

## 핵심 변경

- `migrateLegacyRunToPartitionDetailed`가 migration 성공 또는 `missing-partition-target` / `partition-meta-readable` skip reason을 반환합니다.
- 기존 `migrateLegacyRunToPartition(): Promise<boolean>`은 detailed helper를 감싼 wrapper로 유지했습니다.
- skip reason은 partition record 유효성 진단이 아니라 migration control flow임을 코드에 명시했습니다.
- readable partition meta는 기존처럼 overwrite하지 않고, malformed JSON target은 기존처럼 새 partition record로 교체합니다.
- partition write 후 legacy meta/file unlink 순서와 best-effort cleanup을 유지했습니다.
- Public URL/API/응답 shape, DB schema, Prisma query semantics, 저장 포맷, run index/blob/trash/retention, cache/revalidation은 변경하지 않았습니다.

## 검증

- focused Vitest: PASS, 4 files / 30 tests
  - `DATABASE_URL=file:./dev.db corepack pnpm test tests/planning/runReadMigration.test.ts tests/planning/runReadStore.test.ts tests/planning/runMetaReader.test.ts tests/planning-store.test.ts`
- `DATABASE_URL=file:./dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8건
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-wMJJ85`
- `DATABASE_URL=file:./dev.db corepack pnpm planning:v2:regress`: PASS, regression 9건 / full E2E 10건
- `DATABASE_URL=file:./dev.db corepack pnpm test`: PASS, 782 files / 2,606 tests
- `corepack pnpm cleanup:next-artifacts && DATABASE_URL=file:./dev.db corepack pnpm build`: PASS, 228.5초
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --cached --check`: PASS
- 정적 리뷰: `partition-meta-exists` 의미 과장 Medium finding과 malformed target 테스트 공백 Low finding을 해소했습니다.
- 구현 커밋: `c1902f53e60fa8ab1f96a2e3c4a8d556e27dca04`
- replacement PR: https://github.com/hsnasforum/financeproject/pull/192
- 대체 대상 PR: https://github.com/hsnasforum/financeproject/pull/182
- 코드 head CI: https://github.com/hsnasforum/financeproject/actions/runs/29072182145
  - `verify` failure, steps 0개
- 코드 head E2E Smoke: https://github.com/hsnasforum/financeproject/actions/runs/29072182138
  - 3개 job failure, 각 steps 0개
- Actions는 workflow code/checkout 전 계정 또는 러너 시작 단계 외부 실패이며 이전 billing/spending-limit 패턴과 같습니다.
- 미실행: 수동 `docs/planning-v2-5min-selftest.md`, production 배포 smoke, `corepack pnpm release:verify`

## 남은 리스크

- 상세 결과는 `invalid-json`, `decode-failed`, `invalid-run-record` 같은 record health 진단을 포함하지 않습니다.
- malformed target 교체는 기존 동작을 보존한 것이며, 운영자가 교체 전 corruption을 별도로 집계하는 기능은 후속 범위입니다.
- legacy meta/file unlink 실패를 best-effort로 무시하는 기존 cleanup semantics를 유지했습니다.
- PR #183의 optional observer는 실제 production consumer 없이 read path dependency만 늘리므로 이번 범위에서 제외했습니다.
- GitHub Actions billing/spending-limit 문제가 해소되기 전에는 원격 workflow의 실제 코드 실행 결과를 얻을 수 없습니다.
- 롤백 기준은 기존 boolean 반환, partition write/cleanup 순서, malformed target 교체, 저장 포맷, public/DB/cache 계약 변화입니다.

## 다음 라운드 우선순위

1. PR #192 병합 후 PR #182를 superseded로 닫고 Issue #116에 근거를 남깁니다.
2. `runLegacyBackfillReadStore`의 operation-scoped detailed read 결과와 privacy-safe corruption aggregate 필요성을 최신 main에서 설계합니다.
3. PR #183 observer는 실제 ops/metrics consumer가 확정될 때만 재검토합니다.
