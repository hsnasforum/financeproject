# 14. planning/v3 QA gate and golden dataset 정의

작성 기준: `N1 canonical entity model`, `N2 owner-based API/import-export/rollback contract`, 2026-03-17(KST)
범위: existing command/test asset을 `public stable / public beta / ops-dev` gate로 재분류하고 golden dataset category를 고정

현재 handoff 메모 (2026-03-25):
- `N2 planning/v3 API / import-export / rollback contract`는 family-level current-state memo chain 기준 `none for now` closeout 상태다.
- 이 문서는 `N2` 구현 완료 선언을 대체하지 않는다. 현재 기준 next official axis로서 `N3` current-state read / parked baseline 점검을 이어받는다.

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

### subset gate

- stable surface 전체가 아니라 일부 경로나 일부 helper만 좁혀 확인하는 명령
- full stable RC final gate를 대체하지 않는다.

### beta targeted gate

- beta-only spec, `planning/v3` owner test, beta Playwright처럼 범위를 직접 지정해 실행하는 명령
- stable RC bundle과 자동으로 묶지 않는다.

### repair/bootstrap evidence

- ops/dev bootstrap, 진단, 복구, 증적 수집을 위한 명령
- 테스트 gate를 대체하지 않는다.

### final single-owner gate

- shared runtime, shared build state, shared e2e state를 쓰므로 메인 단일 소유자로만 최종 PASS/FAIL을 판정해야 하는 명령

---

## 3. existing command 역할 재분류

## 3.1 command role table

| 명령 | 역할 재정의 | 비고 |
| --- | --- | --- |
| `pnpm build` | stable/beta 기본 required, stable RC에서는 companion final gate | route/page/build 영향이 있으면 기본 gate |
| `pnpm lint` | stable/beta 기본 required | React/TS/route/page 수정이 있으면 기본 gate |
| `pnpm test` | stable/beta/ops-dev 공통 targeted baseline | 필요한 경우 `pnpm test <file...>`로 좁힌다 |
| `pnpm verify` | repo-wide hygiene gate | public stable RC 또는 cross-product/shared data change에서 conditional required |
| `pnpm planning:current-screens:guard` | route inventory 최소 gate | route/href/current-screens 변경 시 stable/beta에서 conditional required |
| `pnpm planning:ssot:check` | stronger route/static-guard gate | route policy 또는 planning SSOT/static guard surface 변경 시 conditional required |
| `pnpm planning:v2:complete` | stable planning v2 canonical gate | stable planning v2 owner/flow 변경 시 conditional required |
| `pnpm planning:v2:compat` | stable compatibility guard | stable planning v2 persistence/import-export/migration 경계 변경 시 conditional required |
| `pnpm planning:v2:regress` | stable projection/regression baseline gate | stable planning v2 report/projection regression baseline 변경 시 conditional required |
| `pnpm planning:v2:e2e:fast` | stable planning smoke subset gate | `tests/e2e/planning-v2-fast.spec.ts`의 redirect/form/report shell을 좁혀 확인할 때 사용 |
| `pnpm planning:v2:e2e:full` | stable planning broader subset gate | `tests/e2e/planning-v2-fast.spec.ts` + `tests/e2e/planning-v2-full.spec.ts`를 함께 돌려 stable planning route/report contract를 넓게 확인할 때 사용 |
| `pnpm planning:v2:e2e:golden` | stable planning golden replay gate | `tests/e2e/planning-v2-full.spec.ts`의 golden deterministic replay를 재검증할 때 사용 |
| `pnpm planning:v2:guard` | stable conditional minor guard | planning v2 architecture/local-only/security/privacy 경계 변경 시에만 붙인다 |
| `pnpm planning:v2:engine:guard` | stable conditional minor guard | engine envelope/report contract/fallback 정리 시에만 붙인다 |
| `pnpm planning:v2:freeze:guard` | evidence-only command | v2 core 변경 감지와 필수 gate 안내용이며 exit 0 informational이다 |
| `pnpm e2e:rc` | stable public regression gate, stable RC에서는 companion final gate | stable user flow/selector 변경 시 conditional required |
| `pnpm e2e:rc:dart` | stable DART subset gate | `pnpm e2e:rc`의 subset 확인이며 full stable RC 대체가 아니다 |
| `pnpm e2e:rc:data-sources` | stable data-source subset gate | `pnpm e2e:rc`의 subset 확인이며 full stable RC 대체가 아니다 |
| `pnpm planning:v2:ops:run` / `pnpm planning:v2:ops:run:regress` | ops cadence gate | monthly/manual ops pipeline과 regress evidence를 남길 때 사용 |
| `pnpm planning:v2:ops:safety` / `pnpm planning:v2:ops:safety:weekly` / `pnpm planning:v2:ops:safety:regress` | ops cadence gate | manual or scheduled safety sweep이며 stable release blocker가 아니다 |
| `pnpm planning:v2:ops:scheduler:health` | advisory gate | scheduler 누적 실패 위험을 읽는 health summary다 |
| `pnpm planning:v2:ops:prune` | evidence-only command | reports/log retention housekeeping 결과를 남길 때 사용 |
| `pnpm v3:doctor` / `pnpm v3:support-bundle` / `pnpm v3:restore` / `pnpm v3:migrate` / `pnpm planning:v3:import:csv` | ops/dev bootstrap 또는 repair evidence | 기본 public release gate로 자동 승격하지 않고, targeted test와 함께 증적으로 남긴다 |
| `pnpm release:verify` | stable release candidate primary final single-owner gate | public stable release candidate에서만 기본 final gate로 쓴다 |

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

