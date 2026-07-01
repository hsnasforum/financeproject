# Planning v3 Boundary ADR

상태: accepted-current-state
기준일: 2026-06-29

## 결정

Planning v3는 v2의 즉시 대체재가 아니라 `ledger/import`, `draft/profile`, `news/exposure`, `scenario/journal` bounded context 모음입니다.

Stable planning 경로(`/planning`, `/planning/runs`, `/planning/reports`, `/planning/trash`)는 v2 profile/run/report surface를 계속 기준으로 삼습니다. Public Beta 경로(`/planning/v3/*`)는 v3 canonical owner를 직접 읽거나 쓰는 실험 surface이며, stable route를 v3 writer route로 해석하지 않습니다.

`DraftProfileRecord` apply가 stable planning profile을 생성하거나 갱신해도, stable profile owner가 v3 owner로 이동한 것은 아닙니다. apply는 명시적 handoff이며 rollback, export, migration 단위도 stable profile store와 draft store를 분리해 다룹니다.

## Canonical Owner

| Context | Canonical owner | Stable boundary |
|---|---|---|
| transaction import | `ImportBatch`, `TransactionRecord` | v2 run/profile과 별도 |
| account and balance | `Account`, `OpeningBalance`, derived balance timeline | stable profile을 직접 대체하지 않음 |
| cashflow draft | `CsvDraftRecord` | preview/import 전용 |
| profile draft | `DraftProfileRecord` | apply 시 stable profile store로 handoff |
| news/exposure | `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile` | planning report source가 아님 |
| scenario library | `ScenarioLibraryOverrides` | planning run baseline을 자동 변경하지 않음 |

Derived/support artifacts는 canonical owner로 승격하지 않습니다. 예시는 balance timeline, batch summary, preflight result, effective news config, generated alert event state입니다.

## Route Boundary

- `/planning/v3/import/csv`: import batch, transaction, cashflow draft writer
- `/planning/v3/transactions/batches`: transaction batch list reader
- `/planning/v3/transactions/batches/[id]`: transaction and override reader/writer
- `/planning/v3/accounts`: account reader/writer
- `/planning/v3/balances`: account, opening balance, transaction 기반 derived reader
- `/planning/v3/profile/drafts*`: profile draft reader/writer/preflight
- `/planning/v3/news*`: news settings, exposure, digest/trend derived reader
- `/planning/v3/exposure`: exposure profile reader/writer
- `/planning/v3/scenarios`: scenario library override reader/writer

Route visibility는 `docs/current-screens.md`를 단일 기준으로 둡니다. 이 ADR은 route 존재 여부를 늘리거나 줄이지 않고, 이미 존재하는 beta route의 owner 해석만 고정합니다.

## Legacy And Migration

User-facing write path는 canonical v3 owner 또는 stable v2 owner만 사용합니다. Legacy/global file path는 명시적 migration, repair, compatibility reader에서만 허용합니다.

소유자를 판별할 수 없는 legacy 데이터는 자동으로 특정 사용자에게 배정하지 않고 quarantine 또는 read-only recovery 대상으로 분리합니다. Migration은 dry-run으로 대상 수, conflict 수, quarantine 수, checksum 또는 marker를 먼저 보고해야 합니다.

Migration apply와 rollback은 owner 단위로 설계합니다. `ImportBatch`와 transaction bundle, `DraftProfileRecord`와 stable profile apply, singleton config entity는 서로 다른 rollback unit입니다.

## Storage And PostgreSQL Boundary

현재 Planning v3 canonical owner의 대부분은 file/local store에 있습니다. PostgreSQL/Prisma 전환은 `planning:postgres:readiness`의 manifest, export, dry-run apply plan, checksum evidence를 먼저 통과해야 합니다.

Confirmed PostgreSQL apply는 아직 지원하지 않습니다. `scripts/planning_postgres_readiness.mjs --apply`는 preflight evidence를 만든 뒤 source data mutation 없이 실패하도록 의도적으로 막혀 있습니다.

여러 Node 프로세스나 여러 인스턴스가 같은 `PLANNING_DATA_DIR`을 공유한다면 process-local mutex만으로 저장 완료를 보장하지 않습니다. 이 topology에서는 file lock, revision CAS, 또는 DB transaction 전환 설계를 먼저 확정해야 합니다.

## Reopen Trigger

- stable `/planning*` route가 v3 owner를 직접 write해야 하는 요구가 생긴 경우
- `/planning/v3/*` beta route를 stable route로 승격하는 경우
- confirmed PostgreSQL apply 또는 bidirectional migration을 구현하는 경우
- legacy/global transaction path를 user-facing normal path로 다시 열어야 한다는 요구가 생긴 경우
- export/import/rollback 단위를 route 기준에서 owner 기준으로 재정의해야 하는 경우
