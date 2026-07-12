# 2026-07-12 Issue #244 모바일 navigation 단일 owner·safe-area·현재 위치 semantics

## 변경 파일

- `src/components/SiteHeader.tsx`
- `src/components/ui/MobileBottomNav.tsx`
- `src/components/ui/MobileBottomNav.module.css`
- `src/app/layout.tsx`
- `docs/current-screens.md`
- `tests/mobile-navigation-contract.test.tsx`
- `tests/e2e/smoke.spec.ts`
- `work/7/12/2026-07-12-issue-244-mobile-navigation.md`

## 사용 skill

- `finance-skill-routing`: navigation 구현 라운드에 필요한 최소 skill 조합을 선택했습니다.
- `route-ssot-check`: 실제 page surface, public/ops/dev 분류, current-screens 문서와 href 불변식을 확인했습니다.
- `planning-gate-selector`: focused contract/E2E 뒤 SSOT, lint, typecheck, full test, build, RC E2E를 선택했습니다.
- `playwright`: 320×568, 390×844, 768×1024 viewport의 노출·overlap·touch target·active semantics를 실제 브라우저에서 검증했습니다.
- `work-log-closeout`: 변경, 검증, 계약 영향과 잔여 위험을 이 기록으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/244
- 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- 작업 브랜치: `codex/244-mobile-navigation`
- `<768px`에서 `SiteHeader` horizontal strip과 `MobileBottomNav`가 동시에 노출됐습니다.
- fixed bottom nav의 `pb-safe`는 정의가 없었고 root layout은 실제 nav·safe-area와 무관한 `pb-20`을 예약했습니다.
- #124/PR #127은 Header/BottomNav registry SSOT를 해결했지만 단일 owner, safe-area, overlap, `aria-current`는 다루지 않았습니다.

## 핵심 변경

- primary navigation owner를 `<768px` MobileBottomNav, `768~1023px` header strip, `>=1024px` desktop header로 고정했습니다. public 경로의 `<768px` header는 브랜드만 표시합니다.
- BottomNav 전용 CSS module에서 content 5rem, border 1px, `env(safe-area-inset-bottom, 0px)`를 단일 변수 계약으로 정의하고 fixed nav와 flow spacer가 같은 총높이를 사용합니다.
- root viewport에 `viewportFit: "cover"`를 추가하고 layout의 고정 `pb-20`을 제거했습니다. ops/dev 경로는 nav와 spacer를 함께 렌더링하지 않습니다.
- mobile link는 최소 44×44 CSS px touch target, nav `aria-label`, 활성 link 1개의 `aria-current="page"`를 가집니다. icon과 active dot은 장식 요소로 숨깁니다.
- desktop/tablet public nav에도 label과 current semantics를 추가하되 ops/dev에서는 public current 표시를 억제합니다. route registry, matcher, href와 목적지는 변경하지 않았습니다.
- public API·URL·응답 shape·stored data·DB schema/query·cache/revalidation·migration에는 영향이 없습니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/navigation-route-registry.test.ts tests/mobile-navigation-contract.test.tsx --reporter=dot`: PASS, 2 files / 10 tests
- `corepack pnpm eslint src/components/SiteHeader.tsx src/components/ui/MobileBottomNav.tsx tests/mobile-navigation-contract.test.tsx tests/e2e/smoke.spec.ts`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm typecheck`: PASS
- focused Playwright: PASS, 5 tests
  - 320×568, 390×844에서 visible primary nav 1세트, header strip/action 숨김, 44×44 이상 touch target, main bottom이 fixed nav top 아래로 들어가지 않음
  - 768×1024에서 BottomNav 숨김, tablet strip 표시, 활성 link 1개
  - `/planning`, `/public/dart`, `/settings/backup`의 active destination 확인
  - `/ops`, `/dev/data`, `/dashboard/artifacts`에서 BottomNav·spacer 없음과 public header current 억제 확인
- focused E2E 초기 검증에서 `locator("main")`이 기존 중첩 main(#245) 때문에 모호했고, root layout owner를 `body > main`으로 지정했습니다. 이후 nav border 1px를 spacer 총높이에 포함해 실제 subpixel overlap을 제거하고 재검증했습니다.
- `corepack pnpm planning:ssot:check`: PASS, SSOT guard + 5 files / 9 tests
- `corepack pnpm planning:current-screens:guard`: PASS, 5 files / 9 tests
- `corepack pnpm lint`: PASS
- 최종 `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 pages
- production build 산출물 확인:
  - `.next/static/css/bab05d89455c2c0e.css`에 content/border/safe-area 변수와 `env(safe-area-inset-bottom,0px)` 포함
  - `.next/server/chunks/7011.js`, `.next/server/chunks/5176.js`에서 viewport metadata contract 확인
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 31 passed / 1 production-only skipped
- `corepack pnpm multi-agent:guard`: PASS, 최신 작업 기록 추적 확인
- `git diff --cached --check`: PASS
- 독립 정적 재검토: 초기 누락 2건 해소 후 신규 P0/P1 없음

## 남은 리스크

- WSL Chromium의 safe-area 값은 0px입니다. non-zero iOS home indicator는 실제 기기에서 실측하지 않았고, 대신 `viewport-fit=cover`, 생성 CSS의 `env()`와 동일 높이 flow spacer를 검증했습니다.
- root layout과 page 내부의 중첩 `<main>`은 Issue #245 범위로 남습니다. 이번 overlap test는 layout owner를 명시적으로 선택하며 landmark 구조를 수정하지 않습니다.
- segment 없는 prefix matcher와 unknown fail-open은 Issue #248 범위로 남습니다. 이번 변경은 matcher를 확장하지 않고 ops/dev에서 public `aria-current`만 억제합니다.
- 768px에서 기존 header action과 tablet strip이 함께 보이지만 action은 primary navigation landmark가 아닙니다. 제품이 tablet에서도 action 중복 제거를 원하면 별도 IA 판단이 필요합니다.
- rollback은 breakpoint owner, CSS module의 nav/spacer 총높이, viewport metadata, accessibility semantics와 테스트를 한 단위로 되돌립니다. `<768px`에서 두 primary nav가 다시 동시에 보이는 상태로는 롤백하지 않습니다.

## 다음 라운드 우선순위

1. Issue #245에서 문서당 `<main>` landmark를 정확히 1개로 만들고 skip link를 제공합니다.
2. Issue #248에서 route matcher의 segment 경계와 unknown fail-closed를 별도 계약으로 수정합니다.
3. 실제 iOS Safari/standalone 환경을 사용할 수 있을 때 non-zero safe-area와 home indicator 간격을 기기 smoke로 확인합니다.