## 3.5 `planning:v2:regress`와 `planning:v2:e2e:golden`

- `pnpm planning:v2:regress`
  - stable planning v2 projection/report/regression baseline gate다.
  - golden run fixture, regression sample, stable result DTO와 연결된 변경에서 conditional required다.
- `pnpm planning:v2:e2e:fast`
  - stable planning v2 redirect/form/report shell을 좁게 다시 확인하는 subset gate다.
  - `/planning`, `/planning/runs`, `/planning/reports`의 shell/redirect/advanced toggle contract를 빠르게 재검증할 때 conditional required로 둔다.
- `pnpm planning:v2:e2e:full`
  - stable planning v2의 broader subset e2e gate다.
  - fast subset에 더해 pipeline/reports dashboard contract를 같이 다시 확인해야 할 때 conditional required로 둔다.
- `pnpm planning:v2:e2e:golden`
  - stable planning v2 golden deterministic replay e2e gate다.
  - `tests/e2e/planning-v2-full.spec.ts`의 golden replay를 직접 확인해야 할 때만 conditional required다.
  - beta-only 변경과 ops/dev-only 변경의 기본 gate는 아니다.

## 3.6 `planning:v2` minor guard 계열

- `pnpm planning:v2:guard`
  - planning v2 architecture/local-only/privacy/security 경계가 바뀔 때 붙이는 stable conditional minor guard다.
  - `docs/planning-v2-done-definition.md`의 보안/프라이버시 Done과 `docs/planning-v2-architecture.md`의 import 경계 규칙을 다시 확인하는 성격이다.
- `pnpm planning:v2:engine:guard`
  - engine envelope, report contract, fallback 제거처럼 결과 계약을 다시 잠글 때 붙이는 stable conditional minor guard다.
  - 항상 stable release blocker는 아니고, 관련 surface를 건드린 경우에만 conditional required로 본다.
- `pnpm planning:v2:freeze:guard`
  - `docs/planning-v2-freeze.md`의 informational guard다.
  - v2 core 변경 파일과 권장 후속 gate를 출력하지만 종료코드는 항상 0이므로 evidence-only command로 남긴다.

## 3.7 `release:verify`, `build`, `e2e:rc` 관계

- `pnpm release:verify`
  - stable release candidate에만 쓰는 primary final single-owner gate다.
  - `planning:v2:complete`, `multi-agent:guard`, `test`, optional `planning:v2:compat`, advisory `planning:ssot:check`를 포함하는 broad final gate다.
  - public beta와 ops/dev 기본 gate로 쓰지 않는다.
