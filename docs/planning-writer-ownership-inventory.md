# Planning writer ownership inventory

기준 main: `f9c3608f431a8f6e099455a899d71d85c2382840`

관련 이슈: #234 Phase A, #232 Phase C prerequisite

## 판정

`WRITER_INVENTORY_REQUIRES_SPLIT`

현재 writer surface는 한 PR에서 모두 정규화하고 lease를 연결해
`writerExclusivity=data-root-exclusive`를 주장할 수 있는 크기가 아닙니다.

- canonical archive owner: 17개
- `src/lib/planning` 및 `src/lib/news`의 direct filesystem candidate: 43개
- generic primitive 2개와 source read-only/output-only 2개를 제외한 direct source/control mutator: 39개
- `src/lib/ops`, `src/lib/audit`, `atomicWrite` 기반 간접 writer를 포함한 추가 production-relevant mutation module: 22개
- direct filesystem 검색에 잡히지 않은 scheduler policy writer: 1개
- 현재 감사된 source/control mutation module 하한: 62개
- 실행 가능한 command/runtime entrypoint: 20개 초과

이 수치는 완전한 semantic scanner가 아니라 source import, filesystem call,
package command와 child process를 대조한 감사 결과입니다. 따라서 새 registry와
drift guard가 생기기 전까지 62개를 “완전한 전체 수”로 과장하지 않습니다.
다만 지시문의 20개 중단 기준을 넘고, owner가 불명확한 live path가 존재한다는
판정에는 충분합니다.

## 정책 표기

- `INHERIT`: launcher/server가 가진 runtime lease를 mutation 시점에 검증
- `ONESHOT`: CLI가 source 접근 전에 lease를 취득하고 자기 token으로 해제
- `ROOT_FIRST`: canonical owner/root를 먼저 확정한 뒤에만 lease 연결
- `DISABLED`: mutation 전에 fail closed
- `READ_ONLY`: Planning source lease 불필요
- `FIXTURE`: production exclusivity 증거에서 제외
- `OUT_OF_SCOPE`: Planning data root 밖의 writer

## Direct source/control writer 39개

