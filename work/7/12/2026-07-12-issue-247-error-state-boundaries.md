# 2026-07-12 Issue #247 오류 복구 상태와 route failure boundary

## 변경 파일

- `src/components/ui/ErrorState.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/app/error.tsx`
- `src/app/not-found.tsx`
- `src/app/planning/loading.tsx`
- `playwright.config.ts`
- `tests/error-state-boundaries.test.tsx`
- `tests/e2e/error-state-retry.spec.ts`
- `package.json`
- `.github/workflows/e2e-smoke.yml`
- `work/7/12/2026-07-12-issue-247-error-state-boundaries.md`

## 사용 skill

- `finance-skill-routing`: 오류 UI, route boundary, 브라우저 검증에 필요한 최소 skill 집합을 선택했습니다.
- `planning-gate-selector`: focused 단위/E2E, route SSOT, lint, typecheck, 전체 테스트, build, RC E2E, production 404 검증 범위를 선택했습니다.
- `route-ssot-check`: 새 공개 URL 없이 App Router 특수 파일만 추가되고 기존 production-hidden 404 계약이 유지되는지 확인했습니다.
- `playwright`: Benefits·청약 재시도, Planning 401 구분·복구, 일반 404와 production-hidden 404를 실제 브라우저/HTTP 상태로 검증했습니다.
- `work-log-closeout`: 검증 결과, 계약 영향, 실패 재현과 롤백 기준을 종료 기록으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/247
- 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- 작업 브랜치: `codex/247-error-state-boundaries`
- stacked base: `codex/246-home-hero-carousel` (`9361002caca16129813e6521d04f1b898117ed09`)
- 공용 `ErrorState`는 `onRetry`만 넘긴 Benefits, 청약, Planning reports 호출자에서 버튼을 렌더링하지 않아 복구 동작이 숨겨졌습니다.
- 루트 `error.tsx`와 `not-found.tsx`가 없어 서버 실패와 404가 제품 문구·복구 동작을 일관되게 제공하지 못했습니다.
- Planning reports의 401은 일반 데이터 로드 실패와 같은 시각·문구로 표시됐습니다.

## 핵심 변경

- `ErrorState` action props를 판별 가능한 union으로 바꾸고 `onRetry`가 있으면 기본 버튼 문구 `다시 시도`를 항상 제공합니다. action 없는 상태에 `retryLabel`만 전달하는 조합은 typecheck에서 차단합니다.
- 인증 필요 상태는 amber 계열, 고정 제목과 쉬운 안내 문구로 일반 오류와 구분합니다. dev unlock shortcut 계약은 유지합니다.
- 루트 `error.tsx`는 원본 message·stack을 노출하지 않고, 문자·길이를 검증한 digest만 오류 ID로 보여줍니다. Next 16.2가 제공하는 서버 콘텐츠 재요청 동작을 우선하고 없으면 `reset`으로 안전하게 fallback합니다.
- 루트 `not-found.tsx`는 전용 404 설명과 홈 이동 동작을 제공합니다.
- Planning reports는 runs API 401에서 선택·비교 상태를 비우고 인증 필요 UI를 표시하며, 재시도 시 현재 페이지를 다시 로드합니다. 로그인 공급자나 sign-in route는 Issue #233 범위이므로 추가하지 않았습니다.
- 테스트 전용 `PLANNING_E2E_DISABLE_AUTH_HEADER=1`로 신뢰 헤더를 명시적으로 끌 수 있게 하고, GitHub E2E workflow에서 401 복구 케이스를 별도 필수 단계로 실행합니다.
- 루트 `loading.tsx`도 초기에 추가했으나 production-hidden page의 `notFound()`를 streamed 200으로 바꾸는 회귀가 실제 `/dev/data`에서 재현되어 제거했습니다. loading 상태는 현재 `notFound()` 호출이 없는 핵심 `/planning` segment로 좁히고, 해당 segment의 미존재 URL이 404를 유지하는지 E2E로 고정했습니다.

## 계약 영향

