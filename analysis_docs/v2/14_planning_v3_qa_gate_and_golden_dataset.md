# 14. planning/v3 QA gate and golden dataset 정의

작성 기준: `N1 canonical entity model`, `N2 owner-based API/import-export/rollback contract`, 2026-03-17(KST)
범위: existing command/test asset을 `public stable / public beta / ops-dev` gate로 재분류하고 golden dataset category를 고정

---

## 1. 목적

이 문서는 현재 저장소에 이미 있는 검증 명령과 테스트 자산을 기준으로,
`public stable`, `public beta`, `ops/dev`를 같은 통과 기준으로 보지 않도록
다음 사이클용 QA gate matrix와 golden dataset 기준을 문서화하기 위한 문서입니다.

이번 문서의 목적은 아래 5가지입니다.

1. route policy에 맞는 QA gate tier를 다시 정의한다.
2. existing command를 `required`, `conditional required`, `advisory`, `final single-owner gate`로 재배치한다.
3. `planning/v3` beta route가 stable release gate와 자동으로 묶이지 않도록 기준을 잠근다.
4. golden dataset을 owner/contract/projection/e2e/ops-repair 축으로 다시 정리한다.
5. `N4 beta exposure`가 재사용할 gate/visibility 전제조건을 남긴다.

비범위:

- 새 테스트 추가
- 새 script 추가
- CI 파이프라인 재설계
- route visibility 최종 확정

---

## 2. 분류 기준

## 2.1 gate tier

### public stable

- `docs/current-screens.md`의 `Public Stable` 경로를 기본 보호 대상으로 본다.
- 기존 stable 사용자 흐름, stable planning v2 owner, report/history/recommend/public helper와 직접 연결된 변경이 여기에 속한다.

### public beta

- `docs/current-screens.md`의 `Public Beta` 경로를 대상으로 본다.
- `planning/v3/*`처럼 공개 검토는 가능하지만 stable release blocker와는 분리해야 하는 변경이 여기에 속한다.

### ops/dev

- `Local-only Ops`, `Dev/Debug` 경로와 internal support route를 대상으로 본다.
- public release blocker와 분리하고, 내부 안전성/진단/복구 관점으로만 평가한다.

## 2.2 command 분류 용어

### required

- 해당 tier/class of change에서 기본적으로 반드시 통과해야 하는 명령

### conditional required

- 특정 변경 종류일 때만 반드시 통과해야 하는 명령

### advisory

- 결과를 확인하는 것이 권장되지만, 해당 tier의 기본 blocker는 아닌 명령

### final single-owner gate

- shared runtime, shared build state, shared e2e state를 쓰므로 메인 단일 소유자로만 최종 PASS/FAIL을 판정해야 하는 명령

---

## 3. existing command 역할 재분류

## 3.1 command role table

| 명령 | 역할 재정의 | 비고 |
| --- | --- | --- |
| `pnpm build` | stable/beta 공통 기본 required | route/page/build 영향이 있으면 기본 gate |
| `pnpm lint` | stable/beta 기본 required | React/TS/route/page 수정이 있으면 기본 gate |
| `pnpm test` | stable/beta/ops-dev 공통 기본 required | 필요한 경우 file-targeting으로 좁힌다 |
| `pnpm verify` | repo-wide hygiene gate | public stable RC 또는 cross-product/shared data change에서 conditional required |
| `pnpm planning:current-screens:guard` | route inventory 최소 gate | route/href/current-screens 변경 시 stable/beta에서 conditional required |
| `pnpm planning:ssot:check` | stronger route/static-guard gate | route policy 또는 planning SSOT/static guard surface 변경 시 conditional required |
| `pnpm planning:v2:complete` | stable planning v2 canonical gate | stable planning v2 owner/flow 변경 시 conditional required |
| `pnpm planning:v2:compat` | stable compatibility guard | stable planning v2 persistence/import-export/migration 경계 변경 시 conditional required |
| `pnpm e2e:rc` | stable public regression gate | stable user flow/selector 변경 시 conditional required |
| `pnpm release:verify` | stable release candidate final gate | public stable release candidate에서만 final single-owner gate |

## 3.2 `verify` 위치

- `pnpm verify`는 repo-wide hygiene gate다.
- 포함 범위:
  - `validate:dumps:fixtures`
  - `data:doctor`
  - `dart:rules:gate`
  - `lint`
  - `typecheck`
  - `test`
- 따라서 `planning/v3` beta 기본 gate로 자동 승격하지 않는다.
- 다음 경우에만 `public stable`에서 conditional required로 본다.
  - data-source / DART / shared fixture 정책을 건드린 경우
  - cross-product stable candidate를 묶어 보는 경우
  - route-local change가 아니라 repo-wide hygiene 확인이 필요한 경우

## 3.3 `planning:current-screens:guard`와 `planning:ssot:check`

- `pnpm planning:current-screens:guard`
  - route inventory, href, `docs/current-screens.md` 정합성을 확인하는 최소 route gate다.
  - stable/beta route policy 변경에서 conditional required로 둔다.