| # | Source | owner/path | 분류 | 현재 lock | Phase A 정책 |
|---:|---|---|---|---|---|
| 1 | `src/lib/news/alerts.ts` | `v3.alerts` | SERVER_MUTATION | 없음 | INHERIT |
| 2 | `src/lib/news/exposureStore.ts` | `v3.exposure` | SERVER_MUTATION | 없음 | INHERIT |
| 3 | `src/lib/news/searchIndex.ts` | `v3.news` | SERVER_MUTATION | 없음 | INHERIT |
| 4 | `src/lib/news/storageSqlite.ts` | `v3.news`, SQLite/artifacts | SERVER_MUTATION | SQLite 자체만 | INHERIT |
| 5 | `src/lib/planning/assumptions/overridesStorage.ts` | unregistered assumptions overrides | SERVER_MUTATION | 없음 | ROOT_FIRST → INHERIT |
| 6 | `src/lib/planning/assumptions/storage.ts` | unregistered assumptions latest/history | SERVER_MUTATION | 없음 | ROOT_FIRST → INHERIT |
| 7 | `src/lib/planning/cache/storage.ts` | unregistered cache | SERVER_MUTATION | 없음 | ROOT_FIRST → INHERIT |
| 8 | `src/lib/planning/migrations/manager.ts` | unregistered migration snapshots | CLI_MUTATION | 없음 | ROOT_FIRST → ONESHOT |
| 9 | `src/lib/planning/migrations/runner.ts` | `stable.profile-run-vault` migration targets | CLI_MUTATION | 없음 | ROOT_FIRST → ONESHOT |
| 10 | `src/lib/planning/retention/cleanup.ts` | stable owners + cache/ops/assumptions/trash | CLI_MUTATION | 없음 | ROOT_FIRST → ONESHOT |
| 11 | `src/lib/planning/security/vaultReset.ts` | planning root/security/audit | SERVER_MUTATION | 없음 | ROOT_FIRST → INHERIT |
| 12 | `src/lib/planning/security/vaultState.ts` | unregistered vault state/config | SERVER_MUTATION | 없음 | ROOT_FIRST → INHERIT |
| 13 | `src/lib/planning/storage/consistency.ts` | `stable.profile-run-vault` | SERVER_MUTATION | 없음 | INHERIT |
| 14 | `src/lib/planning/storage/journal.ts` | unregistered storage journal | SERVER_MUTATION | 없음 | ROOT_FIRST → INHERIT |
| 15 | `src/lib/planning/store/profileStore.ts` | `stable.profile-run-vault` | SERVER_MUTATION | 일부 helper만 process-local | INHERIT |
| 16 | `src/lib/planning/store/runCreateStore.ts` | `stable.profile-run-vault` | SERVER_MUTATION | 일부 helper만 process-local | INHERIT |
| 17 | `src/lib/planning/store/runMetaWriter.ts` | `stable.profile-run-vault` | SERVER_MUTATION | 없음 | INHERIT |
| 18 | `src/lib/planning/store/runReadMigration.ts` | `stable.profile-run-vault` write-on-read | SERVER_MUTATION | 없음 | INHERIT |
| 19 | `src/lib/planning/store/runTrashStore.ts` | stable runs + unregistered trash | SERVER_MUTATION | 없음 | ROOT_FIRST → INHERIT |
| 20 | `src/lib/planning/store/trash.ts` | stable owners + unregistered trash | SERVER_MUTATION | 없음 | ROOT_FIRST → INHERIT |
| 21 | `src/lib/planning/v3/alerts/store.ts` | `v3.alerts` | SERVER_MUTATION | 없음 | INHERIT |
| 22 | `src/lib/planning/v3/drafts/draftStore.ts` | `v3.csv-drafts` | SERVER_MUTATION | 없음 | INHERIT |
| 23 | `src/lib/planning/v3/exposure/store.ts` | `v3.exposure` | SERVER_MUTATION | 없음 | INHERIT |
| 24 | `src/lib/planning/v3/indicators/specOverrides.ts` | `v3.indicators` | SERVER_MUTATION | 없음 | INHERIT |
| 25 | `src/lib/planning/v3/indicators/store/index.ts` | `v3.indicators` | SERVER_MUTATION | 없음 | INHERIT |
| 26 | `src/lib/planning/v3/journal/store.ts` | `v3.journal` | SERVER_MUTATION | 없음 | INHERIT |
| 27 | `src/lib/planning/v3/news/notes.ts` | `v3.news` | SERVER_MUTATION | 없음 | INHERIT |
| 28 | `src/lib/planning/v3/news/search.ts` | `v3.news` | SERVER_MUTATION | 없음 | INHERIT |
| 29 | `src/lib/planning/v3/news/settings.ts` | `v3.news` | SERVER_MUTATION | 없음 | INHERIT |
| 30 | `src/lib/planning/v3/news/store/index.ts` | `v3.news` | SERVER_MUTATION | 없음 | INHERIT |
| 31 | `src/lib/planning/v3/news/weeklyPlan.ts` | `v3.news` | SERVER_MUTATION | 없음 | INHERIT |
| 32 | `src/lib/planning/v3/ops/migrate.ts` | news/indicators/exposure via `cwd/.data/*` | CLI_MUTATION | canonical root 우회 | ROOT_FIRST → ONESHOT |
| 33 | `src/lib/planning/v3/ops/trim.ts` | news/indicators/alerts/journal via `cwd/.data/*` | CLI_MUTATION | canonical root 우회 | ROOT_FIRST → ONESHOT |
| 34 | `src/lib/planning/v3/report/weeklyHtml.ts` | `.data/news/reports/weekly.latest.html` | CLI_MUTATION | 없음 | ROOT_FIRST → ONESHOT |
| 35 | `src/lib/planning/v3/routines/store.ts` | `v3.routines` | SERVER_MUTATION | 없음 | INHERIT |
| 36 | `src/lib/planning/v3/scenarios/library.ts` | `v3.scenario-overrides` | SERVER_MUTATION | 없음 | INHERIT |
| 37 | `src/lib/planning/v3/service/transactionStore.ts` | `v3.legacy-transactions` | SERVER_MUTATION | 없음 | INHERIT |
| 38 | `src/lib/planning/v3/store/batchesStore.ts` | `v3.batches` | SERVER_MUTATION | process-local queue만 | INHERIT |
| 39 | `src/lib/planning/v3/store/draftStore.ts` | `v3.drafts` | SERVER_MUTATION | 없음 | INHERIT |

