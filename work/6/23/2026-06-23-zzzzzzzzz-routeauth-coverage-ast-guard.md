# 2026-06-23 routeAuth coverage AST guard

## 변경 파일
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzz-routeauth-coverage-ast-guard.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 우선순위에 맞춰 Auth/User Scope 테스트 보강으로 범위를 좁혔습니다.
- `planning-gate-selector`: 테스트-only 정적 규칙 변경에 맞춰 표적 테스트, auth gate, lint/typecheck/build 검증을 선택했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 표준 `/work` 형식으로 정리했습니다.
- `gpt-5.3-codex-spark` + `xhigh`: routeAuth coverage의 문자열 의존 지점과 최소 AST 보강 후보를 병렬로 정적 조사했습니다.

## 변경 이유
- 기존 routeAuth boundary coverage는 일부 핵심 판정을 `source.includes(...)`에 의존해 주석, 미사용 import, 로컬 동명 함수 같은 false positive를 놓칠 수 있었습니다.
- Planning API의 표준 auth 경계는 `requirePlanningRouteUser` 또는 `withPlanningRouteUser`를 routeAuth 계층에서 import해 실제 route handler가 호출하는 형태여야 합니다.
- route 파일이나 public payload 계약을 바꾸지 않고, 테스트가 실제 import/call 구조를 확인하도록 보강했습니다.

## 핵심 변경
- TypeScript AST 기반으로 routeAuth named import의 local name을 수집하고, 해당 식별자의 실제 `CallExpression` 호출만 routeAuth boundary로 인정하는 helper를 추가했습니다.
- planning auth boundary route와 user-owned ops route의 routeAuth 확인을 문자열 검색에서 import+call AST 판정으로 전환했습니다.
- `requirePlanningRouteUser` guard 검사는 routeAuth import 기반 실제 호출일 때만 `isPlanningRouteUser` guard와 기존 Response guard 문구를 확인하도록 좁혔습니다.
- `withPlanningRouteUser` auth error bridge 검사도 실제 routeAuth helper 호출 기준으로 전환했습니다.
- comment-only, import-only, 로컬 동명 helper fixture를 추가해 문자열 기반 false positive 회귀를 고정했습니다.

## 검증
- `corepack pnpm test tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS (`1` file, `33` tests)
- `corepack pnpm planning:auth:check` PASS (`25` files, `185` tests)
- `corepack pnpm lint` PASS
- `corepack pnpm typecheck` PASS
- `corepack pnpm build` PASS
- `git diff --check` PASS
- `corepack pnpm multi-agent:guard` PASS
- `corepack pnpm verify` FAIL: `schema_drift_report.mjs`가 기존 fixture 기준 `finlife_credit-loan_snapshot.json`의 `$.items[].options[].raw.crdt_grad_5` 타입 drift를 `breaking=1`로 보고해 중단했습니다.

## 남은 리스크
- 이번 변경은 테스트 가드 보강만 수행했으므로 실제 planning route 구현은 변경하지 않았습니다.
- routeAuth failure bridge 자체는 아직 일부 문자열 패턴을 유지합니다. 이번 라운드에서는 routeAuth helper 호출 대상 판정만 AST로 좁혔습니다.
- UI, 셀렉터, 사용자 플로우 변경이 없어 `pnpm e2e:rc`는 실행하지 않았습니다.
- `pnpm verify`의 schema drift 실패는 이번 테스트 변경과 직접 관련 없는 기존 데이터 fixture drift로 보이며, 생성된 `docs/schema-drift-report.md` 부수 변경은 PR 범위에서 제외했습니다.

## 다음 라운드 우선순위
- DART `corpcodes/build` route의 파일/프로세스 접근 service 경계 분리를 검토합니다.
- PostgreSQL readiness gate를 release checklist와 더 촘촘히 연결합니다.
- Planning API repository/data ownership 정리에서 route handler 직접 파일/DB 접근 후보를 다음 작은 PR로 분리합니다.
