# 2026-06-23 auth-user-scope-next-round-plan

## 변경 파일
- `package.json`
- `tests/planning/auth/authConfigContract.test.ts`
- `work/6/23/2026-06-23-auth-user-scope-next-round-plan.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기반으로 Auth/User Scope 후속 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: script/test-only auth gate 변경에 필요한 검증 후보를 골랐습니다.
- `work-log-closeout`: `/work` 종료 기록의 표준 섹션과 실제 실행 명령 기록 기준을 확인했습니다.

## 변경 이유
- `PLANNING_AUTH_REQUIRED` production 강제 인증과 local/dev explicit fallback 계약은 이미 코드, 문서, 테스트에 고정돼 있음을 정적 조사로 확인했습니다.
- 남은 공백은 `planning:auth:check` 스크립트가 planning-adjacent auth route인 `/api/products/candidates` 회귀 테스트를 직접 포함하지 않는 점이었습니다.
- 해당 route는 `planningRouteUserScopeCoverage`의 adjacent auth boundary 목록에 포함되지만, auth 전용 gate에서도 직접 실행되도록 묶어 보안 검증 누락 가능성을 줄였습니다.

## 핵심 변경
- `planning:auth:check` 스크립트에 `tests/planning-v2-api/products-candidates-route.test.ts`를 추가했습니다.
- `authConfigContract.test.ts`의 스크립트 계약 기대값을 동일하게 갱신했습니다.
- 기존 `products-candidates` 테스트가 trusted-header user scope, `meta.userId`, `meta.authSource`, forbidden auth header 경로를 검증하는 것을 확인했습니다.
- Spark 정적 조사 시도는 사용량 한도로 실패했으며, manager 정적 분해 결과를 기준으로 메인 에이전트가 구현과 최종 검증을 단일 소유했습니다.

## 검증
- `corepack pnpm test tests/planning/auth/authConfigContract.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning-v2-api/products-candidates-route.test.ts` PASS
- `corepack pnpm planning:auth:check` PASS
- `corepack pnpm lint` PASS
- `git diff --check` PASS

## 남은 리스크
- 이번 라운드는 auth gate 스크립트 범위 보강에 한정했고, route 코드나 사용자 화면은 변경하지 않았습니다.
- `docs/current-screens.md`에 `/api/products/candidates`를 별도 항목으로 추가할지는 문서 범위가 API 전체 목록이 아니라 핵심 노출 규칙 중심이라는 점을 고려해 별도 라운드에서 판단하는 편이 안전합니다.
