# 2026-06-23 Auth OAuth env priority contract

## 변경 파일
- `tests/planning/auth/authConfigContract.test.ts`

## 사용 skill
- `finance-skill-routing`: 이번 라운드를 Auth/User Scope 축의 OAuth 계약 보강으로 좁혔습니다.
- `planning-gate-selector`: 테스트-only 변경에 맞춰 auth contract, planning auth gate, lint/typecheck/build 검증을 선택했습니다.
- `work-log-closeout`: 실행한 검증과 남은 리스크를 표준 형식으로 정리했습니다.
- `gpt-5.3-codex-spark` + `xhigh`: OAuth env precedence와 routeAuth 표준 helper 유지 전제를 정적 조사했습니다.

## 변경 이유
- `/api/auth/*`는 GitHub/Google OAuth 우선 계약을 갖고 있지만, 기존 테스트는 provider id와 legacy alias 사용 여부만 확인했습니다.
- `AUTH_GITHUB_*`/`AUTH_GOOGLE_*`와 legacy `GITHUB_CLIENT_*`/`GOOGLE_CLIENT_*`가 동시에 설정될 때 `AUTH_*` 값이 실제 provider options에 채택되는지 회귀 방지가 약했습니다.
- Auth/User Scope 단계의 운영 계약을 더 명확히 고정하기 위해 테스트를 보강했습니다.

## 핵심 변경
- Auth.js provider 객체의 `options.clientId`/`options.clientSecret`을 provider id별로 읽는 테스트 helper를 추가했습니다.
- GitHub OAuth에서 `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`이 legacy alias보다 우선되는 케이스를 추가했습니다.
- Google OAuth에서 `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`이 legacy alias보다 우선되는 케이스를 추가했습니다.
- runtime auth config 구현, env 문서, route, UI는 변경하지 않았습니다.

## 검증
- `corepack pnpm test tests/planning/auth/authConfigContract.test.ts` PASS (`1` file, `10` tests)
- `corepack pnpm planning:auth:check` PASS (`25` files, `184` tests)
- `corepack pnpm lint` PASS
- `corepack pnpm typecheck` PASS
- `corepack pnpm build` PASS
- `git diff --check` PASS

## 남은 리스크
- OAuth provider 실제 로그인 플로우는 실행하지 않았습니다. 이번 변경은 env precedence 계약 테스트만 보강했습니다.
- 빈 문자열/공백 env는 기존 `configured()` 동작을 따르며 별도 구현 변경은 하지 않았습니다.
- Credentials/Email provider 후속 phase는 그대로 남아 있습니다.

## 다음 라운드 우선순위
- `planningRouteUserScopeCoverage.test.ts`의 routeAuth 가드/브리지 검증을 AST 기반으로 보강합니다.
- DART `corpcodes/build` route의 파일/프로세스 접근 service 경계 분리를 검토합니다.
- PostgreSQL readiness gate를 release checklist와 더 촘촘히 연결합니다.