- `pnpm build`
  - route/page/build 영향이 있으면 stable/beta 공통 기본 gate다.
  - stable release candidate closeout에서는 `pnpm release:verify` 직후 같은 소유자가 순차 실행하는 companion final gate로 본다.
- `pnpm e2e:rc`
  - stable public RC 흐름을 확인하는 user-flow gate다.
  - `/recommend`, `/planning`, `/planning/reports`, `/public/dart`, `/settings/data-sources` 같은 stable flow에 영향이 있을 때 conditional required다.
  - stable release candidate closeout에서는 `pnpm release:verify`, `pnpm build` 다음에 같은 소유자가 순차 실행하는 companion final gate다.
  - beta-only route 변경의 기본 gate는 아니다.
  - current bundle에는 `tests/e2e/news-settings-alert-rules.spec.ts`가 포함되어 있어 limited beta follow-through evidence를 함께 품지만, 이 사실만으로 beta 기본 gate로 승격하지 않는다.
- stable final closeout 기본 순서
  - `pnpm release:verify`
  - `pnpm build`
  - 사용자 경로/셀렉터 영향이 있으면 `pnpm e2e:rc`
- `pnpm e2e:rc:dart`, `pnpm e2e:rc:data-sources`
  - scoped stable helper를 좁혀 보는 subset gate다.
  - full stable RC user-flow closeout이 필요한 경우 `pnpm e2e:rc`를 대체하지 않는다.

## 3.8 ops cadence / repair 계열

- `pnpm planning:v2:ops:run`, `pnpm planning:v2:ops:run:regress`
  - monthly/manual ops pipeline용 ops cadence gate다.
  - JSON report와 text log를 남기는 운영 실행이며 stable release closeout 기본 gate는 아니다.
- `pnpm planning:v2:ops:safety`
  - on-demand safety sweep용 ops cadence gate다.
  - 문제가 있으면 fail할 수 있지만 stable release blocker로 자동 승격하지 않는다.
- `pnpm planning:v2:ops:safety:weekly`, `pnpm planning:v2:ops:safety:regress`
  - `docs/planning-v2-scheduler.md` 기준의 scheduled cadence gate다.
  - wrapper 또는 cron에서 `scheduler.ndjson`과 ops log를 남기는 주기 점검이며 release closeout 대신 scheduler/ops evidence로 관리한다.
- `pnpm planning:v2:ops:scheduler:health`
  - scheduler 누적 실패 수준을 읽는 advisory gate다.
  - 위험 누적/해제는 scheduler/audit evidence로 남기고, stable release blocker로 자동 승격하지 않는다.
- `pnpm planning:v2:ops:prune`
  - reports/log retention housekeeping 결과를 남기는 evidence-only command다.
  - 월간 정리 evidence로 남기며 release blocker는 아니다.

## 3.9 ops/dev bootstrap 명령

- `pnpm v3:doctor`, `pnpm v3:support-bundle`, `pnpm v3:restore`, `pnpm v3:migrate`, `pnpm planning:v3:import:csv`는
  ops/dev surface의 bootstrap, 진단, 복구, 증적 수집 명령이다.
- 이 명령들은 manual operator evidence로 취급하고, public stable/beta의 기본 required gate로 자동 승격하지 않는다.
- 필요하면 관련 `tests/planning/ops/*`, `tests/planning/migrations/*`, `tests/fixtures/compat/*`와 함께 묶어 본다.
- 예시:
  - `pnpm v3:doctor`
  - `pnpm v3:support-bundle`
  - `pnpm v3:restore`
  - `pnpm v3:migrate`

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
- targeted `pnpm test <file...>` 또는 `pnpm test`

### conditional required

- `pnpm planning:current-screens:guard`
  - route/href/current-screens 변경
- `pnpm planning:ssot:check`
  - route policy + planning static guard surface 동시 변경
- `pnpm e2e:rc`
  - stable user flow/selector 영향
