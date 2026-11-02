# Planning v3 Boundary ADR

상태: accepted-current-state
기준일: 2026-06-29

## 결정

Planning v3는 v2의 즉시 대체재가 아니라 `ledger/import`, `draft/profile`, `news/exposure`, `scenario/journal` bounded context 모음입니다.

Stable planning 경로(`/planning`, `/planning/runs`, `/planning/reports`, `/planning/trash`)는 v2 profile/run/report surface를 계속 기준으로 삼습니다. Public Beta 경로(`/planning/v3/*`)는 v3 canonical owner를 직접 읽거나 쓰는 실험 surface이며, stable route를 v3 writer route로 해석하지 않습니다.

`DraftProfileRecord` apply가 stable planning profile을 생성하거나 갱신해도, stable profile owner가 v3 owner로 이동한 것은 아닙니다. apply는 명시적 handoff이며 rollback, export, migration 단위도 stable profile store와 draft store를 분리해 다룹니다.

## Canonical Owner

### Profile draft의 명시적 갱신 (2026-09-07)

`/planning/v3/profile/drafts/[id]`에서 기존 프로필 선택 → preflight → `선택한 프로필 갱신` 순서로 적용합니다. 선택 없음·점검 실패·오류·대상 변경 상태에서는 갱신을 차단합니다. 경고만 있는 기존 확인 흐름은 유지하며, `새 프로필로 만들기`는 보조 동작입니다.

- `POST /api/planning/v3/profile/drafts/[id]/preflight`: `applyMode: "update"`와 `profileId`가 있으면 월 3개 필드만 점검하고 `data.profileRevision`, `data.draftPatchHash`를 반환합니다. 표식은 저장되는 새 revision 필드가 아니라 현재 record/월 patch의 내용 hash입니다.
- 같은 draft의 `/apply`: `applyMode: "update"`, `profileId`, `expectedProfileRevision`, `expectedDraftPatchHash`를 전달합니다. 서버가 현재 사용자 범위에서 draft와 프로필을 다시 읽고 점검·검증하며, 저장 경계에서도 revision을 재확인합니다. 변경되었으면 409/`CONFLICT`를 반환하고 다시 preflight해야 합니다.
- mode 생략 또는 `applyMode: "create"`는 기존 신규 생성 계약입니다. `profileId`만 보냈다고 기존 프로필을 갱신하지 않습니다. 성공 응답은 두 mode 모두 `data.profileId`입니다.
- update는 제공된 `monthlyIncomeNet`, `monthlyEssentialExpenses`, `monthlyDiscretionaryExpenses`와 record의 `updatedAt`만 변경합니다. 구형 record에 같은 월 값의 `cashflow.monthlyIncomeKrw/monthlyFixedExpensesKrw/monthlyVariableExpensesKrw` 별칭이 있으면 제공된 필드의 별칭도 동기화하여 기존 canonical reader에서 이전 값으로 되돌아가지 않게 합니다. ID/name/createdAt/default, 자산·부채·목표·현금흐름 일정·tax/pensions 및 비대상 저장 필드를 보존합니다. 누락된 월 값은 기존 값을 유지합니다.
- update의 profile 쓰기는 기존 stable `updateProfile`과 atomic writer를 사용합니다. 원본 record를 한 번 교체하고 derived registry/default 파일은 변경하지 않으며, 기존 list reader가 metadata를 갱신합니다. 손상은 `STORAGE_CORRUPT`, 읽기 불가는 `STORAGE_UNAVAILABLE` 의미를 유지합니다. 실패한 atomic replacement의 임시 파일은 정리하고 원본 오류를 전달합니다.
- 성공 후 `/planning?profileId=<동일 ID>`로 이동합니다. 기본 프로필이면 `/dashboard`가 기존 run의 profile hash와 차이를 감지하고, 사용자가 기존 `현재 프로필로 다시 계산`을 눌러 새 run/report를 저장하면 current로 돌아옵니다. 프로필 저장·draft 생성·dashboard 진입만으로 apply/rerun하지 않습니다. 기존 run은 수정하지 않습니다.

정상 갱신·일반 수정·삭제/복원·legacy 이전 및 읽기 중 암호화 전환은 기존 process-local store lock을 공유합니다. 여러 프로세스가 같은 데이터를 쓰는 경우의 한계는 아래 Storage And PostgreSQL Boundary와 동일하며, 이 변경은 범용 revision framework나 저장 schema 변경이 아닙니다.

