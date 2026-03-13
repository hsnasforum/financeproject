# 2026-03-12 planner legacy redirect 및 e2e guard 정리

## 변경 파일
- `src/lib/planning/legacyPlannerRedirect.ts`
- `middleware.ts`
- `src/app/planner/[...slug]/page.tsx`
- `tests/planner-page-redirect.test.ts`
- `tests/e2e/planning-v2-fast.spec.ts`
- `tests/e2e/helpers/planningGateHelpers.ts`
- `scripts/next_dev_safe.mjs`
- `docs/current-screens.md`
- `work/2026-03-12-planner-legacy-redirect-and-e2e-guard-closeout.md`

## 사용 skill
- `planning-gate-selector`
  - route redirect, e2e helper, Next dev helper까지 섞인 변경을 `route/current-screens`, `lint`, `build`, `e2e`로 분류하고 현재 환경에서 실행 가능한 최소 검증 세트를 고르는 데 사용했다.
- `route-ssot-check`
  - `/planner/[...slug]` redirect 계약을 실제 planning 경로와 맞춰 재정의하고 `docs/current-screens.md`와 current-screens guard가 같이 유지되는지 점검하는 데 사용했다.
- `work-log-closeout`
  - 이번 라운드의 실제 변경, 실제 검증, [blocked] 항목, 다음 우선순위를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- `pnpm release:verify`를 실제로 다시 열어보는 과정에서 `planning:v2:e2e:fast`가 두 축에서 막혔다.
- 첫째, `/planner/[...slug]`가 존재하지 않는 `/planning/[...slug]`까지 그대로 넘기며 legacy deep link가 안전하게 수렴하지 못했다.
- 둘째, e2e seed helper가 `dev_csrf` 쿠키가 존재하는 경우 write route에 같은 `csrf`를 다시 보내지 않아 403 가능성을 남기고 있었다.
- 추가로, 현재 Codex exec에서는 `next dev` 자체가 `listen EPERM`으로 막혀 Playwright webServer를 직접 띄울 수 없어, app 회귀와 실행 환경 제약을 분리해 기록할 필요가 있었다.

## 핵심 변경
- `src/lib/planning/legacyPlannerRedirect.ts`를 추가해 legacy `/planner/*` redirect 규칙을 한곳에 모으고, 지원되는 planning 하위 경로(`reports`, `runs`, `trash`, `v3`)만 suffix를 유지하고 그 외는 `/planning`으로 안전하게 내리도록 했다.
- `middleware.ts`와 `src/app/planner/[...slug]/page.tsx`가 같은 helper를 쓰도록 바꿔 middleware/app route 간 redirect 드리프트를 제거했다.
- `tests/planner-page-redirect.test.ts`, `tests/e2e/planning-v2-fast.spec.ts`, `docs/current-screens.md`를 새 redirect 계약에 맞춰 갱신했다.
- `tests/e2e/helpers/planningGateHelpers.ts`는 request storageState에서 `dev_action`/`dev_csrf`를 읽어, guard 쿠키가 있는 경우에만 doctor migration GET과 planning write POST body에 같은 `csrf`를 붙이도록 바꿨다.
- `scripts/next_dev_safe.mjs`는 port probe 단계의 `EPERM`을 경고로 드러낸 뒤 실제 Next bind까지 시도하게 바꿔, 현재 Codex exec에서 Playwright webServer가 왜 막히는지 원인을 더 명확히 보이도록 했다.

## 검증
- `pnpm test tests/planner-page-redirect.test.ts`
  - PASS
- `pnpm planning:current-screens:guard`
  - PASS
- `pnpm exec eslint middleware.ts src/app/planner/[...slug]/page.tsx src/lib/planning/legacyPlannerRedirect.ts tests/e2e/helpers/planningGateHelpers.ts tests/e2e/planning-v2-fast.spec.ts tests/planner-page-redirect.test.ts`
  - PASS