- `pnpm e2e:rc:dart`
  - stable DART flow만 좁혀 확인할 때
  - subset gate이며 `pnpm e2e:rc` 대체 아님
- `pnpm e2e:rc:data-sources`
  - stable data-source flow만 좁혀 확인할 때
  - subset gate이며 `pnpm e2e:rc` 대체 아님
- `pnpm planning:v2:complete`
  - stable planning v2 owner/run/report/API 변경
- `pnpm planning:v2:compat`
  - stable persistence/import-export/migration 경계 변경
- `pnpm planning:v2:regress`
  - stable projection/report/regression baseline 변경
- `pnpm planning:v2:e2e:golden`
  - stable planning golden deterministic replay 재검증이 필요할 때
- `pnpm planning:v2:guard`
  - planning v2 architecture/local-only/privacy/security 경계 변경
- `pnpm planning:v2:engine:guard`
  - engine envelope/report contract/fallback 정리
- `pnpm verify`
  - repo-wide hygiene 또는 shared data-source/DART/shared fixture 영향

### advisory

- `pnpm release:verify` 이전 단계에서의 dry-run 확인
- `pnpm planning:v2:freeze:guard`
- targeted extra Playwright/Vitest

### final single-owner gate

- primary: `pnpm release:verify`
- companion: `pnpm build`
- companion: `pnpm e2e:rc`

메모:

- shared `.next`, shared runtime, shared e2e 상태를 쓰는 최종 게이트는 메인 단일 소유로만 판정한다.
- subset gate(`pnpm e2e:rc:dart`, `pnpm e2e:rc:data-sources`)는 final single-owner gate로 승격하지 않는다.

## 4.2 public beta

### 적용 범위

- `Public Beta` route
- `planning/v3` canonical owner와 projection route
- stable surface에 직접 연결되지 않는 beta helper / beta flow

### required command set

- `pnpm build`
- `pnpm lint`
- targeted `pnpm test <tests/planning-v3-...>` 또는 `pnpm test`

### conditional required

- `pnpm planning:current-screens:guard`
  - beta route/href/current-screens 분류 변경
- `pnpm planning:ssot:check`
  - beta route policy와 planning static guard surface 동시 변경
- existing beta targeted gate suites
  - `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
  - `tests/e2e/v3-draft-apply.spec.ts`
  - `tests/e2e/news-settings-alert-rules.spec.ts`
  - relevant `tests/planning-v3-*`
  - 예시 1: `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts --workers=1`
  - 예시 2: `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - Vitest는 `pnpm test <file...>`로 좁힌다

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
- beta targeted gate는 stable final single-owner gate로 자동 승격하지 않는다.

## 4.3 ops/dev

### 적용 범위

- `Local-only Ops`
- `Dev/Debug`
- support/internal route
- doctor/backup/recovery/support bundle 같은 내부 안전성 surface

### required command set

- targeted `pnpm test <file...>`
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
- `pnpm planning:v2:ops:scheduler:health`

### final single-owner gate

- 기본 없음

메모:

- ops/dev는 public release blocker와 분리한다.
- 단, stable owner나 public surface 경계를 건드리면 해당 tier gate를 추가로 따라야 한다.
- `v3:doctor`/`support-bundle`/`restore`/`migrate`는 repair/bootstrap evidence이지 stable final gate가 아니다.

## 4.4 guard / cadence evidence logging matrix

