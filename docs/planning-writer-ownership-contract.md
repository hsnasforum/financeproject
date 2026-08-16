# Planning writer ownership contract

기준 main: `f9c3608f431a8f6e099455a899d71d85c2382840`

관련 이슈: #234, #232

## 상태

PR A는 Planning writer의 source, target, root, command graph를 machine-checkable하게 고정합니다.
cross-process lease, runtime enforcement, desktop identity와 production restore apply는 구현하지 않습니다.

- canonical target: 39개
- archive owner 참조: 기존 17개 exact set
- classified production mutation source: 63개
- explicit exclusion: 17개
- runtime/CLI/scheduler entrypoint: 46개
- unresolved source/target: 0개
- executable source 변경 파일: 25개(`package.json`, `.d.mts`, test, docs, `/work` 제외)

## Canonical root model

`src/lib/planning/storage/runtimeRoots.mjs`가 순수 입력만 받아 다음 세 root를 반환합니다.

| 이름 | 의미 | development 기본값 |
|---|---|---|
| `planningRoot` | Planning user/control/output root | `<cwd>/.data/planning` |
| `runtimeRoot` | runtime-shared owner의 기준 root | `<cwd>/.data` |
| `controlRoot` | archive/restore payload 밖 runtime control root | `<cwd>/.data/runtime` |

| 모드 | `planningRoot` | `runtimeRoot` | `controlRoot` |
|---|---|---|---|
| development | `<cwd>/.data/planning` | `<cwd>/.data` | `<cwd>/.data/runtime` |
| explicit `PLANNING_DATA_DIR=P` | `P` | `dirname(P)` | `P/runtime` |
| packaged Linux | `$XDG_DATA_HOME/<app>/vault` 또는 `~/.local/share/<app>/vault` | vault의 상위 | `<runtimeRoot>/runtime` |
| packaged macOS | `~/Library/Application Support/<app>/vault` | vault의 상위 | `<runtimeRoot>/runtime` |
| packaged Windows | `%LOCALAPPDATA%/<app>/vault`, `%APPDATA%` fallback | vault의 상위 | `<runtimeRoot>/runtime` |
| non-packaged production POSIX | `$XDG_DATA_HOME/<app>/vault` 또는 `~/.local/share/<app>/vault` | vault의 상위 | `<runtimeRoot>/runtime` |

resolver 내부에서는 `process.env`, `process.cwd()`, `os.homedir()`를 읽지 않습니다. adapter가 operation 시작 시 facts를 주입합니다. Windows drive/UNC 입력은 `path.win32`, 기존 POSIX 기반 cross-platform fixture는 POSIX path model을 사용합니다. app name의 separator, control character와 `.`/`..` segment는 root 탈출에 사용될 수 없습니다.

packaged macOS의 canonical root는 `~/Library/Application Support/<app>/vault`입니다. 과거 server-only POSIX production root인 `~/.local/share/<app>/vault`가 실제로 존재하면서 canonical root와 다르면 server와 script adapter는 `PATH_MIGRATION_REQUIRED`로 중단합니다. PR A는 기존 데이터를 새 root로 자동 이동하지 않습니다.

기존 instance lock 위치는 유지합니다.

- `start:local`: `<planningRoot>/runtime.lock`
- desktop launcher: `<controlRoot>/desktop-instance.lock.json`

두 파일은 instance evidence일 뿐 data-root-wide writer exclusivity 증거가 아닙니다.

## Target registry

기존 17-owner archive registry는 backup/restore completeness 계약으로 그대로 유지합니다. writer registry의 `archive:*` target은 owner ID를 참조하고 physical location을 `planningOwnerRegistry.ts`에서만 계산합니다. manifest v1, owner exact set과 archive scope는 바꾸지 않습니다.

| class | 수 | 대표 target | backup | restore |
|---|---:|---|---|---|
| `archive-owner` | 17 | `archive:stable.profile-run-vault`, `archive:v3.news` | owner manifest | owner restore |
| `user-runtime-control` | 7 | assumptions, migration, security, journal, trash, local auth | 제외 | operator-only 또는 disabled |
| `runtime-shared-control` | 4 | ops, future writer control, current instance evidence | 제외 | operator-only 또는 disabled |
| `derived-cache` | 1 | `derived.planning-cache` | 제외 | rebuild |
| `output-artifact` | 4 | share, release, regression, OpenAPI | 별도 산출물 | not applicable |
| `external-output` | 1 | operator-selected output | 별도 산출물 | not applicable |
| `disabled` | 1 | production restore apply | disabled | disabled |
| `fixture` | 1 | isolated Planning fixture | not applicable | not applicable |
| `out-of-scope` | 3 | feedback store, upload temp, Prisma SQLite DB | not applicable | not applicable |

### ROOT_FIRST 판정

