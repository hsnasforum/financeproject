# Planner Deprecated Cleanup Inventory

Last updated: 2026-07-10

## Removed in P2 Start

- `src/lib/planner/core.ts`
  - `runPlanner()` direct references: 0
  - Removed as dead deprecated path.
- `src/lib/planner/metrics.ts`
  - Replaced by `src/lib/planner/legacyPlanModel.ts`.
- `src/lib/planner/rules.ts`
  - Replaced by `src/lib/planner/legacyPlanModel.ts`.

## Guard

- CI/script guard: `pnpm planner:deprecated:guard`
- Checks:
  - removed files do not reappear,
  - no `lib/planner/core`, `lib/planner/metrics`, or `lib/planner/rules` import references remain in `src`/`tests`.
  - `legacyPlanModel.ts` direct imports stay limited to the current transition adapters:
    - `src/lib/planner/plan.ts`
    - `src/lib/planner/insuranceMetrics.ts`
    - `src/lib/planner/retirementMetrics.ts`
  - application source outside `src/lib/planner/**` cannot add a new import edge into the legacy planner tree. The current upper-bound allowlist contains:
    - active compatibility consumers: `/api/planner/compute`, `plannerInput.ts`, and `BenefitsClient.tsx`
    - parked transition consumers: `PlannerWizard` support components and `reportBuilder.ts`
  - parked legacy UI entries do not gain new application source importers:
    - `PlannerClient`: no production importer
    - `PlannerWizard`: `PlannerClient` only
    - `ReportClient`: no production importer

허용 목록은 기존 경계를 보존하기 위한 상한선이다. migration으로 소비자가 제거되면 다시 추가하지 않으며, 신규 예외는 별도 Issue에서 public route/API와 telemetry 영향을 먼저 확인한다. guard는 static `import`/`export`/`require`와 정적 문자열 module specifier를 검사하며, 계산된 동적 specifier는 자동 판별 대상이 아니므로 사용하지 않는다.

## Legacy Planner Compute Boundary

- Compatibility route: `POST /api/planner/compute`
- Runtime owner: Planning Reports / Architecture
- Status: `deprecated-compatibility`
- Canonical route policy: `PLANNING_DEPRECATED_API_ROUTES.plannerCompute`
- Canonical route hint: `/api/planning/v2/runs`
- Replacement: planning-v2 run/report APIs
- Telemetry event: `legacy_planner_compute_called`
- Sunset: `TBD-after-telemetry-inventory`

운영 원칙:

- route는 same-origin 검증과 planning user scope 안에서만 계산한다.
- 응답 헤더에 `Deprecation: true`, `X-Planning-Canonical-Route`, `X-Planning-Route-Status`를 싣고, 응답 `meta.legacyApi`에 owner/status/canonicalRoute/replacement/sunset/telemetryEvent를 함께 실어 호출자가 compatibility API 사용을 식별할 수 있게 한다.
- 호출 시 audit log에 `legacy_planner_compute_called`를 best-effort로 남긴다.
- report production UI는 `@/lib/planner/*`를 직접 import하지 않고, action link는 `src/lib/planning/catalog/plannerActionLinks.ts`를 사용한다.
- 제거 여부와 sunset 날짜는 telemetry inventory와 외부 호출자 확인 후 별도 PR에서 확정한다.

## Legacy Planning Run Alias Boundary

- Alias route: `POST /api/planning/run`
- Alias route: `POST /api/planning/v2/run`
- Runtime owner: Planning v2 Runs API
- Status: `deprecated-alias`
- Canonical route policy: `PLANNING_DEPRECATED_API_ROUTES.planningRun`, `PLANNING_DEPRECATED_API_ROUTES.planningV2Run`
- Canonical route: `POST /api/planning/v2/runs`
- Telemetry event: `planning_run_alias_called`, `planning_v2_run_alias_called`
- Sunset: `TBD-after-telemetry-inventory`

운영 원칙:

- alias route는 canonical create-run adapter를 그대로 호출하되, 응답 헤더와 `meta.deprecatedApi`에 canonical route 정보를 싣는다.
- alias 제거, redirect 전환, 410 전환은 telemetry/access log와 외부 호출자 확인 전까지 확정하지 않는다.
- 신규 클라이언트와 문서는 `/api/planning/v2/runs`만 사용한다.

## Legacy Report Boundary

- `src/app/report/page.tsx`
- `src/components/ReportClient.tsx`
- `src/lib/report/reportBuilder.ts`
- `src/components/RecommendHistoryClient.tsx`
- `src/components/home/ServiceLinks.tsx`

위 경로는 planning 공식 report 체계가 아니라 legacy `/report` 제품 경로다.

- 데이터 소스:
  - `planner_last_snapshot_v1`
  - recommend saved run local storage
  - disclosure digest / daily brief
- 원칙:
  - 신규 planning 계산/리포트 기능을 이 경로에 추가하지 않는다.
  - planning 공식 report는 `/planning/reports` 및 `src/lib/planning/reports/*`로만 확장한다.
  - `/report` route 자체는 현재 `/planning/reports`로 영구 리다이렉트되며, 남은 legacy UI는 parked transition 코드로만 취급한다.
  - 홈/추천 히스토리에서 legacy `/report`를 언급할 때는 legacy 표기를 유지한다.

## Next Removal Plan

1. Migrate remaining `src/lib/planner/legacyPlanModel.ts` consumer paths to planning engine contracts.
2. Remove parked legacy `/report` UI/runtime code after redirect stability is confirmed.
3. Remove legacy planner UI/API paths after redirect/API shutdown decision.
4. Enforce sunset target for transition layer: 2026-04-30.