- public API: 영향 없음
- 응답 shape: 영향 없음
- stored data: 영향 없음
- DB query: 영향 없음
- cache/revalidation: 영향 없음
- migration: 영향 없음
- route/href: 새 공개 route와 href 없음. App Router의 루트 오류·404 및 `/planning` loading 특수 파일만 추가
- test runtime env: `PLANNING_E2E_DISABLE_AUTH_HEADER=1` 추가. 제품 runtime에는 사용하지 않음
- UI/접근성: 재시도 기본 동작 노출, 인증 필요 상태 구분, 안전한 500·404 안내와 홈 복구 동작 추가

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test tests/error-state-boundaries.test.tsx tests/dev-unlock-shortcut.test.ts tests/planning/auth/routeAuth.test.ts tests/middleware-security.test.ts`: PASS, 4 files / 51 tests
- `PLANNING_E2E_DISABLE_AUTH_HEADER=1 PLANNING_AUTH_REQUIRED=1 DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:pw tests/e2e/error-state-retry.spec.ts --grep "planning reports keeps" --workers=1`: PASS, 1 test
- `corepack pnpm planning:ssot:check`: PASS, 5 files / 9 tests
- `corepack pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm typecheck`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 806 files / 2,719 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 31 passed / focused auth·production 전용 2 skipped
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- `E2E_WEB_SERVER_MODE=production PLANNING_SINGLE_USER_MODE=true DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:pw tests/e2e/smoke.spec.ts --grep "production hides dev and debug surfaces" --workers=1`: PASS, 1 test; `/api/dev/errors/recent`, `/dev/data`, `/debug/unified`, `/dashboard/artifacts` 모두 404
- `E2E_WEB_SERVER_MODE=production PLANNING_SINGLE_USER_MODE=true DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:pw tests/e2e/error-state-retry.spec.ts --grep "an unknown route returns" --workers=1`: PASS, 1 test
- `git diff --check`: PASS
- `corepack pnpm multi-agent:guard`: PASS, 최신 work note tracked 확인
- `git diff --cached --check`: PASS
- 초기 production smoke는 `PLANNING_SINGLE_USER_MODE` 또는 namespace가 명시되지 않아 안전 gate에서 서버 시작이 차단됐습니다. 실제 저장소를 쓰지 않고 테스트용 single-user storage mode를 명시해 재실행했습니다.
- 초기 루트 loading 포함 production smoke는 `/dev/data`가 200을 반환해 FAIL했습니다. 루트 loading을 제거한 동일 smoke에서 네 경로 모두 404로 복구됨을 확인했습니다.

## 독립 검토 반영

- 로컬 boundary만 초기화하는 `reset` 대신 서버 콘텐츠를 다시 요청하는 `unstable_retry`를 우선 사용하고 fallback을 유지했습니다.
- Planning 401 E2E가 기본 RC에서 skip되는 문제를 별도 CI 단계와 명시적 테스트 헤더 비활성 플래그로 해소했습니다.
- digest는 영문·숫자·`_`·`-`, 최대 128자로 제한했습니다.
- root loading의 production-hidden 200 회귀를 실측한 뒤 전역 경계를 제거하고 loading을 `/planning` segment로 좁혔습니다.
- Planning 401 본문을 일반 로드 실패 문구가 아닌 고정 로그인 상태 안내로 바꾸고 E2E assertion을 추가했습니다.
- 최종 독립 reviewer 재검토: P0/P1 차단 finding 없음. `/planning` scoped loading과 root·planning unknown 및 production-hidden 404 검증을 확인했습니다.

## 남은 리스크

- `unstable_retry`는 Next가 unstable 이름으로 제공하는 동작입니다. 현재 16.2.6 runtime에서 확인했으며, framework 변경 시 fallback `reset`은 남지만 서버 콘텐츠 재조회 강도는 다시 확인해야 합니다.
- loading UI는 `/planning`에만 존재합니다. 향후 이 segment 안에서 `notFound()`를 사용하는 page를 추가하면 `/planning/__e2e_missing_route__`의 production 404 검증과 해당 page의 실제 404 상태를 함께 확인해야 합니다.
- 인증 상태에는 아직 실제 로그인 CTA가 없습니다. provider·세션·로그인 route 결정은 #232·#233의 제품/보안 결정 이후 구현해야 합니다.
- 일반 500 boundary의 실제 throw E2E는 테스트 전용 production route를 만들지 않기 위해 단위 contract와 build로 검증했습니다. 사용자 메시지·stack 비노출, retry wiring은 단위 테스트로 고정했습니다.
- GitHub Actions의 실제 실행 가능 여부는 PR 생성 후 별도로 확인합니다.

## 롤백 기준

- 공용 `ErrorState` 기본 action이 기존 호출자의 레이아웃이나 dev unlock 흐름을 깨뜨리면 caller별 action을 숨기지 말고 공용 props 계약과 스타일만 조정합니다.
- 인증 필요 상태가 401이 아닌 일반 오류에 표시되면 status 분기와 상태 초기화를 우선 되돌립니다.
- 오류 ID가 예상하지 못한 민감 정보를 포함하면 digest 노출 전체를 제거합니다.
- production-hidden 경로 중 하나라도 200으로 돌아오면 root loading을 다시 추가하지 않고 route group 또는 middleware 차단 설계를 별도 Issue에서 결정합니다.
- RC/CI 시간이 운영 한도를 넘으면 신규 E2E를 삭제하지 않고 focused job 분리나 더 작은 상시 gate를 검토합니다.

## 다음 라운드 우선순위

1. Issue #248의 최신 main 근거와 기존 Issue/PR 중복을 다시 확인합니다.
2. 제품 결정이 필요한 #232와 운영 결정이 필요한 #242는 승인 전 구현하지 않습니다.
3. GitHub Actions pre-step 실패가 반복되면 저장소 테스트와 분리해 계정·runner·quota 상태를 운영 결정으로 보고합니다.