## 추가 helper/ops/audit writer 22개

| # | Source | owner/path | 분류 | Phase A 정책 |
|---:|---|---|---|---|
| 1 | `src/lib/audit/auditLogStore.ts` | planning ops legacy audit | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 2 | `src/lib/ops/actions/actionLog.ts` | planning ops action log | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 3 | `src/lib/ops/autoMergePolicy.ts` | planning ops auto-merge policy | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 4 | `src/lib/ops/backup/planningDataVault.ts` | assumptions/ops/legacy restore targets | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 5 | `src/lib/ops/backup/previewToken.ts` | planning ops backup receipt/lock | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 6 | `src/lib/ops/backup/replaceRestoreTransaction.ts` | legacy restore snapshot/rollback targets | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 7 | `src/lib/ops/dataQuality.ts` | planning ops data-quality report | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 8 | `src/lib/ops/metrics/metricsStore.ts` | planning ops metrics | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 9 | `src/lib/ops/metricsLog.ts` | planning ops metrics events | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 10 | `src/lib/ops/scheduler/health.ts` | planning ops scheduler health state | SERVER/CLI_MUTATION | ROOT_FIRST → INHERIT/ONESHOT |
| 11 | `src/lib/ops/securityAuditLog.ts` | planning ops security audit | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 12 | `src/lib/planning/auth/localAuth.ts` | planning local user index | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 13 | `src/lib/planning/reports/storage.ts` | `stable.reports` | SERVER_MUTATION | INHERIT |
| 14 | `src/lib/planning/share/storage.ts` | unregistered share artifacts | SERVER_MUTATION | ROOT_FIRST → INHERIT |
| 15 | `src/lib/planning/store/runActionStore.ts` | stable run action center | SERVER_MUTATION | process-local queue만 | INHERIT |
| 16 | `src/lib/planning/store/runRecordCodec.ts` | stable run records | SERVER_MUTATION | 없음 | INHERIT |
| 17 | `src/lib/planning/v3/store/accountMappingOverridesStore.ts` | v3 account mapping overrides | SERVER_MUTATION | process-local queue만 | INHERIT |
| 18 | `src/lib/planning/v3/store/accountsStore.ts` | `v3.accounts` | SERVER_MUTATION | process-local queue만 | INHERIT |
| 19 | `src/lib/planning/v3/store/categoryRulesStore.ts` | `v3.category-rules` | SERVER_MUTATION | process-local queue만 | INHERIT |
| 20 | `src/lib/planning/v3/store/openingBalancesStore.ts` | `v3.opening-balances` | SERVER_MUTATION | process-local queue만 | INHERIT |
| 21 | `src/lib/planning/v3/store/txnOverridesStore.ts` | `v3.transaction-overrides` | SERVER_MUTATION | process-local queue만 | INHERIT |
| 22 | `src/lib/planning/v3/store/txnTransferOverridesStore.ts` | `v3.transaction-overrides` | SERVER_MUTATION | process-local queue만 | INHERIT |

추가로 `src/lib/ops/scheduler/policy.ts`는 `fsPromises.writeFile/rename/rm`을
사용하여 planning ops scheduler policy를 변경합니다. direct-FS 기본 검색식의
`fs.` prefix 밖에 있어 별도 확인했으며 `ROOT_FIRST → INHERIT` 대상입니다.

## 명시적 제외 source

