# 2026-07-12 Issue #245 단일 main landmark와 skip link

## 변경 파일

- `src/app/layout.tsx`
- `src/components/ui/PageShell.tsx`
- `src/app/page.tsx`
- `src/app/products/compare/page.tsx`
- `src/app/recommend/page.tsx`
- `src/components/DartCompanyClient.tsx`
- `src/components/DashboardArtifactsClient.tsx`
- `src/components/DebugUnifiedClient.tsx`
- `src/components/DevDataDashboardClient.tsx`
- `src/components/DevGitAdminClient.tsx`
- `src/components/FinlifeSchemaReportClient.tsx`
- `src/components/PublicApisDiagnosticsClient.tsx`
- `src/components/RecommendHistoryClient.tsx`
- `src/components/RecommendHubClient.tsx`
- `tests/main-landmark-contract.test.tsx`
- `tests/e2e/smoke.spec.ts`
- `tests/e2e/flow-planner-to-history.spec.ts`
- `docs/current-screens.md`
- `work/7/12/2026-07-12-issue-245-main-landmark.md`

## 사용 skill

- `finance-skill-routing`: landmark 구현 라운드에 필요한 최소 skill 조합을 선택했습니다.
- `planning-gate-selector`: focused architecture/E2E 뒤 SSOT, lint, typecheck, full test, build, RC E2E를 선택했습니다.
- `route-ssot-check`: skip fragment가 route destination을 변경하지 않으며 public/ops/dev inventory가 유지되는지 확인했습니다.
- `playwright`: 실제 keyboard 첫 Tab, skip-link 노출, fragment 이동, main focus와 다음 main 내부 focus를 검증했습니다.
- `work-log-closeout`: 변경, stacked 의존성, 검증과 잔여 위험을 이 기록으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/245
- 재확인 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- stacked base: `codex/244-mobile-navigation` / PR #261 / `ebcaca1e7d5de07554c00a121d996037dac155b5`
- 작업 브랜치: `codex/245-main-landmark`
- RootLayout과 PageShell, 일부 page/client component가 각각 `<main>`을 만들어 screen reader landmark가 중첩됐습니다.
- `tests/e2e/flow-planner-to-history.spec.ts`는 `locator("main").last()`로 중첩을 우회해 구조 문제를 숨겼습니다.
- #244가 같은 layout과 smoke E2E를 변경하므로 해당 viewport/mobile 계약을 보존하고 리뷰 가능한 diff를 만들기 위해 PR #261 위에 쌓았습니다.

## 핵심 변경

- runtime document의 유일한 landmark owner를 root `src/app/layout.tsx`로 고정했습니다.
- body의 첫 focusable element로 `본문으로 건너뛰기` link를 추가하고 `href="#main-content"`, sticky header보다 높은 focus z-index를 적용했습니다.
- root main은 `id="main-content"`, `tabIndex={-1}`을 가져 native fragment 이동 후 keyboard focus를 받습니다.
- PageShell과 자체 runtime main 12곳은 기존 class와 자식 구조를 유지한 neutral `<div>`로 바꿨습니다.
- `src/lib/planning/v2/report/htmlReport.ts`는 별도 standalone HTML 문서이므로 자체 `<main class="page">`를 유지합니다.
- architecture test는 RootLayout 외 `src/app`·`src/components` TSX/JSX의 `<main>` 금지, PageShell neutral markup, standalone 예외, `.last()` 우회 금지를 고정합니다.
- public API·URL·route destination·응답 shape·stored data·DB schema/query·cache/revalidation·migration에는 영향이 없습니다. DOM landmark 계약만 변경됩니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/main-landmark-contract.test.tsx --reporter=dot`: PASS, 1 file / 5 tests
- 변경 TSX/test targeted ESLint: PASS
- focused Playwright: PASS, 3 tests
  - `/`, `/planning`, `/products/compare`, `/recommend/history`, `/settings`, `/ops`, `/dev/data`에서 main count와 `#main-content`가 각각 1개
  - 첫 Tab에서 skip link 표시·focus, Enter 후 `#main-content` hash와 main focus, 다음 Tab이 main 내부 focusable element로 이동
  - Planning workspace→runs 흐름을 singular `getByRole("main")` selector로 검증
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm typecheck`: PASS
- `corepack pnpm planning:ssot:check`: PASS, SSOT guard + 5 files / 9 tests
- `corepack pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 pages
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 33 passed / 1 production-only skipped
- `corepack pnpm multi-agent:guard`: PASS, 최신 작업 기록 추적 확인
- `git diff --cached --check`: PASS
- 독립 정적 재검토: 신규 P0/P1, 수용 기준 누락, CSS/DOM 회귀, 과장된 주장 없음

## 남은 리스크

- 이 PR은 #244 PR #261 위의 stacked diff입니다. #261이 수정되거나 병합되면 최신 head에 재기반하고 동일 gate를 다시 실행해야 합니다.
- native fragment focus는 WSL Chromium에서 검증했습니다. Firefox, Safari, iOS VoiceOver의 focus announcement는 실기기에서 별도 확인하지 않았습니다.
- architecture scan은 runtime JSX source인 `src/app`·`src/components`의 TSX/JSX를 대상으로 합니다. standalone export HTML은 명시적 예외이며 자체 main을 유지합니다.
- `<main>` CSS selector 의존성은 현재 source에서 확인되지 않았고 기존 class를 모두 유지했습니다. 외부 자동화가 raw tag selector에 의존한다면 DOM 변경 영향을 받을 수 있습니다.
- rollback은 RootLayout owner, skip link/target, neutral wrapper, architecture/E2E test를 한 단위로 되돌립니다. nested main 또는 `.last()` 우회 상태로는 롤백하지 않습니다.

## 다음 라운드 우선순위

1. Issue #246에서 HomeHero carousel pause, reduced-motion, carousel semantics를 구현합니다.
2. PR #261 merge 후 이 stacked PR을 main으로 retarget하고 full gate를 재실행합니다.
3. 실제 Safari/VoiceOver 환경을 사용할 수 있을 때 skip-link announcement와 focus 이동을 기기 smoke로 확인합니다.