| 명령 | 분류 | 언제 실행 | 어디에 기록 | stable blocker 여부 |
| --- | --- | --- | --- | --- |
| `pnpm planning:v2:guard` | stable conditional gate | planning v2 architecture/local-only/privacy/security 경계 변경 | release bound면 release closeout, 아니면 `/work` | 조건부 예 |
| `pnpm planning:v2:engine:guard` | stable conditional gate | engine envelope/report contract/fallback 정리 | release bound면 release closeout, 아니면 `/work` | 조건부 예 |
| `pnpm planning:v2:freeze:guard` | evidence-only command | v2 core 변경 감지, review visibility 확보 | advisory record, 필요 시 `/work` | 아니오 |
| `pnpm planning:v2:ops:run` | ops cadence gate | manual monthly ops pipeline | ops log/report, change batch면 `/work` | 아니오 |
| `pnpm planning:v2:ops:run:regress` | ops cadence gate | monthly ops pipeline에서 regress evidence까지 같이 남길 때 | ops log/report, change batch면 `/work` | 아니오 |
| `pnpm planning:v2:ops:safety` | ops cadence gate | on-demand safety sweep | ops log/report, change batch면 `/work` | 아니오 |
| `pnpm planning:v2:ops:safety:weekly` | ops cadence gate | scheduled weekly safety | scheduler log + ops log | 아니오 |
| `pnpm planning:v2:ops:safety:regress` | ops cadence gate | scheduled regress cadence | scheduler log + ops log | 아니오 |
| `pnpm planning:v2:ops:scheduler:health` | advisory gate | scheduler wrapper 후속 health review, risk 누적 확인 | scheduler log + advisory record | 아니오 |
| `pnpm planning:v2:ops:prune` | evidence-only command | monthly retention cleanup | scheduler/ops log, change batch면 `/work` | 아니오 |

메모:

- stable release bound 실행의 대표 handoff는 `docs/release.md`에 정의한 tracked `/work` release closeout note다.
- release closeout에는 primary/companion final gate, conditional minor guard, advisory record, 미실행 gate, evidence 위치, residual risk만 남기고 raw ops cadence 출력은 복사하지 않는다.
- scheduled cadence raw evidence의 source of truth는 `.data/planning/ops/logs/scheduler.ndjson`, `.data/planning/ops/logs/*.log`, `.data/planning/ops/reports/*.json`이다.
- concrete example은 `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`와 `work/3/13/2026-03-13-runtime-release-verify-smoke.md`를 기준으로 본다.
- tracked exemplar 선택과 release note quality gate는 `docs/release.md`를 단일 기준으로 따르고, success형과 blocker/smoke형을 같은 대표본으로 합치지 않는다.

---

## 5. golden dataset 기준

## 5.1 정의

이 문서에서 golden dataset은 단일 fixture 묶음이 아니라,
기존 저장소에 이미 있는 deterministic fixture와 scenario를
검증 목적별로 분류한 기준을 뜻한다.

메모:

- 현재 저장소에는 `tests/fixtures/planning/golden/*` 같은 별도 golden 루트가 없다.
- golden dataset inventory는 fixture 파일, targeted Vitest, targeted Playwright, ops bootstrap 명령을 함께 묶어 관리한다.

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
- `tests/planning-v3-write-route-guards.test.ts`
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
- `tests/fixtures/planning-regression/eval-latest.sample.json`
- `tests/e2e/planning-v2-full.spec.ts`
- `pnpm planning:v2:regress`
- `pnpm planning:v2:e2e:golden`
- `tests/planning-v3-aggregateMonthlyCashflow-v2.test.ts`
- `tests/planning-v3-categorized-api.test.ts`
- `tests/planning-v3-balances.test.ts`
- `tests/planning-v3-computeMonthlyBalances.test.ts`
- `tests/planning-v3-getBatchSummary.test.ts`

주요 대상:

- stable planning v2 projection
- v3 categorized/cashflow/balance projection
- regression 비교 baseline

### e2e scenario fixture

목적:

- 사용자 경로와 화면 연결이 실제 route policy에 맞게 유지되는지 검증한다.

현재 자산 예시:

- `tests/e2e/planning-v2-fast.spec.ts`
- `tests/e2e/smoke.spec.ts`
- `tests/e2e/flow-planner-to-history.spec.ts`
- `tests/e2e/flow-history-to-report.spec.ts`
- `tests/e2e/data-sources-settings.spec.ts`
- `tests/e2e/dart-flow.spec.ts`
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- `tests/e2e/v3-draft-apply.spec.ts`
- `tests/e2e/news-settings-alert-rules.spec.ts`

주요 대상:

- stable public flow
- beta planning v3 flow
- trust hub / public helper / report linkage

### ops / repair / compatibility fixture

목적:

