# 2026-05-25 CSP style runtime stage

## 변경 파일
- `middleware.ts`
- `src/lib/dev/localRequest.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/fonts/PretendardVariable.woff2`
- `src/app/recommend/page.tsx`
- `src/app/planning/reports/_components/CandidateComparisonSection.tsx`
- `src/components/ui/CspSafeProgressBar.tsx`
- `src/components/DebugUnifiedClient.tsx`
- `src/components/HelpDialog.tsx`
- `src/components/HousingAffordClient.tsx`
- `src/components/PlanningRunsClient.tsx`
- `src/components/PlaybookModal.tsx`
- `src/components/QuickViewModal.tsx`
- `src/components/SnapshotDeltaCards.tsx`
- `src/components/Sparkline.tsx`
- `src/components/home/HomeHero.tsx`
- `src/components/home/TodayQueue.tsx`
- `src/components/planning/ResultGuideSections.tsx`
- `src/components/ui/ProviderLogo.tsx`
- `src/components/ui/SectionHeader.tsx`
- `src/components/ui/SegmentedTabs.tsx`
- `src/components/ui/StatCard.tsx`
- `src/lib/browser/clipboard.ts`
- `src/lib/browser/download.ts`
- `src/lib/browser/scrollLock.ts`
- `tests/browser-scroll-lock.test.ts`
- `tests/dev-local-request.test.ts`
- `tests/e2e/helpers/e2eTest.ts`
- `tests/e2e/smoke.spec.ts`
- `tests/middleware-security.test.ts`
- `tests/runtime-color-env.test.ts`
- `work/5/25/2026-05-25-csp-style-runtime-stage.md`

## 사용 skill
- `planning-gate-selector`: middleware, root layout, UI primitives, production smoke 변경에 맞춰 diff, lint, unit, build, production e2e 검증을 선택했습니다.
- `route-ssot-check`: dev/debug production-hidden 표면이 production smoke에서 404로 유지되는지 확인하는 기준으로 사용했습니다.
- `work-log-closeout`: 실제 scope, 실행한 검증, 남은 분리 후보를 기록했습니다.

## 변경 이유
- production CSP에서 `unsafe-inline`을 제거하려면 Next script nonce와 inline style 제거가 함께 필요합니다.
- CDN Pretendard stylesheet는 strict style CSP와 충돌할 수 있어 로컬 `next/font/local`로 전환했습니다.
- 여러 progress bar와 tooltip, modal scroll lock이 inline `style`에 의존하고 있어 CSP-safe primitive 또는 SVG 속성으로 바꿀 필요가 있었습니다.
- production에서 `ALLOW_REMOTE=true`가 local-only 보호를 우회하지 않도록 막아야 합니다.

