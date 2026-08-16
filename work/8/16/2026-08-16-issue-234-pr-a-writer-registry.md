# 2026-08-16 Issue #234 PR A writer registry

## 변경 이유

- 기존 inventory에서 확인한 62개 Planning mutation source와 20개 초과 command surface를 lease 구현 전에 machine-checkable contract로 고정합니다.
- launcher, server, start-local, CLI의 root 계산 중복과 known `cwd/.data` writer를 current storage meaning을 보존하며 canonical resolver로 수렴합니다.
- 새 writer, package alias, child command, exported bypass와 direct path 재도입을 CI에서 fail closed합니다.

## 핵심 변경

- 순수 `.mjs + .d.mts` root resolver가 development, explicit, production, packaged Linux/macOS/Windows의 `planningRoot`, `runtimeRoot`, `controlRoot`를 계산합니다.
- 39 target, 63 source, 17 exclusion, 46 entrypoint registry와 deterministic SHA-256 digest를 추가했습니다.
- 기존 17 archive owner의 physical path는 owner registry를 재사용하며 exact set과 manifest v1을 변경하지 않았습니다.
- trim/migrate/weekly HTML과 ops/release/regression/OpenAPI/assumptions 경로를 canonical target으로 수렴하고, legacy path가 존재하면 `PATH_MIGRATION_REQUIRED`로 중단합니다.
- `planning:writer:guard`를 `verify`와 required release quality gate에 연결했습니다.

## 사용 skill

- `finance-skill-routing`: 이번 Planning storage 계약 작업에 필요한 최소 skill을 선택했습니다.
- `planning-gate-selector`: pure logic, scripts, archive/restore와 broad verify/build 영향에 맞는 검증 세트를 정했습니다.
- `work-log-closeout`: 구현 범위, 실제 검증, 잔여 위험과 PR B/C/D handoff를 기록했습니다.

## 변경 전 확인

- branch: `codex/234-phase-a-planning-writer-lease-20260816`
- old head: `3bca42e708a002092f9afaca0614388f38a29ec4`
- base/main: `f9c3608f431a8f6e099455a899d71d85c2382840`
- PR #292: OPEN, Draft, unmerged
- Issue #232/#234: OPEN
- 동일 PR A executable 구현 없음, 시작 작업 트리 clean

## 검증

- `DATABASE_URL=file:/tmp/finance-pr292-registry-focused.db corepack pnpm vitest run ...`: new root/registry/consumer와 data-dir focused 40 tests PASS
- archive owner/restore regression: 10 files, 89 tests PASS
- `corepack pnpm planning:writer:guard`: PASS, targets=39 sources=63 exclusions=17 entrypoints=46, unresolved=0
- policy/start-local/release gate regression: 7 files, 105 tests PASS
- scenario namespace corrective regression: 3 files, 23 tests PASS
- `DATABASE_URL=file:/tmp/finance-pr292-install.db corepack pnpm install --frozen-lockfile`: PASS, pnpm 9.15.9, lockfile unchanged
- `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm planning:ssot:check`, `corepack pnpm sec:scan:routes`, `corepack pnpm browser-storage:check`, `corepack pnpm deps:audit`: PASS
- `corepack pnpm planning:v2:compat`: 8 fixture tests와 fast E2E 8 tests PASS
- `corepack pnpm planning:v2:ops:safety`: opsRun/legacyBackfill PASS, candidates=0
- `DATABASE_URL=file:/tmp/finance-pr292-verify-rerun.db pnpm verify`: 837 files, 3107 tests PASS
- `DATABASE_URL=file:/tmp/finance-pr292-build.db pnpm build`: PASS, 250 static pages generated
- hosted checks: corrective push 후 one-shot 확인 예정

## 독립 감사 반영

- Owner/root 감사의 exposure directory-to-file 비교 오류를 exact `.data/exposure/profile.json` 비교로 수정했습니다.
- packaged macOS old server root가 존재하면 silent path switch 대신 `PATH_MIGRATION_REQUIRED`로 차단합니다.
- archive context가 소비하지 않는 `homeDir` fact를 public writer-target input에서 제거했습니다.
- registry/guard 감사에서 발견한 Prisma SQLite backfill을 explicit out-of-scope target/source/entrypoint로 등록했습니다.
- Planning package executable scan, `child_process`/shell child parsing, exported source-to-entrypoint graph, enum/policy/namespace matrix, exact manual-indirect set과 line-wide `legacyPath` suppression 제거를 반영했습니다.
- 실제 lease/lock 구현, runtime enforcement와 archive owner set 변경은 포함하지 않았습니다.

## 변경 파일

- canonical contract: `src/lib/planning/storage/runtimeRoots.mjs`, `writerOwnershipRegistry.mjs`, `writerTargets.ts`와 각 declaration
- guard/gate: `scripts/planning_writer_ownership_guard.mjs`, `scripts/planning_runtime_paths.mjs`, `scripts/quality_gates.mjs`, `package.json`
- root consumers: server/storage data dir, desktop/start-local, trim/migrate/weekly/scenario와 Planning ops/report/release scripts
- tests: `tests/planning/deployment/*Writer*.test.ts`, `planningRuntimeRoots.test.ts`, server/storage data-dir tests
- docs: `docs/planning-writer-ownership-contract.md`, 기존 inventory 문서와 이 작업 기록

## 남은 리스크

- AST scanner는 computed property, dynamic import/command, native addon과 external tool side effect의 formal proof가 아닙니다. `manual-indirect`, command graph, review와 후속 runtime lease로 보완해야 합니다.
- 현재 start-local/desktop instance evidence는 owner token, PID liveness, stale recovery를 가진 writer lease가 아닙니다.
- actual cross-process lease, launcher/server/store wiring, mutating CLI/scheduler wiring은 각각 PR B/C/D 범위입니다.
- packaged macOS old server root가 존재하면 자동 이동 대신 `PATH_MIGRATION_REQUIRED`가 발생하므로 별도 compatibility/migration 판단이 필요합니다.
- `WRITER_LEASE_IMPLEMENTED=false`
- `RUNTIME_LEASE_WIRING_IMPLEMENTED=false`
- `WRITER_EXCLUSIVITY_RUNTIME_PROVEN=false`
- `DESKTOP_LOCAL_END_TO_END_SUPPORTED=false`
- `RESTORE_APPLY_ENABLED=false`

## 다음 라운드 우선순위

- PR #292의 hosted CI/E2E 결과와 read-only review를 확인합니다.
- PR A가 검증된 뒤 PR B에서만 cross-process lease primitive와 Linux/Windows native filesystem tests를 구현합니다.