- `pnpm exec eslint scripts/next_dev_safe.mjs middleware.ts src/app/planner/[...slug]/page.tsx src/lib/planning/legacyPlannerRedirect.ts tests/e2e/helpers/planningGateHelpers.ts tests/e2e/planning-v2-fast.spec.ts tests/planner-page-redirect.test.ts`
  - PASS
- `git diff --check HEAD -- scripts/next_dev_safe.mjs middleware.ts src/app/planner/[...slug]/page.tsx src/lib/planning/legacyPlannerRedirect.ts tests/e2e/helpers/planningGateHelpers.ts tests/e2e/planning-v2-fast.spec.ts tests/planner-page-redirect.test.ts docs/current-screens.md`
  - PASS
- `node --check scripts/next_dev_safe.mjs`
  - PASS
- `node --import tsx - <<'EOF' ... planningGateHelpers csrf bridge mock ... EOF`
  - PASS
  - `planningGateHelpers csrf bridge PASS`
  - `dev_action/dev_csrf` 쿠키가 있는 경우 doctor GET query와 planning write POST body에 `csrf`가 같이 실리고, 쿠키가 없는 경우 doctor GET을 건너뛰고 `csrf`를 넣지 않는 것을 mock request로 확인했다.
- `pnpm multi-agent:guard`
  - PASS
  - `tracked=22 coverage=16`
- `pnpm build:detached`
  - PASS
  - `/tmp/finance-build-detached-2026-03-12T03-23-36-596Z.exit.json`
  - `code=0`
  - log 기준 `compile -> type-checking -> static-generation -> worker exit`까지 정상 종료
- `node scripts/next_dev_safe.mjs --webpack --host 0.0.0.0 --port 3126 --strict-port`
  - [blocked]
  - Codex exec 안에서 실제 `next dev` bind가 `listen EPERM: operation not permitted 0.0.0.0:3126`로 막히는 것을 재현했다.
- `pnpm planning:v2:e2e:fast`
  - [blocked]
  - Playwright `config.webServer`가 위 `next dev` bind 단계에서 같은 `Exit code: 1`로 종료되어 app-level e2e assertion까지 진입하지 못했다.

## 남은 리스크
- 이번 라운드의 app-side 수정(legacy redirect fallback, e2e helper csrf bridge)은 단위/route/build/mock 수준까지는 확인했지만, 실제 Playwright fast e2e와 `pnpm release:verify`는 현재 Codex exec의 `next dev listen EPERM` 때문에 같은 턴에서 재통과를 확인하지 못했다.
- `scripts/next_dev_safe.mjs`는 이제 port probe 단계 원인을 더 명확히 보여주지만, 현재 exec 환경 자체가 실제 bind를 막는 한 e2e/release gate는 계속 [blocked] 상태다.
- 이미 떠 있는 세션이나 이미 생성된 보조 에이전트는 이번 라운드의 redirect/helper 규칙을 자동 반영하지 않는다.

## 이번 라운드 완료 항목
1. unsupported legacy `/planner/*` deep link를 `/planning`으로 안전하게 수렴하도록 redirect 계약 재정의
2. e2e seed helper의 `dev_csrf` bridge 추가와 doctor migration GET 조건부 실행
3. Codex exec에서 `next dev`가 왜 막히는지 `next_dev_safe` 로그 경로로 분리

## 다음 라운드 우선순위
1. Codex exec 밖 또는 bind 가능한 셸에서 `pnpm planning:v2:e2e:fast`와 `pnpm release:verify`를 다시 실행해 현재 코드 기준 최종 PASS를 찍는다.
2. 필요하면 `next dev listen EPERM`을 Codex helper/런북 수준에서 더 명시적으로 우회하거나 외부 base URL 검증 절차를 정리한다.
3. legacy `/planner/*` deep link 중 추가로 유지해야 할 하위 경로가 있는지 운영 기준을 한 번 더 교차 점검한다.