- `pnpm planning:ssot:check`
  - `planning_ssot_guard.mjs` + `planning:current-screens:guard`를 묶은 stronger gate다.
  - planning static guard surface 또는 route SSOT까지 같이 만지는 경우에만 conditional required로 둔다.
  - route-local UI copy 변경의 기본 required gate는 아니다.

## 3.4 `planning:v2:complete`와 `planning:v2:compat`

- `pnpm planning:v2:complete`
  - stable planning v2 canonical owner와 release evidence를 보호하는 gate다.
  - planning v2 core, runs/reports, stable planning API, stable planning report contract 변경 시 conditional required다.
  - `planning/v3` beta 기본 required gate가 아니다.
- `pnpm planning:v2:compat`
  - stable planning v2 persistence/migration/import-export compatibility guard다.
  - stable planning owner boundary를 건드릴 때만 conditional required다.
  - v3 beta-only 변경에서는 advisory 또는 not-applicable로 둔다.

## 3.5 `e2e:rc`와 `release:verify`

- `pnpm e2e:rc`
  - stable public RC 흐름을 확인하는 user-flow gate다.
  - `/recommend`, `/planning`, `/planning/reports`, `/public/dart`, `/settings/data-sources` 같은 stable flow에 영향이 있을 때 conditional required다.
  - beta-only route 변경의 기본 gate는 아니다.
- `pnpm release:verify`
  - stable release candidate에만 쓰는 final single-owner gate다.
  - `planning:v2:complete`, `multi-agent:guard`, `test`, optional `planning:v2:compat`, advisory `planning:ssot:check`를 포함하는 broad final gate다.
  - public beta와 ops/dev 기본 gate로 쓰지 않는다.

---

## 4. QA gate matrix

## 4.1 public stable

### 적용 범위

- `Public Stable` route
- stable planning v2 owner
- report/history/recommend/public helper처럼 stable user flow에 직접 연결된 surface

### required command set

- `pnpm build`
- `pnpm lint`
- `pnpm test`

### conditional required

- `pnpm planning:current-screens:guard`
  - route/href/current-screens 변경
- `pnpm planning:ssot:check`
  - route policy + planning static guard surface 동시 변경
- `pnpm e2e:rc`
  - stable user flow/selector 영향
- `pnpm planning:v2:complete`
  - stable planning v2 owner/run/report/API 변경
- `pnpm planning:v2:compat`
  - stable persistence/import-export/migration 경계 변경
- `pnpm verify`
  - repo-wide hygiene 또는 shared data-source/DART/shared fixture 영향

### advisory

- `pnpm release:verify` 이전 단계에서의 dry-run 확인
- targeted extra Playwright/Vitest

### final single-owner gate

- `pnpm release:verify`
- 필요 시 직전 `pnpm build`
- 필요 시 `pnpm e2e:rc`

메모:

- shared `.next`, shared runtime, shared e2e 상태를 쓰는 최종 게이트는 메인 단일 소유로만 판정한다.

## 4.2 public beta

### 적용 범위

- `Public Beta` route
- `planning/v3` canonical owner와 projection route
- stable surface에 직접 연결되지 않는 beta helper / beta flow

### required command set

- `pnpm build`
- `pnpm lint`
- `pnpm test`

### conditional required

- `pnpm planning:current-screens:guard`
  - beta route/href/current-screens 분류 변경
- `pnpm planning:ssot:check`
  - beta route policy와 planning static guard surface 동시 변경
