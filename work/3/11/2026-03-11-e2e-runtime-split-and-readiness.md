# 2026-03-11 e2e runtime split and readiness signal

## 변경 이유
- 병렬 flake 재현 셋은 준비됐지만, shared `next dev --webpack` 자체의 노이즈와 앱 회귀를 아직 분리해서 보지 못했다.
- `/planning` 헤더의 `실행 기록` 링크는 profile fetch 이후 `href` 가 안정화되므로, 테스트가 DOM 추론 대신 명시적 readiness signal 을 볼 수 있게 할 필요가 있었다.

## 이번 변경
1. `playwright.config.ts` 에 `E2E_WEB_SERVER_MODE=development|production` 분기를 추가했다.
2. `scripts/playwright_with_webserver_debug.mjs` 가 `--runtime`, `--port` 인자를 받아 Playwright env 로 넘기게 했다.
3. `package.json` 에 `e2e:parallel:flake:prod`, `e2e:parallel:report-flake:prod` 를 추가했다.
4. production webServer 는 direct `server.js` 대신 `scripts/next_prod_safe.mjs` 를 사용하도록 맞췄다.
5. `next_prod_safe.mjs` 는 standalone runtime 시작 전에 `.next/static`, `public` 을 `.next/standalone` 아래로 연결해 prod hydration 자산 404를 막는다.
6. `PlanningWorkspaceClient` 의 `실행 기록` 링크에 `data-testid="planning-runs-link"` 와 `data-ready` 신호를 추가했다.
7. `flow-planner-to-history.spec.ts` 는 새 readiness signal 을 먼저 기다린 뒤 링크 이동을 검증하도록 맞췄다.

## 검증
1. `pnpm lint`
2. `pnpm build`
3. `pnpm e2e:rc`
4. `pnpm e2e:parallel:report-flake`
5. `pnpm e2e:parallel:report-flake:prod`
6. `pnpm planning:v2:prod:smoke`

## 검증 결과
- `pnpm lint` PASS
- `pnpm build` PASS
- `pnpm e2e:rc` PASS
- `pnpm e2e:parallel:report-flake` PASS
- `pnpm e2e:parallel:report-flake:prod` PASS
- `pnpm planning:v2:prod:smoke` PASS
- production runtime 경로는 `next_prod_safe + node .next/standalone/server.js` 조합으로 올라오며, `/public/dart` 의 `/_next/static/*` 자산 404 없이 PASS 했다.
- prod smoke 는 `/ops/doctor`, `/public/dart` 의 첫 `/_next/static/*` 자산, `/next.svg` 까지 확인해 standalone asset/public 서빙 계약을 빠르게 검증한다.

## 남은 리스크
- standalone prod 병렬 셋이 안정적이어도, shared `next dev --webpack` 경로의 런타임 flake 가 완전히 사라졌다고 볼 수는 없다.
- readiness signal 은 현재 `실행 기록` 링크에만 추가했으므로, 같은 패턴이 필요한 다른 헤더 액션은 별도 판단이 필요하다.
- dev 병렬 경로는 이번 패스에서 `pnpm e2e:parallel:flake` 도 PASS 했지만, 반복 실행으로 노이즈 분포를 다시 확인할 필요는 있다.

## 다음 라운드 후보
1. `e2e:parallel:flake` 와 `e2e:parallel:flake:prod` 를 반복 실행해 dev-only flake 를 다시 분류
2. `/planning/reports` 비핵심 섹션을 idle/viewport 기반으로 더 세분화할지 판단
3. 필요하면 `PlanningWorkspaceClient` 의 다른 헤더 링크에도 readiness signal 확대

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
