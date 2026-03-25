---
name: planning-gate-selector
description: Choose the smallest correct verification set for Finance Project changes. Trigger when a task changes planning v2 logic, routes, pages, API handlers, UI text, DART/data-source flows, release scripts, or route SSOT/current-screens behavior and you need to decide which pnpm gates to run.
---

# Planning Gate Selector

Use this skill to turn a change summary into a concrete verification set for this repository.

## Inputs

- Changed files or the intended change scope
- Whether the task touches user-visible routes, links, API routes, planning v2 logic, DART/data-source flows, release/ops scripts, multi-agent role/prompt/config files, or Next build/dev/prod wrapper and cleanup scripts

## Required workflow

1. Classify the change into one or more buckets:
   - Pure logic or calculation
   - Types, helpers, schema, static rules
   - React hooks, components, UI text
   - App Router page, layout, link, API route
   - Planning v2 engine, reports, recommend/planning linkage
   - DART, public/open data, freshness, env, fallback
   - Ops, release, docs, scripts
2. Prefer the smallest gate that can actually catch the risk.
3. Add broader gates only when the user path, build output, route SSOT, or planning v2 completion criteria are touched.
4. If a command was not run, leave it in `미실행 검증` or `권장 추가 검증`. Do not imply it passed.
5. If a `/work` closeout will follow, hand the selected verification set and the reason for each gate to that note or to `work-log-closeout`.

## Command selection

- Pure logic or calculation:
  - `pnpm test`
- Types, utilities, schema, lint-rule impact:
  - `pnpm lint`
  - add `pnpm test` if behavior changed
- App Router page, link, navigation, API route:
  - `pnpm build`
- User flow, selectors, route transitions:
  - `pnpm e2e:rc`
  - use `pnpm e2e:rc:dart` for DART-only flow checks
  - use `pnpm e2e:rc:data-sources` for data-source settings only
- Planning v2 core behavior:
  - `pnpm planning:v2:complete`
  - add `pnpm planning:v2:compat` when compatibility, migration, or legacy/run contracts are touched
  - add `pnpm planning:v2:guard` or `pnpm planning:v2:regress` when static/guard baselines or regressions are at risk
- Route SSOT or route catalog impact:
  - `pnpm planning:current-screens:guard`
  - broaden to `pnpm planning:ssot:check` when route SSOT or catalog guards are part of the change
- Release or ops scripts:
  - `pnpm verify`
  - `pnpm build`
- Multi-agent role, prompt, config, or skill files:
  - `pnpm multi-agent:guard`
- Next build/dev/prod launcher or cleanup helper scripts:
  - add `node --check <changed-script>`
  - add a narrow CLI or entrypoint smoke for the changed script
  - prefer repository wrappers such as `pnpm build`, `pnpm start`, `pnpm cleanup:next-artifacts` over raw `next build/start` unless the wrapper itself is under diagnosis

## Finance Project recurring sets

- Planning v3 batch detail or summary helper changes:
  - `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-getBatchSummary.test.ts`
  - `pnpm build`
- Planning v3 categorized or cashflow route changes:
  - `pnpm test tests/planning-v3-categorized-api.test.ts tests/planning-v3-batch-cashflow-account-guard-api.test.ts`
  - add `tests/planning-v3-txnOverridesStore.test.ts` when override helpers or compat aliases change
  - `pnpm build`
- Planning v3 balances or draft profile consumer alignment:
  - `pnpm test tests/planning-v3-balances-api.test.ts tests/planning-v3-draft-profile-api.test.ts tests/planning-v3-generateDraftPatchFromBatch.test.ts`
  - `pnpm build`
- Planning v3 batch list, batch center, or list consumer changes:
  - `pnpm test tests/planning-v3-batches-api.test.ts tests/planning-v3-batch-center-api.test.ts`
  - add `pnpm lint` when TSX client or page code changed
  - `pnpm build`
- Docs-only planning or release-governance rounds:
  - `git diff --check -- <changed files>`
- Skill, prompt, or multi-agent config files:
  - `pnpm multi-agent:guard`
  - `git diff --check -- <changed files>`

## Decision rules

- A changed `href`, page path, redirect target, or route guard is not "text only". Treat it as route/build impact.
- A user-visible disclaimer or result explanation can be UI-only, but if it refers to computed values or data freshness, also inspect the related logic/tests.
- DART or public-data work must consider:
  - env missing
  - upstream failure
  - partial response
  - freshness or 기준 시점 mismatch
- If the change touches `docs/current-screens.md` expectations, do not stop at `pnpm test` alone.
- If build can fail because of route contracts or page imports, include `pnpm build` even when unit tests exist.
- If the change touches shared Next runtime hygiene (`.next/lock`, `.next-e2e*`, `.next-host*`, standalone shadow artifacts), include wrapper/helper validation and do not rely on raw `next build/start` alone.
- If the round is docs-only or audit-only, prefer `git diff --check -- <changed files>` and do not add broader gates unless executable scripts or runtime files changed.
- If a planning v3 batch-family round changes helper contracts and one or more user-facing routes, start from the recurring sets above instead of hand-assembling a new ad hoc matrix.

## Output format

- 변경 분류
- 실행할 검증
- 각 검증을 선택한 이유
- 미실행 검증
- 남은 리스크

## Notes

- This skill selects gates; it does not replace local reasoning about impact.
- Prefer repository commands that already exist in `package.json`. Do not invent new gates.
- When used together with `work-log-closeout`, keep the chosen gates and their reasons consistent between planning and the final `/work` note.
