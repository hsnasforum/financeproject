# 2026-06-23 planning v3 scope regression tests

## 변경 파일
- `planning/v3/exposure/store.ts`
- `planning/v3/routines/store.ts`
- `tests/planning-v3-exposure-api.test.ts`
- `tests/planning-v3-routines-api.test.ts`
- `tests/planning-v3-account-overrides-api.test.ts`
- `tests/planning-v3-transfer-overrides-api.test.ts`

## 사용 skill
- `finance-skill-routing`: 이번 라운드를 Auth/User Scope 구현·검증 라운드로 분류하고 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: API route와 store namespace 변경에 맞는 검증 범위를 선정했습니다.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리했습니다.

## 변경 이유
- 최신 `/work`의 다음 우선순위였던 Planning API current-user scope blind spot을 이어서 점검했습니다.
- `exposure/profile`, `routines/daily`, account/transfer override API는 routeAuth와 current-user service를 사용하지만 alice/bob 교차 사용자 회귀 테스트가 부족했습니다.
- 새 테스트가 `exposure/profile`에서 bob meta와 alice profile이 함께 반환되는 실제 사용자 소유권 결함을 드러냈습니다.

## 핵심 변경
- `PLANNING_NAMESPACE_ENABLED=1`일 때 exposure store가 `users/{userId}/planning-v3/exposure` 아래를 사용하도록 수정했습니다.
- `PLANNING_NAMESPACE_ENABLED=1`일 때 routines daily store가 `users/{userId}/planning-v3/routines/daily` 아래를 사용하도록 수정했습니다.
- exposure/routines API 테스트에 trusted header 기반 alice/bob 격리 회귀 케이스를 추가했습니다.
- account/transfer override PATCH 테스트는 authenticated user meta와 사용자별 namespace 파일 분리를 확인합니다.
- 비 namespace store 동작은 기존 store 테스트로 유지 확인했습니다.

## 검증
- FAIL 후 수정: `corepack pnpm test tests/planning-v3-exposure-api.test.ts tests/planning-v3-routines-api.test.ts tests/planning-v3-account-overrides-api.test.ts tests/planning-v3-transfer-overrides-api.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
  - 최초 실패: exposure bob 요청이 `meta.userId=bob`이면서 alice profile을 반환했습니다.
  - 최초 실패: routines 테스트의 배열 부분 비교가 기본 체크리스트 전체 반환 계약과 맞지 않았습니다.
- PASS: `corepack pnpm test tests/planning-v3-exposure-api.test.ts tests/planning-v3-routines-api.test.ts tests/planning-v3-account-overrides-api.test.ts tests/planning-v3-transfer-overrides-api.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS: `corepack pnpm test planning/v3/exposure/__tests__/store.test.ts planning/v3/routines/store.test.ts tests/news-exposure-store.test.ts planning/v3/exposure/__tests__/serverOnly.test.ts planning/v3/routines/serverOnly.test.ts`
- PASS: `corepack pnpm planning:auth:check`
- PASS: `corepack pnpm lint`
- PASS: `corepack pnpm typecheck`
- PASS: `corepack pnpm test`
- PASS: `corepack pnpm build`
- PASS: `corepack pnpm sec:check`
- PASS: `git diff --check`

## 남은 리스크
- news personalization 계열은 이번 라운드에서 수정하지 않았습니다. 다음 라운드에서 `news/settings`, `news/alerts`, `news/notes` 중심으로 user-owned state 여부를 좁혀 확인해야 합니다.
- Spark 정적 탐색이 지적한 shared dev-only ops route와 planning feedback store는 현재 coverage에서 shared route로 고정되어 있습니다. 운영 전환이 필요할 때 별도 사용자 소유권 설계가 필요합니다.
- `pnpm verify`는 실행하지 않았습니다. 이번 라운드는 API user-scope와 store namespace 변경에 맞춰 `pnpm test`, `build`, `planning:auth:check`, `sec:check`까지 실행했습니다.

## 다음 라운드 우선순위
- `planning/v3/news/settings`, `news/alerts`, `news/alerts/rules`, `news/notes`, `news/notes/[noteId]`의 user-owned state 격리 테스트를 분리합니다.
- shared dev-only ops feedback store는 production 노출 계획이 생길 때 userId 스키마 또는 routeAuth 전환을 별도 PR로 다룹니다.
- PostgreSQL migration readiness는 Auth/User Scope 1차 blind spot을 더 줄인 뒤 dry-run/checksum gate로 이동합니다.