| current path/source | physical root | class | namespace | canonical target |
|---|---|---|---|---|
| assumptions history/legacy overrides | `planningRoot/assumptions` | user control, authoritative | user | `control.assumptions` |
| assumptions latest | `planningRoot/assumptions.latest.json` | user control, authoritative | user | `control.assumptions-latest` |
| profile-partition assumptions override | stable vault profile partition | archive owner | user | `archive:stable.profile-run-vault` |
| Planning cache | `planningRoot/cache` | derived, non-authoritative | user | `derived.planning-cache` |
| migration state/snapshot | `planningRoot/migrations` | user control, authoritative | user | `control.migrations` |
| vault/security state | `planningRoot/security` | user control, authoritative | user | `control.security` |
| storage journal | `planningRoot/storage` | user control, authoritative | user | `control.storage-journal` |
| trash metadata | `planningRoot/trash` | user control, authoritative | user | `control.trash` |
| local auth index | `planningRoot/users/index.json` | user control, secret-bearing | user | `control.local-auth` |
| share artifacts | `planningRoot/share` | output, non-authoritative | user | `output.share` |
| action/audit/metrics/scheduler/backup control | `planningRoot/ops` | runtime control, authoritative | runtime-shared | `control.ops` |
| release logs/evidence/record | `planningRoot/release` | output | runtime-shared | `output.release` |
| regression output | `planningRoot/eval` | output | runtime-shared | `output.regression` |
| OpenAPI output | `planningRoot/openapi` | output | runtime-shared | `output.openapi` |
| weekly HTML default | canonical `v3.news/reports` | archive owner | user | `archive:v3.news` |
| archive/support caller output | caller-selected path | external output | external | `output.external` |
| restore apply | canonical owners, production mutation blocked | disabled | none | `disabled.restore-apply` |
| auth SQLite backfill | `DATABASE_URL`이 선택한 Prisma SQLite | out of scope, authoritative | external | `outside.prisma-db` |

authoritative assumptions, migration, security, journal, trash와 auth state를 cache로 낮추지 않았습니다. secret/control state를 archive manifest에 자동 추가하지 않았습니다.

## Source and command graph

`writerOwnershipRegistry.mjs`는 감사 하한 62개를 모두 대조하고 실제로 확인된 63개 source를 exact path로 등록합니다. 추가 source는 Prisma SQLite DB를 변경하는 `planning:auth:sqlite-backfill`이며 Planning data-root lease가 아니라 DB migration 경계의 `out-of-scope` target으로 분류합니다. direct fs, SQLite, atomic helper와 `manual-indirect` 신호를 구분하며 모든 production source는 최소 한 target을 가집니다. HTTP runtime source/target 집합은 `futureLeasePolicy=inherited-runtime` source에서 파생되므로 수동 subset이 될 수 없습니다.

46개 entrypoint는 package alias, executable, source, target, parent-child 관계와 미래 lease policy를 기록합니다. `start:raw`와 restore apply는 disabled, doctor/export/support/CSV preview는 read-only입니다. current desktop/start-local instance lock은 별도 exact file target이며 writer lease로 해석하지 않습니다.

## Path compatibility

| consumer | before | after | 결과 |
|---|---|---|---|
| server Planning data dir | server-local formula | canonical root resolver | 동일 |
| desktop launcher | launcher-local packaged formula | canonical `controlRoot` adapter | lock 위치 동일 |
| start-local | local duplicated formula | canonical `planningRoot` adapter | lock 위치 동일 |
| v3 trim | `cwd/.data/{news,indicators,alerts,journal}` | archive owner targets | development 동일; 다른 모드에서 legacy 존재 시 차단 |
| v3 migrate | `cwd/.data/{news,indicators}`와 `.data/exposure/profile.json` | archive owner targets | development exact file 동일; 다른 모드에서 legacy 존재 시 차단 |
| weekly HTML | `cwd/.data/news` | `archive:v3.news` | development 동일; 다른 모드에서 legacy 존재 시 차단 |
| ops/release/eval/openapi/assumptions scripts | `cwd/.data/planning/*` | registered non-archive target | development 동일; 다른 모드에서 legacy 존재 시 차단 |

기존 path와 canonical path가 다르고 기존 path가 존재하면 `PATH_MIGRATION_REQUIRED:<old>-><new>`로 중단합니다. PR A는 파일을 이동하거나 복사하지 않습니다. v3 migrate apply backup은 runtime root 전체가 아니라 실제 migration target만 별도 backup root에 복사합니다.

## Drift guard

`pnpm planning:writer:guard`는 required quality gate이며 `pnpm verify`와 `release:verify` early-required suite에 연결됩니다.

1. TypeScript AST로 fs namespace/named alias, promises API, atomic helper와 SQLite candidate를 스캔합니다.
2. source tree와 Planning package script executable을 함께 스캔하고 63 source와 17 explicit exclusion의 합집합과 비교합니다.
3. target ID, class/root/namespace, file/directory, backup/restore, authoritative, archive exact set, traversal, wildcard, Windows case, Unicode normalization과 parent/child overlap을 검사합니다.
4. package alias, executable, source/target reference, `child_process`/shell child command, cycle와 exported source-to-entrypoint graph를 검사합니다.
5. active writer의 aliased `path.join/resolve(cwd, ".data", ...)`, template/concatenation과 packaged root 복제를 차단합니다.
6. target/source/exclusion/entrypoint의 stable canonical JSON을 SHA-256으로 digest합니다. ordering은 digest를 바꾸지 않고 description, notes와 exclusion evidence를 포함한 의미 변경은 digest를 바꿉니다.

### 한계

AST guard는 whole-program proof가 아닙니다. computed property 호출, deeply dynamic import, 완전히 동적인 command, native addon과 external tool side effect는 자동 추적하지 못할 수 있습니다. 이런 source는 exact `manual-indirect` set, source-to-entrypoint graph와 명시적 child mapping으로 보완하며, review와 이후 PR B/C/D runtime lease가 추가 방어층입니다. `legacyPath` 구조 필드는 그 값만 compatibility evidence로 허용하고, 같은 줄의 다른 active path를 숨기지 않습니다. inline disable comment만으로 exclusion을 만들 수 없습니다.

## 후속 경계

- PR B: cross-process lease primitive와 Linux/Windows native filesystem test
- PR C: launcher/direct-server/store mutation boundary wiring
- PR D: mutating CLI/scheduler parent-child wiring

PR A만으로 `writerExclusivity=data-root-exclusive`, desktop-local end-to-end 지원 또는 production restore apply를 주장할 수 없습니다.
