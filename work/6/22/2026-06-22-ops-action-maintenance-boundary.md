# 2026-06-22 ops action maintenance boundary 정리

## 변경 파일
- `src/lib/planning/server/ops/planningMaintenanceActions.ts`
- `src/lib/ops/actions/registry.ts`
- `src/lib/planning/server/ops/doctorRouteService.ts`
- `tests/planning/ops/ops-actions-planning-maintenance-boundary.test.ts`
- `work/6/22/2026-06-22-ops-action-boundary-round-plan.md`
- `work/6/22/2026-06-22-ops-action-maintenance-boundary.md`

## 사용 skill
- finance-skill-routing: 구현 라운드 기본 skill 조합 확인.
- planning-gate-selector: ops action/API route 뒤 shared library 변경에 맞는 검증 범위 선정.
- work-log-closeout: 실제 변경 파일, 실행 검증, 잔여 리스크 기록 형식 확인.

## 변경 이유
- `src/lib/ops/actions/registry.ts`와 `src/lib/planning/server/ops/doctorRouteService.ts`가 `REPAIR_INDEX`/`RUN_MIGRATIONS` 계열 planning storage/migration 작업을 각각 직접 호출하고 있었습니다.
- ops action route와 doctor route의 외부 계약은 유지하면서, planning maintenance 실행/preview 진입점을 한 계층으로 모아 다음 service-boundary 정리를 쉽게 만들기 위한 변경입니다.

## 핵심 변경
- `planningMaintenanceActions.ts`를 추가해 storage consistency repair, orphan blob cleanup, migration inspect/run 호출을 planning maintenance helper로 모았습니다.
- `registry.ts`는 repair/migration preview/run에서 새 helper를 사용하도록 변경하고, planning migration/storage 구현 직접 import를 제거했습니다.
- `doctorRouteService.ts`도 doctor POST action 실행에서 새 helper를 사용하도록 변경했습니다.
- `ops-actions-planning-maintenance-boundary.test.ts`를 추가해 registry가 planning migration/storage 구현을 다시 직접 호출하지 않도록 고정했습니다.
- manager가 남긴 계획 메모의 dirty 워크트리 문장은 메인 워크트리 재확인 결과에 맞게 정정했습니다.

## 검증
- PASS: `corepack pnpm test tests/planning/ops/ops-actions-planning-maintenance-boundary.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/actions-preview-route.test.ts tests/planning/ops/ops-doctor-route-service-boundary.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- TIMEOUT: `corepack pnpm build` 첫 실행은 184초 제한에서 종료 코드를 회수하지 못했고, 백그라운드 build 프로세스가 계속 실행 중인 것을 확인했습니다.
- PASS: `corepack pnpm build` 재실행은 237.8초에 완료됐습니다.

## 남은 리스크
- 이번 라운드는 공용 helper 계층 추출까지이며, `/api/ops/actions/run`과 `/api/ops/doctor`의 audit/metric/meta 계약을 완전히 하나의 실행 파이프라인으로 합치지는 않았습니다.
- `CLEANUP_ORPHAN_BLOBS`는 doctor 전용 UI 계약을 유지하되 helper만 공유했습니다.
- 다음 라운드 후보는 ops action route와 doctor action route의 계측 차이를 더 명시적으로 테스트하고, 가능한 범위에서 실행 wrapper를 추가로 수렴하는 것입니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