| Source | 분류 | 근거 |
|---|---|---|
| `src/lib/planning/server/runtime/dataDir.ts` | generic primitive | resolver/ensure helper이며 owner 결정 주체가 아님 |
| `src/lib/planning/storage/atomicWrite.ts` | generic primitive | caller owner를 모르는 atomic replace helper |
| `src/lib/ops/backup/planningOwnerArchive.ts` | READ_ONLY source | source는 읽고 caller-selected archive만 생성 |
| `src/lib/planning/v3/ops/export.ts` | READ_ONLY source | source mutation 없이 export archive 생성 |
| `src/lib/planning/v3/ops/supportBundle.ts` | READ_ONLY source | source mutation 없이 support archive 생성 |
| `src/lib/ops/backup/uploadTemp.ts` | OUT_OF_SCOPE | `os.tmpdir()` upload fixture |
| `src/lib/ops/feedback/planningFeedbackStore.ts` | OUT_OF_SCOPE | `.data/ops/feedback`, Planning root 밖 |
| `src/lib/ops/backup/planningOwnerRestoreTransaction.ts` | FIXTURE | 현재 production orchestration에 연결되지 않음 |

## Process/command entrypoint inventory

| ID | entrypoint | 실행 형태 | target | 현재 lock/child | 정책 |
|---|---|---|---|---|---|
| runtime.direct-server | `pnpm start` → `next_prod_safe.mjs` | parent + Next child | 모든 server owner | lease 없음 | parent acquire, child INHERIT |
| runtime.local | `pnpm start:local` | parent + dev child | 모든 server owner | `runtime.lock` PID lock | runtime lease 별도 acquire, child INHERIT |
| runtime.desktop | `planning:v2:desktop:launch` | launcher + Next child | 모든 server owner | UI instance lock만 | launcher acquire, child INHERIT |
| runtime.raw | `pnpm start:raw` | raw Next | 모든 server owner | 없음 | DISABLED 또는 explicit owner 필요 |
| runtime.http-store | HTTP mutation routes/store exports | server child | owner별 | 일부 process-local queue | mutation boundary INHERIT |
| cli.news-refresh | `news:refresh` | one-shot CLI | news/alerts/exposure | 없음 | ONESHOT |
| cli.indicators-refresh | `indicators:refresh` | one-shot CLI | indicators/alerts | 없음 | ONESHOT |
| cli.refresh-all | `v3:refresh-all` | parent + pnpm child | news/indicators/alerts | 없음 | outer ONESHOT, child INHERIT |
| cli.v3-trim | `v3:trim --apply` | one-shot CLI | news/indicators/alerts/journal | 없음, root 우회 | ROOT_FIRST → ONESHOT |
| cli.v3-migrate | `v3:migrate --apply` | one-shot CLI | news/indicators/exposure | 없음, root 우회 | ROOT_FIRST → ONESHOT |
| cli.assumptions | `planning:assumptions:sync` | one-shot CLI | assumptions | 없음 | ROOT_FIRST → ONESHOT |
| cli.ops-assumptions | `ops:refresh-assumptions` | one-shot CLI | assumptions + ops audit/metrics | 없음 | ROOT_FIRST → ONESHOT |
| cli.monthly | `planning:run:monthly` | one-shot CLI | profile/run + ops | 일부 process-local queue | ONESHOT |
| cli.v2-seed | `planning:v2:seed` | one-shot CLI | profile/run | 없음 | ONESHOT |
| cli.v2-backfill | `planning:v2:backfill-legacy-runs --apply` | one-shot CLI | stable runs | 없음 | ONESHOT |
| cli.v2-migrate | `planning:v2:migrate:apply` | one-shot CLI | stable owners + snapshots | 없음 | ROOT_FIRST → ONESHOT |
| cli.ops-run | `planning:v2:ops:run*` | parent + child | assumptions + ops reports/logs | 없음 | outer ONESHOT, child INHERIT |
| cli.ops-safety | `planning:v2:ops:safety*` | parent + child | ops reports/logs/audit | 없음 | outer ONESHOT, child INHERIT |
| cli.scheduler-health | `planning:v2:ops:scheduler:health` | one-shot CLI | ops health/audit/metrics | 없음 | ONESHOT |
| cli.ops-prune | `planning:v2:ops:prune` | one-shot CLI | ops reports/logs | 없음 | ONESHOT |
| scheduler.ops | `scripts/planning_v2_ops_scheduler.sh` | shell + pnpm child | ops + monthly child targets | log append만 | outer ONESHOT, child INHERIT |
| scheduler.daily | `daily:refresh` | Node + pnpm child | news/indicators steps + non-Planning steps | 없음 | Planning child는 inherited/one-shot, 나머지는 OUT_OF_SCOPE |
| cli.v2-report | `planning:v2:report` | one-shot CLI | `stable.reports` | 없음 | ONESHOT |
| cli.v2-regress | `planning:v2:regress*` | one-shot CLI | eval/report/audit | 없음 | ROOT_FIRST → ONESHOT |
| cli.v2-final-report | `planning:v2:final-report` | parent + gate child | release logs + docs output | 없음 | Planning writes ONESHOT |
| cli.v2-record | `planning:v2:record` | one-shot CLI | release completion record | 없음 | ONESHOT |
| cli.v2-evidence | `planning:v2:release:evidence` | one-shot CLI | release evidence archive | 없음 | ONESHOT |
| cli.v2-release | `planning:v2:release*` | parent + child | release logs/evidence/record | 없음 | outer ONESHOT, child INHERIT |
| cli.weekly-report | `v3:report:weekly` | one-shot CLI | news reports | 없음 | ROOT_FIRST → ONESHOT |
| cli.cleanup | `cleanup` | one-shot CLI | retention targets + tmp | 없음 | Planning targets ONESHOT |
| cli.restore | `v3:restore --apply` | CLI | restore targets | mutation 전 차단 | DISABLED |
| cli.doctor | `v3:doctor` | CLI | source owners | read-only | READ_ONLY |
| cli.export | `v3:export` | CLI | source owners + archive output | source read-only | READ_ONLY source |
| cli.support | `v3:support-bundle` | CLI | source owners + archive output | source read-only | READ_ONLY source |
| cli.csv-preview | `planning:v3:import:csv` | CLI | input CSV/stdout | source mutation 없음 | READ_ONLY |
| fixture.samples | report samples/regression isolated fixture | test/fixture | fixture root | isolated helper | FIXTURE |

