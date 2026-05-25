# 2026-05-25 csp style runtime focused gates

## 변경 파일
- `src/components/Sparkline.tsx`
- `work/5/25/2026-05-25-csp-style-runtime-focused-gates.md`

## 검증 대상
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/fonts/PretendardVariable.woff2`
- `src/components/ui/CspSafeProgressBar.tsx`
- `src/components/DebugUnifiedClient.tsx`
- `src/components/HelpDialog.tsx`
- `src/components/HousingAffordClient.tsx`
- `src/components/PlanningRunsClient.tsx`
- `src/components/PlaybookModal.tsx`
- `src/components/QuickViewModal.tsx`
- `src/components/SnapshotDeltaCards.tsx`
- `src/components/Sparkline.tsx`
- `src/components/planning/ResultGuideSections.tsx`
- `src/components/ui/ProviderLogo.tsx`
- `src/components/ui/SectionHeader.tsx`
- `src/components/ui/SegmentedTabs.tsx`
- `src/components/ui/StatCard.tsx`
- `src/lib/browser/clipboard.ts`
- `src/lib/browser/download.ts`
- `src/lib/browser/scrollLock.ts`
- `tests/browser-scroll-lock.test.ts`
- `tests/e2e/smoke.spec.ts`

## 사용 skill
- `planning-gate-selector`: `layout.tsx`, global CSS, UI primitive, smoke e2e 변경에 맞춰 build와 focused e2e를 포함하는 검증 범위를 정하는 데 사용했습니다.
- `work-log-closeout`: 실제 실행한 `csp-style-runtime` 후보 검증과 production standalone residual risk를 `/work`에 기록했습니다.

## 변경 이유
- 현재 `csp-style-runtime` 후보가 이전 기록의 17개보다 넓은 22개 변경으로 확인되어, stage 가능 범위를 최신 상태에서 다시 좁혀야 했습니다.
- 정적 검토 중 `Sparkline`의 tooltip SVG 전환이 차트 좌표계를 `0 -44 ...`로 바꾸면서 차트 영역을 압축할 수 있는 점을 확인했습니다.

## 핵심 변경
- `Sparkline`의 SVG `viewBox`를 원래 `0 0 width height` 좌표계로 되돌려 차트 비율을 유지했습니다.
- tooltip은 SVG `overflow-visible` 경로를 유지해 CSP-safe 목표를 보존했습니다.
- local font, CSP-safe progress bar, scroll lock, clipboard/download fallback, smoke CSP 변경 후보 22개의 focused 검증을 최신화했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- node scripts/worktree_scope.mjs src/app/globals.css src/app/layout.tsx src/app/fonts/PretendardVariable.woff2 src/components/ui/CspSafeProgressBar.tsx src/components/DebugUnifiedClient.tsx src/components/HelpDialog.tsx src/components/HousingAffordClient.tsx src/components/PlanningRunsClient.tsx src/components/PlaybookModal.tsx src/components/QuickViewModal.tsx src/components/SnapshotDeltaCards.tsx src/components/Sparkline.tsx src/components/planning/ResultGuideSections.tsx src/components/ui/ProviderLogo.tsx src/components/ui/SectionHeader.tsx src/components/ui/SegmentedTabs.tsx src/components/ui/StatCard.tsx src/lib/browser/clipboard.ts src/lib/browser/download.ts src/lib/browser/scrollLock.ts tests/browser-scroll-lock.test.ts tests/e2e/smoke.spec.ts` 실행: total 200 / in-scope 22 / out-of-scope 178
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- src/app/globals.css src/app/layout.tsx src/app/fonts/PretendardVariable.woff2 src/components/ui/CspSafeProgressBar.tsx src/components/DebugUnifiedClient.tsx src/components/HelpDialog.tsx src/components/HousingAffordClient.tsx src/components/PlanningRunsClient.tsx src/components/PlaybookModal.tsx src/components/QuickViewModal.tsx src/components/SnapshotDeltaCards.tsx src/components/Sparkline.tsx src/components/planning/ResultGuideSections.tsx src/components/ui/ProviderLogo.tsx src/components/ui/SectionHeader.tsx src/components/ui/SegmentedTabs.tsx src/components/ui/StatCard.tsx src/lib/browser/clipboard.ts src/lib/browser/download.ts src/lib/browser/scrollLock.ts tests/browser-scroll-lock.test.ts tests/e2e/smoke.spec.ts` 통과
- Node trailing whitespace check 실행: 검증 대상 텍스트 파일 21개 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/app/layout.tsx src/components/ui/CspSafeProgressBar.tsx src/components/DebugUnifiedClient.tsx src/components/HelpDialog.tsx src/components/HousingAffordClient.tsx src/components/PlanningRunsClient.tsx src/components/PlaybookModal.tsx src/components/QuickViewModal.tsx src/components/SnapshotDeltaCards.tsx src/components/Sparkline.tsx src/components/planning/ResultGuideSections.tsx src/components/ui/ProviderLogo.tsx src/components/ui/SectionHeader.tsx src/components/ui/SegmentedTabs.tsx src/components/ui/StatCard.tsx src/lib/browser/clipboard.ts src/lib/browser/download.ts src/lib/browser/scrollLock.ts tests/browser-scroll-lock.test.ts tests/e2e/smoke.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/browser-scroll-lock.test.ts` 통과: 1 file / 1 test
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/smoke.spec.ts --grep "production CSP routes hydrate without CSP console violations" --workers=1 --reporter=line` 통과: 1 passed
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3201 test tests/e2e/smoke.spec.ts --grep "production CSP routes hydrate without CSP console violations" --workers=1 --reporter=line` 통과: 1 passed

## 남은 리스크
- production standalone smoke는 테스트 자체는 통과했지만, 서버 로그에 `@prisma/client`의 `better_sqlite3.node` 바인딩 누락으로 `/api/sources/status` 실패가 함께 출력됐습니다. CSP 위반은 아니지만 production runtime 완성도 이슈로 다음 라운드에서 별도 처리해야 합니다.
- `layout.tsx`의 `connection()` 적용으로 build route table은 전체 app route를 dynamic으로 표시했습니다. CSP nonce 의도와 정적 최적화 손실 사이의 tradeoff는 stage 전 재확인이 필요합니다.
- 전체 worktree에는 scope 밖 변경 178개가 남아 있어 `csp-style-runtime` 단독 stage도 다른 보안/runtime 후보와의 의존성을 확인해야 합니다.

## 다음 라운드
- production standalone에서 `better_sqlite3.node`가 `.next/standalone`에 포함되지 않는 원인을 `next.config.ts`, package tracing, Prisma/better-sqlite3 의존성 기준으로 확인합니다.
- `dev-security-runtime` 후보와 `csp-style-runtime` 후보가 공유하는 middleware/config/test 범위를 분리합니다.