- restore, backup, migration, compat, support bundle 같은 내부 안전성 흐름을 검증한다.

현재 자산 예시:

- `tests/planning/ops/backup-api.test.ts`
- `tests/planning/storage-consistency-recovery.test.ts`
- `tests/planning/migrations/*`
- `tests/fixtures/compat/*`
- `tests/planning/ops/*`
- `pnpm v3:doctor`
- `pnpm v3:support-bundle`
- `pnpm v3:restore`
- `pnpm v3:migrate`

주요 대상:

- restore / rollback boundary
- compat bundle
- ops doctor / recovery / support route

## 5.3 tier별 golden dataset 역할

### public stable

- projection/regression fixture와 stable e2e fixture가 release blocker다.
- stable planning owner를 건드리면 compat fixture와 stable planning v2 golden fixture도 blocker가 된다.
- DART/data-source처럼 범위가 좁은 stable helper는 `pnpm e2e:rc:dart`, `pnpm e2e:rc:data-sources`로 subset gate를 먼저 확인할 수 있다.

### public beta

- canonical entity fixture와 route contract fixture가 기본 blocker다.
- projection route를 건드리면 해당 projection fixture를 추가 blocker로 본다.
- beta e2e fixture는 stable RC bundle 대신 targeted blocker로 쓴다.

### ops/dev

- ops/repair/compatibility fixture가 기본 blocker다.
- public fixture는 public surface 영향이 있을 때만 같이 본다.
- `v3:doctor`/`support-bundle`/`restore`/`migrate` 같은 operator 명령은 테스트를 대체하지 않지만 repair/bootstrap evidence로 같이 남긴다.

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

### current-state resync audit (2026-03-25)

- `N3` current-state drift map
  - still-valid baseline
    - `docs/current-screens.md`의 `Public Stable` / `Public Beta` / `Local-only Ops` / `Dev/Debug` 분류는 이 문서의 `public stable / public beta / ops/dev` gate class와 current code 기준으로 자연스럽게 매핑된다. `Local-only Ops`와 `Dev/Debug`를 non-public `ops/dev` gate class로 묶는 현재 서술도 유지 가능하다.
    - `package.json`의 `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`, `pnpm planning:v2:*`, `pnpm release:verify`, `pnpm v3:doctor`, `pnpm v3:support-bundle`, `pnpm v3:restore`, `pnpm v3:migrate`, `pnpm planning:v3:import:csv`는 모두 current 문서의 command role table과 큰 충돌 없이 대응된다.
    - `tests/e2e/flow-v3-import-to-cashflow.spec.ts`, `tests/e2e/v3-draft-apply.spec.ts`, `tests/planning/catalog/currentScreens.*.test.ts`는 beta targeted gate / route inventory guard 자산으로 current matrix와 계속 자연스럽게 맞물린다.
    - `N2` handoff와 `N3` 문서는 충돌하지 않는다. `N2 none-for-now closeout`은 구현 완료 선언이 아니고, `N3`는 next official axis이되 곧바로 새 gate 구현을 뜻하지 않는다는 현재 문맥도 유지된다.
  - stale or `[검증 필요]` section
    - command role table에 `pnpm planning:v2:e2e:fast`, `pnpm planning:v2:e2e:full`이 빠져 있었는데, `package.json`과 실제 `tests/e2e/planning-v2-fast.spec.ts`, `tests/e2e/planning-v2-full.spec.ts` 기준으로는 stable planning subset gate로 문서화하는 편이 맞다.
    - `tests/e2e/news-settings-alert-rules.spec.ts`는 `/planning/v3/news/settings` beta follow-through asset인데 기존 beta targeted gate / e2e scenario fixture 예시에서 빠져 있었다.
    - current `pnpm e2e:rc` bundle은 stable-public bias를 유지하면서도 `news-settings-alert-rules.spec.ts`를 포함해 limited beta follow-through evidence를 같이 품는다. 이를 pure stable-only bundle처럼 읽는 문구는 `[검증 필요]`이며, current-state note가 필요하다.