## 현재 root/lock 불일치

- server resolver는 `NODE_ENV=production`에서 packaged vault를 선택합니다.
- desktop launcher는 별도 packaged flag를 사용하고 macOS base 처리도 다릅니다.
- `start_local_lock.mjs`가 별도 resolver를 복제합니다.
- `trim`, `migrate`, weekly report와 ops/release script 일부는 `cwd/.data/*`를 직접 조립합니다.
- 현재 desktop/start-local lock은 invalid evidence를 stale로 보고 삭제하며 token 소유권이 없습니다.
- `withPlanningStoreWriteLock`은 `Map + AsyncLocalStorage` 기반 process-local queue입니다.

## 권장 PR 분할

### PR A — Writer registry와 canonical root 수렴

범위:

- 모든 production mutation source에 owner 또는 exclusion을 지정
- unregistered assumptions/cache/security/trash/migration/journal/ops/release path 결정
- launcher/server/CLI가 공유하는 plain ESM root resolver
- `trim`, `migrate`, weekly report, ops/release path를 canonical resolver로 수렴
- package alias, imported command, exported bypass, scheduler child registry와 drift guard

완료 기준:

1. production mutation source마다 정확히 한 owner 또는 exclusion 사유가 있습니다.
2. unregistered live Planning path가 0개입니다.
3. explicit/dev/packaged 환경에서 launcher/server/CLI control root가 같습니다.
4. `cwd/.data/*` 직접 target 조립이 active writer에 남지 않습니다.
5. package alias와 실제 imported command drift를 CI가 차단합니다.
6. 새 writer가 registry 없이 추가되면 CI가 실패합니다.
7. `data-root-exclusive`는 아직 반환하지 않습니다.

### PR B — Cross-process lease primitive

범위:

- no-clobber acquire/verify/release/recovery guard
- `.mjs + .d.mts` exact contract
- 256-bit token, domain-separated digest, strict bounded record
- owner/holder PID 3-state liveness와 immutable holder evidence
- Linux/Windows focused tests
- runtime/CLI wiring 없음

완료 기준:

