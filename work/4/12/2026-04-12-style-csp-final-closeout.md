# 2026-04-12 style CSP 최종 마감

## 변경 파일
- `middleware.ts`
- `scripts/security_check.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `src/app/globals.css`
- `src/lib/browser/scrollLock.ts`
- `src/lib/browser/clipboard.ts`
- `src/lib/browser/download.ts`
- `src/components/QuickViewModal.tsx`
- `src/components/PlaybookModal.tsx`
- `src/components/HelpDialog.tsx`
- `src/components/RecommendHubClient.tsx`
- `src/components/PlannerWizard.tsx`
- `src/components/Sparkline.tsx`
- `src/components/plannerWizard/surfaces.tsx`
- `src/components/plannerWizard/steps.tsx`
- `src/components/ui/SegmentedTabs.tsx`
- `src/components/ui/SectionHeader.tsx`
- `src/app/planning/reports/_components/CandidateComparisonSection.tsx`
- `src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx`
- `src/lib/planning/reports/standaloneHtmlReport.ts`
- `src/app/planning/reports/_lib/standaloneReportArtifacts.ts`
- `src/app/api/planning/reports/[runId]/export.html/route.ts`
- `src/app/planning/v3/balances/_components/BalancesClient.tsx`
- `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `src/app/planning/v3/news/settings/_components/newsSettings/sections.tsx`
- `tests/middleware-security.test.ts`
- `tests/planning-v2-api/reports-export-html-route.test.ts`
- `tests/browser-scroll-lock.test.ts`

## 사용 skill
- `work-log-closeout`: `/work/4/12/` 보안 마감 기록을 저장소 규칙 형식으로 남기기 위해 사용

## 변경 이유
- production app runtime CSP에서 남아 있던 `style-src-attr 'unsafe-inline'`를 제거하고, 실제 source 코드도 그 정책을 통과하도록 정리할 필요가 있었습니다.
- `/api/planning/reports/[runId]/export.html`의 route-level `style-src 'unsafe-inline'` 예외를 nonce 기반 style 정책으로 바꿔 export HTML 예외를 함께 닫아야 했습니다.
- `framer-motion`, `next/image`, DOM `.style.*` 직접 변경이 남아 있으면 정적 보안 게이트를 안정적으로 강제할 수 없어 재발 방지 스캔과 함께 정리했습니다.

## 핵심 변경
- production CSP를 `style-src 'self'`, `style-src-elem 'self'`, `style-src-attr 'none'`로 고정했고 `middleware-security` 테스트 기대값도 갱신했습니다.
- export HTML route마다 style nonce를 생성해 `standaloneHtmlReport`에 전달하고, route CSP를 `style-src 'self' 'nonce-...'` + `style-src-attr 'none'`로 전환했습니다.
- `standaloneHtmlReport.ts`의 inline `style=` 문자열을 class 기반으로 바꾸고 `<style nonce="...">` 한 블록만 남겼습니다.
- `scrollLock` helper를 추가해 modal/overlay의 `document.body.style.overflow` 직접 변경을 class 토글 기반으로 통합했습니다.
- app runtime source에서 `framer-motion`, `next/image`, `style={{...}}`, `.style.*` 사용을 제거하고 CSS transition/plain `<img>` 기반으로 단순화했습니다.
- `security_check.mjs`에 inline style attr, style mutation, `framer-motion`, `next/image`, standalone report `style=` 금지 게이트를 추가했고 `pnpm audit --json`은 high/critical 0을 유지했습니다.

## 검증
- `pnpm exec eslint middleware.ts scripts/security_check.mjs src/lib/browser/scrollLock.ts src/lib/browser/clipboard.ts src/lib/browser/download.ts src/components/QuickViewModal.tsx src/components/PlaybookModal.tsx src/components/HelpDialog.tsx src/components/RecommendHubClient.tsx src/components/PlannerWizard.tsx src/components/Sparkline.tsx src/components/plannerWizard/surfaces.tsx src/components/plannerWizard/steps.tsx src/components/ui/SegmentedTabs.tsx src/components/ui/SectionHeader.tsx src/app/planning/reports/_components/CandidateComparisonSection.tsx src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx src/lib/planning/reports/standaloneHtmlReport.ts src/app/planning/reports/_lib/standaloneReportArtifacts.ts src/app/api/planning/reports/[runId]/export.html/route.ts src/app/planning/v3/balances/_components/BalancesClient.tsx src/app/planning/v3/batches/_components/BatchesCenterClient.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/settings/_components/newsSettings/sections.tsx tests/middleware-security.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/browser-scroll-lock.test.ts` → 통과
- `pnpm sec:check` → 통과
- `pnpm sec:scan:routes` → 통과
- `pnpm audit --json` → `high 0`, `critical 0`
- `pnpm exec vitest run tests/browser-scroll-lock.test.ts tests/middleware-security.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/planning/reports/reportDashboardOverrides.test.tsx` → 4 files / 18 tests 통과
- `pnpm build` → 통과
- `pnpm planning:v2:e2e:fast -- --grep "/planning/reports shows run-based dashboard by default and keeps embedded markdown manager hidden"` → grep 전달이 적용되지 않아 fast spec 전체가 실행되었고, 기존 planning readiness 이슈 2건으로 실패
- `git diff --check -- middleware.ts scripts/security_check.mjs src/app/globals.css src/lib/browser/scrollLock.ts src/lib/browser/clipboard.ts src/lib/browser/download.ts src/components/QuickViewModal.tsx src/components/PlaybookModal.tsx src/components/HelpDialog.tsx src/components/RecommendHubClient.tsx src/components/PlannerWizard.tsx src/components/Sparkline.tsx src/components/plannerWizard/surfaces.tsx src/components/plannerWizard/steps.tsx src/components/ui/SegmentedTabs.tsx src/components/ui/SectionHeader.tsx src/app/planning/reports/_components/CandidateComparisonSection.tsx src/app/planning/reports/_components/reportDashboard/CoreMetricEvidenceDock.tsx src/lib/planning/reports/standaloneHtmlReport.ts src/app/planning/reports/_lib/standaloneReportArtifacts.ts src/app/api/planning/reports/[runId]/export.html/route.ts src/app/planning/v3/balances/_components/BalancesClient.tsx src/app/planning/v3/batches/_components/BatchesCenterClient.tsx src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx src/app/planning/v3/news/settings/_components/newsSettings/sections.tsx tests/middleware-security.test.ts tests/planning-v2-api/reports-export-html-route.test.ts tests/browser-scroll-lock.test.ts package.json pnpm-lock.yaml` → 통과

## 남은 리스크
- `pnpm planning:v2:e2e:fast`는 이번 보안 변경과 직접 연결되지 않은 기존 readiness 이슈 두 건에서 실패했습니다.
  - `tests/e2e/planning-v2-fast.spec.ts:92` `report-advanced-toggle data-ready=false`
  - `tests/e2e/planning-v2-fast.spec.ts:137` `/planning` profile select hydrate 지연
- `style-src` hardening은 마감됐지만 `style-src 'unsafe-inline'` 전체 제거는 아직 아닙니다. 현재는 React/Tailwind runtime을 위해 `style-src 'self'` / `style-src-elem 'self'`만 유지하고 `style-src-attr`만 차단한 상태입니다.
- 일부 수정 파일(`CoreMetricEvidenceDock.tsx`, `plannerWizard/*`, `newsSettings/sections.tsx`)은 현재 git 기준 untracked 상태로 보였으므로, 후속 라운드에서 worktree 정리 시 추적 정책을 한 번 더 확인할 필요가 있습니다.
