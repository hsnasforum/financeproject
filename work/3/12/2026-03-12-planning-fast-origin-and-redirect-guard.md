# 2026-03-12 planning fast e2e origin 및 legacy redirect 가드 정리

## 변경 파일
- `next.config.ts`
- `tests/next-config-dev-origins.test.ts`
- `tests/middleware-security.test.ts`

## 사용 skill
- `planning-gate-selector`
  - release/ops 검증 중 드러난 실패를 `Next dev origin 설정`, `legacy redirect 계약`, `브라우저 e2e 환경 제약`으로 나눠 최소 검증 세트를 다시 고르는 데 사용했다.
- `route-ssot-check`
  - `/planner/[...slug]` redirect 계약을 `docs/current-screens.md`와 현재 helper 구현에 대조해, stale e2e 기대값이 아니라 현재 SSOT가 무엇인지 확인하는 데 사용했다.
- `work-log-closeout`
  - 이번 라운드에서 실제 변경, 실제 검증, 환경 blocker를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- `pnpm release:verify`를 실제 실행했을 때 `planning:v2:e2e:fast`가 막혔다.
- 로그상 드러난 축은 두 가지였다.
  - `POST /api/planning/v2/profiles` seed 경로가 dev 환경에서 403으로 막히던 점
  - `/planner/legacy` redirect 기대와 현재 route SSOT가 어긋나 있던 점
- 현재 저장소 기준 SSOT는 `docs/current-screens.md`, `src/lib/planning/legacyPlannerRedirect.ts`, `src/app/planner/[...slug]/page.tsx`가 일치하는 상태였고, 브라우저 e2e 기대값 또는 dev 환경 설정 쪽이 이를 완전히 따라가지 못하고 있었다.

## 핵심 변경
- `next.config.ts`의 `allowedDevOrigins`에 `localhost`, `::1`을 추가해, 로컬/e2e에서 실제로 쓰는 loopback origin이 Next dev 단계에서 불필요하게 차단되지 않도록 맞췄다.
- `tests/next-config-dev-origins.test.ts`를 추가해, loopback dev origin 허용값(`127.0.0.1`, `localhost`, `::1`)이 다시 빠지지 않도록 회귀 테스트를 고정했다.
- `tests/middleware-security.test.ts`에 unsupported legacy deep link(`/planner/legacy`)가 현재 SSOT대로 `/planning`으로 접히는지 확인하는 케이스를 추가했다.

## 검증
- `pnpm release:verify`
  - FAIL
  - `planning:v2:e2e:fast` 단계에서 멈췄고, 최초 수집 로그 기준 `/planner/legacy` 기대값 불일치와 planning seed 403이 함께 보였다.
- `pnpm build:detached`
  - PASS
  - `/tmp/finance-build-detached-2026-03-12T03-19-02-425Z.exit.json`
  - `code=0`
- `pnpm test tests/next-config-dev-origins.test.ts tests/middleware-security.test.ts tests/planner-page-redirect.test.ts tests/dev-local-request.test.ts tests/dev-guards.test.ts`
  - PASS
  - 5 files, 26 tests 통과
- `pnpm planning:current-screens:guard`
  - PASS
  - 5 files, 9 tests 통과
- `git diff --check HEAD -- next.config.ts tests/next-config-dev-origins.test.ts tests/middleware-security.test.ts tests/e2e/planning-v2-fast.spec.ts tests/e2e/helpers/planningGateHelpers.ts docs/current-screens.md src/lib/planning/legacyPlannerRedirect.ts src/app/planner/[...slug]/page.tsx middleware.ts`
  - PASS
- `pnpm planning:v2:e2e:fast`
  - FAIL
  - 현재 Codex exec에서는 `Process from config.webServer was not able to start. Exit code: 1`로 webServer 기동 단계에서 막혔다.
- `E2E_BASE_URL=http://127.0.0.1:3333 pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts`
  - FAIL
  - 브라우저 launch 단계에서 `sandbox_host_linux.cc:41` fatal로 종료돼 현재 세션의 Chromium 실행 환경 제약이 확인됐다.

## 남은 리스크
- 코드 기준으로는 `allowedDevOrigins`와 legacy redirect SSOT 회귀 체크를 보강했지만, 브라우저 기반 `planning:v2:e2e:fast`와 `release:verify`는 현재 Codex exec 환경에서 webServer/Chromium 단계에서 불안정하다.
- `tests/e2e/planning-v2-fast.spec.ts`와 `tests/e2e/helpers/planningGateHelpers.ts`는 이번 라운드에서 읽고 검증했지만, 현재 환경 제약 때문에 최종 브라우저 PASS를 다시 찍지는 못했다.
- `next.config.ts`, `tests/middleware-security.test.ts`는 HEAD 대비 다른 워크트리 변경이 이미 섞여 있으므로, 후속 정리 시 이번 라운드의 실 변경은 `allowedDevOrigins` 보강과 redirect fallback 테스트 추가임을 기준으로 보면 된다.

## 이번 라운드 완료 항목
1. Next dev loopback origin 허용 범위(`127.0.0.1`, `localhost`, `::1`) 정렬
2. legacy `/planner` deep-link redirect SSOT를 unit/current-screens guard 기준으로 재고정
3. release gate가 앱 코드 blocker인지, 현재 Codex exec의 webServer/Chromium 환경 blocker인지 분리

## 다음 라운드 우선순위
1. 현재 Codex exec에서 `planning:v2:e2e:fast` webServer start가 왜 `Exit code: 1`로 끊기는지 런타임 레벨로 재현/분리
2. Chromium `sandbox_host_linux.cc` fatal이 세션 특이인지 실행 옵션 특이인지 좁혀 브라우저 e2e PASS를 다시 확보
3. 위 환경 blocker가 정리되면 `pnpm release:verify`를 끝까지 재실행해 release gate를 최종 PASS로 닫기
