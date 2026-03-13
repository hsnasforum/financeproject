---
name: route-ssot-check
description: Check route and link changes against Finance Project route SSOT. Trigger when a task adds or changes pages, redirects, hrefs, navigation, current-screens documentation, production-hidden routes, or route guard behavior.
---

# Route SSOT Check

Use this skill when the task may change what route exists, where a link points, or what should be documented as a public path.

## Scope

- `src/app/**/page.tsx`
- redirects, navigation, `href`, route guards, deep links
- `docs/current-screens.md`
- production-hidden dev/debug paths

## Required workflow

1. Find the actual route surface first.
   - Use `rg --files src/app -g 'page.tsx'`
   - Inspect changed `href`, redirects, and route helpers
2. Compare the intended route to `docs/current-screens.md`.
3. Decide whether the route is:
   - public user path
   - support/ops path
   - dev/debug only path
4. Confirm production-hidden paths are still hidden:
   - `/api/dev/*`
   - `/dashboard/artifacts`
   - `/dev/*`
   - `/debug/unified`
5. If the route contract changed, run the matching guard command before closing.

## Checks

- Does every changed `href` point to a route that actually exists?
- Was an old route removed or redirected without updating docs?
- Was a dev/debug path accidentally exposed as a public path?
- If a route is documented as public, is there a real page or supported entry point?
- If the change affects reports/planning catalog routes, do current-screens tests still match?

## Commands

- Narrow route catalog check:
  - `pnpm planning:current-screens:guard`
- Broader SSOT check:
  - `pnpm planning:ssot:check`
- Build-backed confirmation for route/page changes:
  - `pnpm build`
- User-flow confirmation when navigation changed:
  - `pnpm e2e:rc`

## When to update docs

Update `docs/current-screens.md` when any of these are true:

- a public route is added
- a public route is removed or redirected
- a support/ops route changes classification
- entry order or canonical route naming changes

Do not add dev/debug-only paths to public route lists.

## Output format

- 실제 경로
- 문서 기준과의 차이
- 필요한 수정
- 실행한 가드/검증
- 남은 리스크
