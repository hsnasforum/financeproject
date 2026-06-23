# 2026-06-23 v2 run detail service boundary

## 수정 대상 파일
- `src/app/api/planning/v2/runs/[id]/route.ts`
- `src/app/api/planning/v2/runs/[id]/action-plan/route.ts`
- `src/lib/planning/server/runs/routeService.ts`
- `tests/planning-v2-api/run-detail-route-fallback.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzzzzzzzz-v2-run-detail-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: Finance Project 기본/조건부 skill 적용 범위를 확인했습니다.
- `planning-gate-selector`: v2 route/core 변경에 맞는 최소 검증과 확장 게이트를 선택했습니다.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크, 다음 우선순위를 `/work` 형식으로 기록했습니다.

## 변경 이유
- [사실] 최근 `/work` 흐름에서 v2 run report/export/trash route가 service boundary로 분리됐고, 다음 후보로 `runs/[id]` detail/action-plan route가 남아 있었습니다.
- [사실] `src/app/api/planning/v2/runs/[id]/route.ts`는 repository, sanitizer, audit write를 route 내부에서 직접 호출하고 있었습니다.
- [사실] `src/app/api/planning/v2/runs/[id]/action-plan/route.ts`는 current-user run 조회와 action-plan 생성을 route 내부에서 직접 호출하고 있었습니다.
- [해석] route handler는 인증, same-origin/CSRF, 입력 검증, 응답 매핑만 담당하고, 사용자 소유권이 적용된 run read/write/audit 동작은 service 계층으로 옮기는 편이 현재 보안 경계 고정 목표에 더 맞습니다.
- [가정] public payload shape와 기존 상태 코드는 유지해야 하므로, route 응답의 `data` 구조와 400/404/500 분기는 바꾸지 않았습니다.

## 변경 내용
- `src/lib/planning/server/runs/routeService.ts`를 추가해 run detail hydration, action-center patch, action-plan read, run delete audit/trash audit를 current-user repository 뒤로 모았습니다.
- v2 run detail route의 GET/PATCH/DELETE는 route guard, auth, validation, confirm, response mapping만 남기고 service 함수를 호출하도록 정리했습니다.
- v2 run action-plan route는 direct repository 호출을 제거하고 service를 통해 action plan을 조회하도록 정리했습니다.
- action-plan route의 `NO_DATA`/`INTERNAL` 응답에도 `meta.userId/authSource`가 유지되도록 맞췄습니다.
- fallback 테스트에 route/service source boundary assertion을 추가해 route에서 repository/sanitizer/audit 직접 접근이 재발하지 않게 고정했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/run-detail-route-fallback.test.ts tests/planning-v2-api/run-action-progress-route.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS
- `corepack pnpm lint` PASS
- `git diff --check` PASS
- `corepack pnpm build` 1차는 124초 timeout, 2차 긴 제한 실행 PASS
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:compat` PASS
- `corepack pnpm planning:v2:regress` PASS

## 남은 리스크
- [리스크] 이번 PR은 read-only 범위를 넘어 같은 route 파일의 PATCH/DELETE도 service boundary로 함께 이동했습니다. 검증은 통과했지만 PR 리뷰 시 범위가 read-only 후보보다 넓다는 점을 확인해야 합니다.
- [리스크] audit event 이름과 payload shape는 기존 route 내부 구현을 그대로 옮겼습니다. 후속 라운드에서 audit contract를 별도 테스트로 더 고정할 수 있습니다.
- [리스크] Spark 조건부 모델 지침은 인지했습니다. 이번 라운드는 메인 에이전트가 최종 검증을 단일 소유했고, 범위 분해는 manager 에이전트로 처리했습니다. Spark 신규 작업은 현재 사용 제한 이슈가 있어 맡기지 않았습니다.

## 다음 라운드 우선순위
1. v2 `runs/[id]/action-progress` route가 service boundary와 payload/error contract 측면에서 추가로 분리할 대상인지 확인합니다.
2. v3 repository imports 중 route handler에 직접 남은 저장소 접근을 후보군으로 다시 뽑습니다.
3. auth/current-user scope coverage가 route 기준 0건을 계속 유지하는지 PR마다 확인합니다.
