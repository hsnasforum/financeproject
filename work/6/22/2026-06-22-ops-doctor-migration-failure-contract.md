# 2026-06-22 ops doctor migration failure contract 정리

## 변경 파일
- `src/lib/planning/server/ops/doctorRouteService.ts`
- `tests/planning/ops/ops-doctor-action-result.test.ts`
- `work/6/22/2026-06-22-ops-contract-alignment-round-plan.md`
- `work/6/22/2026-06-22-ops-doctor-migration-failure-contract.md`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기반으로 구현 라운드 기본 skill 조합 확인.
- planning-gate-selector: ops action/API route 뒤 서비스 변경에 필요한 테스트, lint, build 검증 범위 선정.
- work-log-closeout: 실제 실행 검증과 남은 리스크를 표준 `/work` 형식으로 기록.

## 변경 이유
- 공용 ops action route는 `RUN_MIGRATIONS` 결과가 `failed`이면 `ok:false`로 처리하지만, doctor action service는 같은 결과를 성공 응답처럼 돌려줄 수 있었습니다.
- 운영 화면에서 migration 실패가 성공처럼 보이지 않도록 doctor action의 성공/실패 판정을 공용 action 계약과 맞췄습니다.

## 핵심 변경
- `runOpsDoctorAction("RUN_MIGRATIONS")`가 migration 결과 `failed`를 받으면 `ok:false`와 실행 요약 메시지를 반환하도록 변경했습니다.
- 실패 결과에서도 기존처럼 `MIGRATION_ACTION` metric에는 `status: "FAILED"`와 summary count를 기록합니다.
- `ops-doctor-action-result.test.ts`를 추가해 migration 실패 결과, 실패 메시지, metric meta shape를 고정했습니다.
- manager가 남긴 다음 라운드 계획 메모를 함께 보존했습니다.

## 검증
- PASS: `corepack pnpm test tests/planning/ops/ops-doctor-action-result.test.ts tests/planning/ops/ops-actions-planning-maintenance-boundary.test.ts tests/planning/ops/actions-run-route.test.ts tests/planning/ops/actions-preview-route.test.ts tests/planning/ops/ops-doctor-route-service-boundary.test.ts`
- PASS: `git diff --check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm build`
- 미실행: `corepack pnpm e2e:rc`는 UI, selector, route path 변경이 없어 이번 라운드에서는 실행하지 않았습니다.

## 남은 리스크
- 이번 라운드는 `failed` 결과의 성공 오판을 막는 데 집중했습니다.
- `partial` migration 결과를 operator UI/metric에서 성공과 더 분명히 구분하는 작업은 별도 라운드 후보입니다.
- `/api/ops/actions/run`과 `/api/ops/doctor`의 audit/action-log 파이프라인은 아직 완전히 하나로 합치지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