### 거래 부채상환과 stable 생활지출 (2026-09-07)

- `generateDraftPatchFromBatch`가 만드는 stable `monthlyEssentialExpenses`는 월별 `fixedExpenseKrw - debtExpenseKrw`의 중앙값입니다. `monthlyDiscretionaryExpenses`는 부채를 포함한 기존 fixed를 총지출에서 뺀 월별 variable의 중앙값으로 유지합니다. 두 생활지출 모두 부채상환을 제외하며, stable 엔진은 `debts.minimumPayment`를 별도로 차감합니다.
- v3 전역 `EXPENSE_FLOW_CATEGORY_POLICY`와 evidence의 월별·중앙값·category 합계 의미는 그대로입니다. `fixedExpenseKrw`에는 debt가 포함되고 `debtExpenseKrw`에도 별도로 관측값이 남습니다. evidence fixed와 stable essential은 같은 값이라는 계약이 아닙니다. `median(fixed) - median(debt)`는 사용하지 않습니다.
- 선택한 대상의 `debts=[]` 또는 기준 없는 신규 생성에서 관측 월 중 하나라도 부채상환이 있으면 preflight의 `OBSERVED_DEBT_WITHOUT_PROFILE_DEBT` 경고를 표시합니다. 경고는 유효성 오류가 아니며 기존 명시적 적용 흐름을 유지합니다. 이 상태의 stable 현금흐름은 관측 부채상환을 반영한 실제 순현금흐름으로 해석할 수 없습니다.
- update와 create-copy 모두 동일한 draft 월 값을 사용합니다. 거래를 근거로 새 부채를 만들거나 기존 `minimumPayment`를 바꾸지 않습니다. 관측값과 모델 상환액이 다르면 결과도 다를 수 있으며 자동 matching/보정은 하지 않습니다.
- 기존 저장 draft/profile/run은 자동으로 다시 계산하거나 수정하지 않습니다. 부채상환이 있는 완전한 월별 evidence에서 계산한 비부채 필수지출과 patch가 다르면 preflight와 create/update apply 모두 거부합니다. 원래 batch에서 새 초안을 생성한 뒤 확인해야 합니다. 월별 근거가 없는 legacy partial evidence는 기존 검증 계약을 유지하며 과거 계산을 추정하지 않습니다. plan-vs-actual은 별도 범위입니다.

| Context | Canonical owner | Stable boundary |
|---|---|---|
| transaction import | `ImportBatch`, `TransactionRecord` | v2 run/profile과 별도 |
| account and balance | `Account`, `OpeningBalance`, derived balance timeline | stable profile을 직접 대체하지 않음 |
| cashflow draft | `CsvDraftRecord` | preview/import 전용 |
| profile draft | `DraftProfileRecord` | apply 시 stable profile store로 handoff |
| news/exposure | `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile` | planning report source가 아님 |
| scenario library | `ScenarioLibraryOverrides` | planning run baseline을 자동 변경하지 않음 |

Derived/support artifacts는 canonical owner로 승격하지 않습니다. 예시는 balance timeline, batch summary, preflight result, effective news config, generated alert event state입니다.

`ImportBatch` 삭제 단위에는 저장된 batch metadata·transaction NDJSON과 같은 사용자 namespace의 category/account/transfer override sidecar가 함께 포함됩니다. 같은 사용자·batch ID의 import, 삭제, sidecar mutation은 lifecycle lock을 먼저 획득하고 각 파일 lock을 뒤에 획득해 직렬화합니다. 대기하던 sidecar mutation은 lock 안에서 batch 존재를 다시 확인하므로, 성공 삭제 뒤 orphan override를 만들지 않습니다. 같은 batch ID를 다시 가져올 때 삭제 전 override가 되살아나지 않아야 하며, 삭제 실패 시 남아 있는 batch의 sidecar snapshot을 복구한 뒤 대기 mutation이 진행됩니다. Profile draft는 독립 owner이므로 batch 삭제에 연쇄 삭제하지 않고, runtime-shared legacy 파일도 namespaced 사용자 삭제 범위에 포함하지 않습니다.

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

지원되는 Desktop Local runtime과 공식 mutating package script는 canonical app
control root의 cross-process writer lease로 중복 실행을 차단합니다. 이 lease를
우회한 직접 script, shared filesystem, 여러 server instance topology에서는 기존
process-local mutex만으로 저장 완료를 보장하지 않습니다. 해당 topology를 새로
지원하려면 file lock semantics, revision CAS 또는 DB transaction 전환 설계를
먼저 확정해야 합니다.