- existing targeted beta suites
  - `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
  - `tests/e2e/v3-draft-apply.spec.ts`
  - relevant `tests/planning-v3-*`
  - 명령은 `pnpm test <file...>` 또는 existing Playwright file targeting으로 좁힌다

### advisory

- `pnpm e2e:rc`
  - beta 변경이 stable flow까지 함께 흔들 수 있을 때만
- `pnpm verify`
  - shared infra/data-source 영향이 있을 때만
- `pnpm planning:v2:complete`
  - stable owner bridge를 함께 건드렸을 때만
- `pnpm planning:v2:compat`
  - stable persistence boundary를 건드렸을 때만

### final single-owner gate

- 기본 없음

메모:

- beta route는 stable RC bundle과 분리한다.
- beta exposure 후보는 owner contract와 route visibility 일관성을 먼저 본다.

## 4.3 ops/dev

### 적용 범위

- `Local-only Ops`
- `Dev/Debug`
- support/internal route
- doctor/backup/recovery/support bundle 같은 내부 안전성 surface

### required command set

- `pnpm test`
- `pnpm build`
  - route/page/build 영향이 있을 때만

### conditional required

- `pnpm planning:current-screens:guard`
  - ops route inventory/current-screens 변경
- `pnpm planning:ssot:check`
  - route inventory와 planning static guard를 함께 건드렸을 때
- targeted internal tests
  - ops/support/doctor/recovery 관련 `tests/planning/ops/*`
  - backup/export/compat 관련 targeted tests

### advisory

- `pnpm verify`
- `pnpm e2e:rc`
- `pnpm planning:v2:complete`
- `pnpm planning:v2:compat`

### final single-owner gate

- 기본 없음

메모:

- ops/dev는 public release blocker와 분리한다.
- 단, stable owner나 public surface 경계를 건드리면 해당 tier gate를 추가로 따라야 한다.

---

## 5. golden dataset 기준

## 5.1 정의

이 문서에서 golden dataset은 단일 fixture 묶음이 아니라,
기존 저장소에 이미 있는 deterministic fixture와 scenario를
검증 목적별로 분류한 기준을 뜻한다.

## 5.2 category

### canonical entity fixture

목적:

- first-class owner CRUD와 persistence boundary를 검증한다.

현재 자산 예시:

- `tests/fixtures/planning-v3/csv/*.csv`
- `tests/fixtures/planning-v3/drafts-upload-flow/*.json`
- `tests/planning-v3-*Store.test.ts`
- `tests/planning-v3-*-api.test.ts`

주요 대상:

- `Account`
- `OpeningBalance`
- `ImportBatch`
- `TransactionRecord`
- rule/override family
- draft family
- singleton config owner

### route contract fixture

목적:

- request/response shape, guard, remote-host policy, whitelist/contract을 검증한다.

현재 자산 예시:

- `tests/planning-v3-*-api.test.ts`
- `tests/planning-v3-*-remote-host-api.test.ts`
- `tests/planning-v3-internal-route-contract.test.ts`
- `tests/fixtures/compat/*`

주요 대상:

- owner write route
- bridge route
- internal/support route guard

### projection / regression fixture

목적:

- owner에서 계산된 projection, summary, report, regression baseline이 안정적인지 검증한다.

현재 자산 예시:

- `tests/fixtures/planning-v2/golden-runs/*`
- `tests/fixtures/planning/golden/*`
- `tests/fixtures/planning-regression/*`
- `tests/planning-v2/regression/*`
- `tests/planning-v3-categorized-api.test.ts`
- `tests/planning-v3-balances.test.ts`
- `tests/planning-v3-computeMonthlyBalances.test.ts`

주요 대상:

- stable planning v2 projection
- v3 categorized/cashflow/balance projection
- regression 비교 baseline

### e2e scenario fixture

목적:

- 사용자 경로와 화면 연결이 실제 route policy에 맞게 유지되는지 검증한다.

현재 자산 예시:

- `tests/e2e/smoke.spec.ts`
- `tests/e2e/flow-planner-to-history.spec.ts`
- `tests/e2e/flow-history-to-report.spec.ts`
- `tests/e2e/data-sources-settings.spec.ts`
- `tests/e2e/dart-flow.spec.ts`
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- `tests/e2e/v3-draft-apply.spec.ts`

주요 대상:

- stable public flow
- beta planning v3 flow
- trust hub / public helper / report linkage

### ops / repair / compatibility fixture

목적:

- restore, backup, migration, compat, support bundle 같은 내부 안전성 흐름을 검증한다.

현재 자산 예시:

- `tests/backup-export-planning.test.ts`
- `tests/planning/storage-consistency-recovery.test.ts`
- `tests/planning/migrations/*`
- `tests/fixtures/compat/*`
- `tests/planning/ops/*`

주요 대상:

- restore / rollback boundary
- compat bundle
- ops doctor / recovery / support route

## 5.3 tier별 golden dataset 역할

### public stable

- projection/regression fixture와 stable e2e fixture가 release blocker다.
- stable planning owner를 건드리면 compat fixture와 stable planning v2 golden fixture도 blocker가 된다.

### public beta

- canonical entity fixture와 route contract fixture가 기본 blocker다.
- projection route를 건드리면 해당 projection fixture를 추가 blocker로 본다.
- beta e2e fixture는 stable RC bundle 대신 targeted blocker로 쓴다.

### ops/dev

- ops/repair/compatibility fixture가 기본 blocker다.
- public fixture는 public surface 영향이 있을 때만 같이 본다.

---

## 6. `N4` visibility policy로 넘길 전제조건

1. `Public Stable`, `Public Beta`, `Local-only Ops`, `Dev/Debug` route policy는 같은 gate로 다루지 않는다.
2. beta route는 `release:verify`와 `e2e:rc`를 기본 required gate로 삼지 않는다.
3. stable 공개 후보는 `release:verify`를 final single-owner gate로 유지한다.
4. bridge route와 support/internal route는 public beta 후보로 올리기 전 별도 가드 검토가 필요하다.
5. dev-only/ops-only route는 current-screens 분류와 gate tier가 함께 맞아야 한다.

---

## 7. 이번 단계 결론

- next-cycle QA gate는 `public stable`, `public beta`, `ops/dev` 세 tier로 분리한다.
- `verify`와 `release:verify`는 repo-wide 또는 stable RC gate이지, v3 beta 기본 gate가 아니다.
- `planning:v2:complete`와 `planning:v2:compat`는 stable planning owner 변경에서만 강하게 요구한다.
- `planning/v3` beta는 canonical entity fixture, route contract fixture, targeted beta e2e를 기본 gate로 본다.
- golden dataset은 단일 bundle이 아니라 `canonical entity / route contract / projection / e2e / ops-repair` 다섯 category로 관리한다.