1. 동시 acquire 중 정확히 하나만 성공합니다.
2. raw token은 record/log/error에 저장되지 않습니다.
3. release는 자기 token/root/lease identity가 모두 일치할 때만 성공합니다.
4. malformed/truncated/symlink/reparse/PID unknown evidence는 자동 삭제하지 않습니다.
5. dead owner와 dead holder가 모두 증명된 경우에만 recovery guard 아래 reclaim합니다.
6. old token이 새 lease를 해제할 수 없습니다.
7. registry/root digest mismatch가 fail closed합니다.
8. 지원하지 않는 Windows filesystem/path alias에서는 exclusivity가 `unknown`입니다.

### PR C — Server·launcher runtime wiring

범위:

- desktop launcher, `start:local`, `next_prod_safe`
- child에 선택적 opaque capability 전달
- server mutation boundary의 holder/lease 재검증
- 기존 process-local keyed queue 유지

완료 기준:

1. runtime 하나가 lease를 보유하면 다른 runtime/CLI 시작이 차단됩니다.
2. launcher UI lock은 exclusivity 증거로 사용하지 않습니다.
3. parent death 후 child의 다음 mutation이 fail closed합니다.
4. 진행 중 mutation holder가 살아 있으면 stale reclaim을 허용하지 않습니다.
5. exported store function 직접 호출도 lease를 우회하지 못합니다.
6. read-only 경로는 불필요하게 source lease를 요구하지 않습니다.
7. 검증된 runtime에서만 adapter가 `data-root-exclusive`를 반환합니다.
8. child crash, parent crash, 정상 종료가 Linux/Windows에서 검증됩니다.

### PR D — CLI·scheduler wiring

범위:

- registry의 모든 mutating CLI와 scheduler
- composite parent/child inheritance
- disabled restore와 source read-only command 계약 보존

완료 기준:

1. 모든 mutating command가 ONESHOT 또는 inherited child로 분류됩니다.
2. server active 중 CLI는 첫 source write 전에 실패합니다.
3. CLI active 중 server/다른 CLI acquire가 실패합니다.
4. composite runner는 outer lease 하나만 취득하고 child가 같은 capability를 검증합니다.
5. direct imported command 실행도 guard를 우회하지 못합니다.
6. 성공/오류/signal 종료에서 자기 lease만 해제합니다.
7. lease 거절 시 source checksum이 바뀌지 않습니다.
8. restore apply는 계속 비활성이고 doctor/export/support/CSV preview는 source read-only입니다.

## Phase A 안전 결론

PR A가 owner/root/registry 계약을 닫기 전에 lease primitive를 부분 구현하면
현재 누락된 writer가 그대로 경쟁할 수 있습니다. 이 상태에서
`data-root-exclusive`를 반환하는 것은 금지합니다.

## PR A 구현 갱신

위 inventory는 기준 main의 감사 하한과 분할 근거로 유지합니다. PR A 구현 결과의 canonical 계약은 `docs/planning-writer-ownership-contract.md`를 따릅니다.

- audited candidate lower bound: 62
- classified production mutation source: 63
- explicit exclusion: 17
- canonical target: 39(기존 archive owner 참조 17 포함)
- entrypoint: 46
- unresolved source/target: 0
- canonical root resolver: implemented
- AST/package/child/direct-path/exported-bypass drift guard: required gate
- archive owner exact set/manifest v1: unchanged
- path migration performed: none
- writer lease/runtime wiring: not implemented

inventory 당시 `ROOT_FIRST`였던 assumptions/cache/migration/security/journal/trash/local-auth/share/ops/release 경로는 control, derived, output 또는 기존 archive owner target으로 분류했습니다. current instance lock은 별도 control file로 기록하지만 writer exclusivity evidence로 사용하지 않습니다. 자세한 physical path, backup/restore 정책, compatibility와 scanner 한계는 계약 문서에 기록했습니다.

구현 중 `planning:auth:sqlite-backfill`이 추가 mutation source로 확인되었습니다. 이 command는 Prisma SQLite DB를 변경하지만 Planning data-root lease 대상은 아니므로 `outside.prisma-db` target과 `out-of-scope` policy로 명시했으며, package executable scanner가 같은 유형의 미등록 script를 fail closed합니다.
