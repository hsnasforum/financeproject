# 2026-03-12 runtime playwright color env warning closeout

## 변경 파일
- `scripts/runtime_color_env.mjs`
- `scripts/next_dev_safe.mjs`
- `scripts/next_build_safe.mjs`
- `scripts/next_prod_safe.mjs`
- `scripts/playwright_with_webserver_debug.mjs`
- `playwright.config.ts`
- `tests/runtime-color-env.test.ts`

## 사용 skill
- `planning-gate-selector`: runtime-release 스크립트 변경에 필요한 최소 검증 세트를 `node --check + vitest + eslint + build + prod smoke + dev e2e smoke`로 고르는 데 사용
- `work-log-closeout`: 이번 runtime batch의 실제 수정, 실제 실패/수정, 실제 검증 결과를 `/work` 형식으로 정리하는 데 사용

## 변경 이유
- 최근 runtime-release 우선순위에서 남아 있던 실제 노이즈는 Playwright/webServer/dev runtime 경로에서 반복되던 `(node:...) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.`였습니다.
- 1차 확인 결과 shell에는 `NO_COLOR=1`만 있었고, Playwright가 child/webServer 경로에서 `FORCE_COLOR`를 다시 넣으면서 `NO_COLOR`와 충돌하고 있었습니다.
- wrapper child env는 일반 runtime 경로와 Playwright 경로를 다르게 다뤄야 해서, 공통 helper와 Playwright 전용 sanitizer를 분리하는 최소 수정으로 범위를 좁혔습니다.

## 핵심 변경
- `scripts/runtime_color_env.mjs`에 두 helper를 추가했습니다.
  - `sanitizeInheritedColorEnv`: 일반 child env에서는 `NO_COLOR`가 있으면 `FORCE_COLOR`를 제거
  - `sanitizePlaywrightColorEnv`: Playwright 경로에서는 `NO_COLOR`를 제거해 Playwright의 강제 color 주입과 충돌하지 않게 함
- `scripts/next_dev_safe.mjs`, `scripts/next_build_safe.mjs`, `scripts/next_prod_safe.mjs`는 child `node/next` spawn에 일반 sanitizer를 쓰도록 맞췄습니다.
- `scripts/playwright_with_webserver_debug.mjs`와 `playwright.config.ts`의 `webServer.env`는 Playwright 전용 sanitizer를 쓰도록 바꿨습니다.
- `tests/runtime-color-env.test.ts`를 추가해 일반 sanitizer, Playwright sanitizer, 그리고 실제 `node -e` child startup warning 부재를 고정했습니다.
- `tests/next-dev-safe-bridge-status.test.ts`, `tests/next-config-dev-origins.test.ts`는 회귀 확인용으로 함께 재실행했습니다.

## 검증
- `node --check scripts/runtime_color_env.mjs`
- `node --check scripts/next_dev_safe.mjs`
- `node --check scripts/next_build_safe.mjs`
- `node --check scripts/next_prod_safe.mjs`
- `node --check scripts/playwright_with_webserver_debug.mjs`
- `pnpm test tests/runtime-color-env.test.ts tests/next-dev-safe-bridge-status.test.ts tests/next-config-dev-origins.test.ts`
  - PASS
- `pnpm exec eslint scripts/runtime_color_env.mjs scripts/next_dev_safe.mjs scripts/next_build_safe.mjs scripts/next_prod_safe.mjs scripts/playwright_with_webserver_debug.mjs playwright.config.ts tests/runtime-color-env.test.ts`
  - PASS
- `pnpm build`
  - 1차 FAIL: `playwright.config.ts`의 `webServer.env` 타입이 `string | undefined`로 남아 build type error 발생
  - 수정 후 PASS
- `pnpm planning:v2:prod:smoke`
  - PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - PASS
  - 재실행 로그에서 기존 `NO_COLOR`/`FORCE_COLOR` warning이 사라진 것을 확인

## 남은 리스크
- 공식 Playwright/webServer/dev/build/prod 경로의 color env warning은 이번 배치에서 닫았습니다.
- raw 수동 실행인 `FORCE_COLOR=1 NO_COLOR=1 node scripts/next_dev_safe.mjs ...`처럼 wrapper 자체를 직접 띄우는 비표준 경로는 Node가 wrapper process 시작 시점에 먼저 warning을 낼 수 있습니다. 현재 운영/검증 진입점은 `pnpm ...` 및 Playwright wrapper라 blocker는 아닙니다.
- 문서, README, route SSOT, current-screens 계약은 이번 배치에서 바뀌지 않아 수정하지 않았습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