## 거래 관측 기반 Plan-vs-Actual v1

- draft 상세의 기준 프로필 선택 시 기존 `GET /api/planning/v2/runs?profileId=...`를 읽습니다. 저장 schema, API, provenance 저장소를 추가하지 않으며 현재 profile이나 draftPatch를 actual로 사용하지 않습니다.
- 동일 profileId의 명시적 `SUCCESS` 또는 `PARTIAL_SUCCESS`만 대상으로 합니다. `input.scenario` 또는 top-level `scenario`가 있는 what-if run은 제외합니다. 관측월보다 이전에 저장된 일반 run 중 최신 run을 선택하며, 최신 후보의 숫자가 부족하다고 더 오래된 run으로 조용히 바꾸지 않습니다.
- 월 경계는 저장 ISO timestamp의 UTC 월입니다. `run.createdAt`과 같은 월은 제외하고 그 다음 달 이후의 `evidence.ymStats`만 사용합니다. 이후 월이 없으면 `플랜 이후 관측 데이터가 아직 없습니다`로 안내합니다. 월별 evidence가 없거나 중복 월·비정형 숫자가 있으면 actual을 추정하지 않습니다.
- PLAN은 canonical `outputs.resultDto.timeline.points`의 `label=start`, `monthIndex=0`의 `incomeKrw`, `expensesKrw`, `debtPaymentKrw`입니다. 운영 잉여현금은 셋의 차입니다. 필요한 숫자가 없는 legacy 결과는 비교 불가이며, raw 결과의 canonical 변환도 누락된 수입·생활지출·부채상환을 0으로 채우지 않습니다. 기존 저장 결과를 rewrite하지 않습니다.
- canonical `debtPaymentKrw`에는 저장 당시 정책의 추가 상환도 포함될 수 있습니다. 이 비교의 계획 잉여현금은 해당 상환 전체를 차감한 값이며, 현재 profile 최소상환액이나 engine의 최소상환 기준 `operatingCashflow`로 바꾸지 않습니다.
- ACTUAL은 월별 `living=max(0, fixedExpenseKrw-debtExpenseKrw)+variableExpenseKrw`, `debt=debtExpenseKrw`, `operating=incomeKrw-living-debt`를 먼저 계산하고 네 지표 각각의 중앙값을 구합니다. 전체 관측 기간 중 플랜 이후 월만 사용하며 비연속 월도 표시합니다. 중앙값은 원 단위 반올림이며 각 지표 차이를 더해 정확한 원인 분해라고 해석하지 않습니다.
- 표는 계획 기준 / 최근 실제 중앙값 / 실제−계획 차이를 보여줍니다. 저장일과 사용 관측월을 표시하며, 잉여현금 차이는 높음·낮음·같음으로 설명합니다. 원인을 추정하거나 자동 apply/rerun을 실행하지 않습니다. 기존 preflight→update/create→dashboard stale→명시 rerun 경계를 유지합니다.
- run 목록은 고정 100개 offset으로 빈 응답까지 읽으며 짧은 비어 있지 않은 페이지도 계속 읽습니다. 조회 실패나 진행 없는 반복 응답은 부분 목록으로 비교하지 않고 재시도 안내를 보여줍니다. 기존 API에는 total/next가 없어 전체 페이지가 읽기 불가능한 record로만 이루어진 경우 그 뒤 기록의 존재까지 판정하지 못하는 한계가 있습니다.
- 이미 저장된 legacy DTO가 0이지만 함께 남은 첫 월 raw 자료로 누락 또는 0과의 불일치를 확인할 수 있으면 비교를 차단합니다. raw 자료는 오류 확인에만 쓰며 계획 숫자의 대체 출처로 사용하지 않습니다. raw 자료가 없는 compact DTO의 과거 합성 0과 실제 0은 구분할 근거가 없습니다. 과거 profile/run 정리나 월별 전체 timeline alignment는 포함하지 않습니다.

## Reopen Trigger

- stable `/planning*` route가 v3 owner를 직접 write해야 하는 요구가 생긴 경우
- `/planning/v3/*` beta route를 stable route로 승격하는 경우
- confirmed PostgreSQL apply 또는 bidirectional migration을 구현하는 경우
- legacy/global transaction path를 user-facing normal path로 다시 열어야 한다는 요구가 생긴 경우
- export/import/rollback 단위를 route 기준에서 owner 기준으로 재정의해야 하는 경우