## 핵심 변경
- middleware가 production CSP에 script nonce, `style-src 'self'`, `style-src-attr 'none'`, production connect-src 제한, `upgrade-insecure-requests`를 적용합니다.
- root layout을 dynamic render로 전환하고 로컬 Pretendard font variable을 사용합니다.
- progress bar inline width를 `CspSafeProgressBar` SVG primitive로 대체했습니다.
- Sparkline tooltip을 absolute HTML overlay에서 SVG 내부 tooltip으로 바꿨습니다.
- modal류와 후보 비교 evidence modal이 reference-count scroll lock helper를 공유합니다.
- clipboard/download fallback의 inline DOM style을 CSS class와 `hidden` 속성으로 대체했습니다.
- production smoke가 CSP console violation과 dev/debug 표면 비노출을 검증하도록 확장됐습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node scripts/worktree_scope.mjs middleware.ts src/lib/dev/localRequest.ts src/app/globals.css src/app/layout.tsx src/app/fonts/PretendardVariable.woff2 src/app/recommend/page.tsx src/app/planning/reports/_components/CandidateComparisonSection.tsx src/components/ui/CspSafeProgressBar.tsx src/components/DebugUnifiedClient.tsx src/components/HelpDialog.tsx src/components/HousingAffordClient.tsx src/components/PlanningRunsClient.tsx src/components/PlaybookModal.tsx src/components/QuickViewModal.tsx src/components/SnapshotDeltaCards.tsx src/components/Sparkline.tsx src/components/home/HomeHero.tsx src/components/home/TodayQueue.tsx src/components/planning/ResultGuideSections.tsx src/components/ui/ProviderLogo.tsx src/components/ui/SectionHeader.tsx src/components/ui/SegmentedTabs.tsx src/components/ui/StatCard.tsx src/lib/browser/clipboard.ts src/lib/browser/download.ts src/lib/browser/scrollLock.ts tests/browser-scroll-lock.test.ts tests/dev-local-request.test.ts tests/e2e/helpers/e2eTest.ts tests/e2e/smoke.spec.ts tests/middleware-security.test.ts tests/runtime-color-env.test.ts` 통과: 전체 변경 196, 범위 내 32, 범위 밖 164
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin git diff --check -- middleware.ts src/lib/dev/localRequest.ts src/app/globals.css src/app/layout.tsx src/app/fonts/PretendardVariable.woff2 src/app/recommend/page.tsx src/app/planning/reports/_components/CandidateComparisonSection.tsx src/components/ui/CspSafeProgressBar.tsx src/components/DebugUnifiedClient.tsx src/components/HelpDialog.tsx src/components/HousingAffordClient.tsx src/components/PlanningRunsClient.tsx src/components/PlaybookModal.tsx src/components/QuickViewModal.tsx src/components/SnapshotDeltaCards.tsx src/components/Sparkline.tsx src/components/home/HomeHero.tsx src/components/home/TodayQueue.tsx src/components/planning/ResultGuideSections.tsx src/components/ui/ProviderLogo.tsx src/components/ui/SectionHeader.tsx src/components/ui/SegmentedTabs.tsx src/components/ui/StatCard.tsx src/lib/browser/clipboard.ts src/lib/browser/download.ts src/lib/browser/scrollLock.ts tests/browser-scroll-lock.test.ts tests/dev-local-request.test.ts tests/e2e/helpers/e2eTest.ts tests/e2e/smoke.spec.ts tests/middleware-security.test.ts tests/runtime-color-env.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint middleware.ts src/lib/dev/localRequest.ts src/app/layout.tsx src/app/recommend/page.tsx src/app/planning/reports/_components/CandidateComparisonSection.tsx src/components/ui/CspSafeProgressBar.tsx src/components/DebugUnifiedClient.tsx src/components/HelpDialog.tsx src/components/HousingAffordClient.tsx src/components/PlanningRunsClient.tsx src/components/PlaybookModal.tsx src/components/QuickViewModal.tsx src/components/SnapshotDeltaCards.tsx src/components/Sparkline.tsx src/components/home/HomeHero.tsx src/components/home/TodayQueue.tsx src/components/planning/ResultGuideSections.tsx src/components/ui/ProviderLogo.tsx src/components/ui/SectionHeader.tsx src/components/ui/SegmentedTabs.tsx src/components/ui/StatCard.tsx src/lib/browser/clipboard.ts src/lib/browser/download.ts src/lib/browser/scrollLock.ts tests/browser-scroll-lock.test.ts tests/dev-local-request.test.ts tests/e2e/helpers/e2eTest.ts tests/e2e/smoke.spec.ts tests/middleware-security.test.ts tests/runtime-color-env.test.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/browser-scroll-lock.test.ts tests/dev-local-request.test.ts tests/middleware-security.test.ts tests/runtime-color-env.test.ts` 통과: 4 files, 25 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3201 test tests/e2e/smoke.spec.ts --grep "production (CSP routes hydrate without CSP console violations|hides dev and debug surfaces)" --workers=1 --reporter=line` 통과: 2 tests
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 현재 worktree 기준 재실행 통과: 254 pages 생성. 첫 시도는 tool timeout으로 결과를 받지 못했고, 두 번째 시도에서 통과했습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --cached --check` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm multi-agent:guard` 통과: `latestWorkNote=work/5/25/2026-05-25-csp-style-runtime-stage.md`

## 남은 리스크
- `src/lib/dev/devGuards.ts`와 여러 `/api/dev/*` route hardening 변경은 이번 stage에서 제외했습니다.
- root layout의 `connection()`으로 build route table이 dynamic 중심으로 표시됩니다. nonce CSP를 위한 tradeoff이며 production smoke에서 hydration은 통과했습니다.
- 현재 worktree에는 범위 밖 변경 164개가 남아 있으므로 다음 stage도 pathspec 분리가 필요합니다.

## 다음 라운드
- dev-security runtime 후보에서 `guardDevReadRequest`, `guardDevMutationRequest`, `/api/dev/*` route 적용과 관련 tests를 분리합니다.
- workspace refactor 후보는 별도 focused unit/e2e 근거와 함께 분리합니다.