- current unresolved question은 새 gate 추가나 CI 재설계가 아니라 current matrix wording과 parked baseline sync다.
- current smallest viable next `N3` candidate는 broad rewrite가 아니라 `QA-gate-and-golden-dataset current-state closeout docs-only sync`다.
- 비범위는 실제 구현 코드 변경, 새 테스트 추가, 새 script 추가, CI 파이프라인 재설계, route visibility 최종 확정, `N4` beta exposure visibility policy 본작업, route 추가/삭제, stable/public IA 재편이다.
- broad QA rewrite나 CI 재설계로 바로 가면 위험하다. current mismatch는 command inventory와 targeted test asset 설명의 wording drift에 가깝고, 여기서 gate 구현/CI 묶음을 함께 바꾸면 `N3` matrix SSOT와 `N4` policy overlay가 다시 섞인다.

### current-state closeout sync (2026-03-25)

- 이번 closeout에서 확정하는 것은 `docs/current-screens.md`의 `Public Stable` / `Public Beta` / `Local-only Ops` / `Dev/Debug` 분류와 이 문서의 `public stable / public beta / ops/dev` gate class가 current-state 기준으로 계속 자연스럽게 매핑된다는 점, `package.json`의 실제 명령 집합과 command role table이 current-state 기준으로 맞는다는 점, 그리고 `pnpm planning:v2:e2e:fast`, `pnpm planning:v2:e2e:full`, `tests/e2e/news-settings-alert-rules.spec.ts`, current `pnpm e2e:rc` bundle composition note까지 반영한 현재 stop line이다.
- 이번 closeout에서 바뀌지 않는 것은 실제 구현 코드, 새 테스트 추가, 새 script 추가, CI 파이프라인 재설계, route visibility 최종 확정, `N2` family closeout 재오픈, `N4` beta exposure visibility policy 본작업, route 추가/삭제, stable/public IA 재편이다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 closeout 상태와 충돌하지 않는다. `planning/v3` beta route inventory와 route catalog guard 자산은 current gate class 문맥 안에서 그대로 유지된다.
- current next question은 더 이상 `N3` 내부 wording resync가 아니다. `N3` 내부 smallest viable next candidate는 현재 `none for now`로 잠그고, 후속 판단은 trigger-specific reopen 확인 또는 다음 공식 축 `N4 beta exposure / visibility policy`의 current-state read / parked baseline 점검으로만 넘긴다.
- future reopen trigger는 실제 gate 역할이나 route class를 바꾸는 공식 question, `pnpm e2e:rc` bundle composition을 실제로 재구성해야 하는 요구, 새 gate/script 추가 요구, CI 파이프라인 재설계 요구, current-screens route class나 production exposure 정책을 실제로 바꾸는 요구로만 둔다.

### none-for-now closeout handoff-to-N4 sync (2026-03-25)

- 이번 handoff에서 확정하는 것은 이 문서의 gate matrix SSOT, command role table, route class mapping, golden dataset category가 current-state closeout 이후 내부 micro docs-first cut 기준으로는 현재 `none for now`라는 점이다.
- `N3` closeout은 QA 체계 구현 완료 선언을 뜻하지 않는다. 실제 구현 코드 변경, 새 테스트 추가, 새 script 추가, CI 파이프라인 재설계, route visibility 최종 확정, `N2` family closeout 재오픈, `N4` beta exposure visibility policy 본작업, route 추가/삭제, stable/public IA 재편은 여전히 비범위다.
- stable `/planning*`와 beta `/planning/v3/*` route SSOT는 이 handoff 상태와 충돌하지 않는다. current next recommendation은 `N3` 내부 새 micro audit이 아니라 trigger-specific reopen 확인 또는 `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`의 current-state read / parked baseline 점검으로만 둔다.
- future reopen trigger는 실제 gate 역할이나 route class를 바꾸는 공식 question, `pnpm e2e:rc` bundle composition 재구성 요구, 새 gate/script 추가 요구, CI 파이프라인 재설계 요구, current-screens route class나 production exposure 정책을 실제로 바꾸는 요구로만 둔다.
