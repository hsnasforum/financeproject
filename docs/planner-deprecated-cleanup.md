# Planner Deprecated Cleanup Inventory

Last updated: 2026-06-28

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

## Legacy Planner Compute Boundary

- Compatibility route: `POST /api/planner/compute`
- Runtime owner: Planning Reports / Architecture
- Status: `deprecated-compatibility`
- Replacement: planning-v2 run/report APIs
- Telemetry event: `legacy_planner_compute_called`
- Sunset: `TBD-after-telemetry-inventory`

운영 원칙:

- route는 same-origin 검증과 planning user scope 안에서만 계산한다.
- 성공 응답 `meta.legacyApi`에 owner/status/replacement/sunset/telemetryEvent를 함께 실어 호출자가 compatibility API 사용을 식별할 수 있게 한다.
- 호출 시 audit log에 `legacy_planner_compute_called`를 best-effort로 남긴다.
- report production UI는 `@/lib/planner/*`를 직접 import하지 않고, action link는 `src/lib/planning/catalog/plannerActionLinks.ts`를 사용한다.
- 제거 여부와 sunset 날짜는 telemetry inventory와 외부 호출자 확인 후 별도 PR에서 확정한다.

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
