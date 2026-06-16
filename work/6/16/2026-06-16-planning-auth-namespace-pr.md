# 2026-06-16 planning-auth-namespace-pr

## 변경 파일
- `.env.example`
- `docs/current-screens.md`
- `middleware.ts`
- `package.json`
- `pnpm-lock.yaml`
- `prisma/schema.prisma`
- `src/auth.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/planning/profiles/route.ts`
- `src/app/api/planning/profiles/[id]/route.ts`
- `src/app/api/planning/v2/profiles/route.ts`
- `src/app/api/planning/v2/profiles/[id]/route.ts`
- `src/app/api/planning/v2/runs/[id]/action-progress/route.ts`
- `src/lib/planning/api/routeAuth.ts`
- `src/lib/planning/auth/currentUser.ts`
- `src/lib/planning/store/namespace.ts`
- `src/lib/planning/store/profileStore.ts`
- `src/lib/planning/store/userScope.ts`
- `tests/middleware-security.test.ts`
- `tests/planning/auth/authConfigContract.test.ts`
- `tests/planning/auth/currentUser.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `tests/planning/store/planningStoreNamespace.test.ts`
- `work/6/16/2026-06-16-planning-auth-namespace-pr.md`

## 사용 skill
- `work-artifact-intake`: 최신 `/work` 기록과 dirty 범위에서 첫 PR 후보를 확인했습니다.
- `planning-gate-selector`: Auth, route guard, API handler, store namespace, docs 변경에 맞는 검증 세트를 골랐습니다.
- `verification-failure-followthrough`: 첫 `pnpm build` 실패를 Prisma client 생성 누락으로 분류하고 재검증했습니다.
- `route-ssot-check`: `docs/current-screens.md`와 route guard 설명 변경에 맞춰 SSOT 검증을 추가했습니다.
- `github:github`: 현재 브랜치 PR 상태와 원격 기준을 확인했습니다.
- `github:yeet`: 별도 브랜치, commit, push, PR, merge 흐름으로 진행합니다.
- `work-log-closeout`: 이번 라운드 변경과 검증 결과를 종료 기록으로 남겼습니다.

## 변경 이유
- 기존 worktree의 dirty 항목이 매우 넓어 그대로 PR을 만들면 auth, page, ops, products, data/docs 변경이 섞입니다.
- 첫 병합 단위는 `origin/main` 기준으로 Auth.js 기본 설정, planning API route user scope, request-scoped planning namespace만 포함하도록 분리했습니다.
- `profileStore`의 meta/registry fallback이 현재 사용자 namespace 안의 profile partitions 기준을 따르도록 보강했습니다.

## 핵심 변경
- Auth.js provider 설정, session user id 주입, `/api/auth/[...nextauth]` route를 추가했습니다.
- `PLANNING_AUTH_REQUIRED`와 trusted internal auth header에 따른 planning API middleware 차단을 추가했습니다.
- planning API profile/action-progress 일부 route를 `routeAuth` 경계 안에서 실행하도록 바꿨습니다.
- request scope의 planning user id가 store namespace resolver에 반영되도록 했습니다.
- Auth/route/store namespace coverage 테스트와 route 문서 설명을 추가했습니다.

## 검증
- PASS `corepack pnpm exec vitest run tests/planning/auth/authConfigContract.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/middleware-security.test.ts tests/planning/store/planningStoreNamespace.test.ts tests/planning-v2-api/profiles-route.test.ts tests/planning-v2-api/run-action-progress-route.test.ts`
- PASS `git diff --check`
- PASS `corepack pnpm lint`
- FAIL `corepack pnpm build`
  - 실패 경계: 새 worktree에서 Prisma client가 생성되지 않아 `@prisma/client`의 `PrismaClient` export 타입을 찾지 못했습니다.
- PASS `DATABASE_URL="file:./prisma/dev.db" corepack pnpm prisma:generate`
- PASS `corepack pnpm build`
- PASS `corepack pnpm planning:ssot:check`
- PASS `corepack pnpm sec:check`
- PASS `corepack pnpm test`
- FAIL GitHub Actions `verify`
  - 실패 경계: `pnpm deps:audit`에서 `esbuild`, `vite`, `hono`, `js-yaml` 취약점이 감지되었습니다.
- FAIL `corepack pnpm deps:audit`
  - 로컬 재현 결과: 11 vulnerabilities.
- 변경: `vite`, `vitest`, `tsx`를 갱신하고 `pnpm.overrides`에 `esbuild`, `hono`, `js-yaml` 안전 버전을 고정했습니다.
- FAIL `corepack pnpm install`
  - 실패 경계: postinstall의 Prisma generate에 `DATABASE_URL`이 필요했습니다.
- PASS `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS `corepack pnpm deps:audit`
- PASS `corepack pnpm deps:audit && corepack pnpm lint`
- PASS `corepack pnpm test`
- PASS `corepack pnpm sec:check && corepack pnpm planning:ssot:check && corepack pnpm build`

## 잔여 리스크
- 이번 PR은 모든 planning API route의 전면 routeAuth 표준화를 완료하지 않습니다. 남은 route 전면 표준화는 별도 PR 범위입니다.
- page-level RSC 초기 로드 scope, ops wrapper, products/recommend, generated data/docs 변경은 원본 dirty worktree에 남아 있습니다.
- `AUTH_PRISMA_ADAPTER_ENABLED=true` 운영 전환은 DB migration/backfill 검증과 별도 rollout이 필요합니다.
- `pnpm e2e:rc`는 이번 API/middleware/store 중심 PR에서는 실행하지 않았습니다.
