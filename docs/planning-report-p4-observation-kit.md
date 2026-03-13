# Planning Report P4 Observation Kit

Last updated: 2026-03-06

## Purpose
- Freeze the official planning calculation SSOT on `planning/core/v2`.
- Converge report delivery onto the single flow `run -> resultDto -> contract -> VM`.
- Keep legacy planner/report out of new entry paths.
- Provide one place for weekly reporting, P4 observation, strict-first transition, and fallback monitoring.

## Weekly Conclusion

### Full version
This week's goals were to lock `planning/core/v2` as the official calculation SSOT, converge `report` onto the single flow `run -> resultDto -> contract -> VM`, and block new entry into legacy planner/report paths. That scope can now be judged complete across code, documentation, and verification.

What remains is not implementation work left undone. The remaining items are:
- `strict fallback` shutdown, which can only be switched safely after the P4 observation gate.
- `/recommend` integration, which requires either an input contract expansion or a `runId` reference model before it can be connected without introducing inferred results.

### Leadership short paragraph
This week focused on fixing system boundaries rather than adding new features: `planning/core/v2` was locked as the official calculation SSOT, `report` was converged onto the single flow `run -> resultDto -> contract -> VM`, and new entry into legacy planner/report paths was blocked. That scope is complete across code, documentation, and verification. The remaining work is conditional rather than incomplete: `strict fallback` can only be retired safely after the P4 observation window, and `/recommend` should not be connected until either the input contract is expanded or a `runId`-based SSOT reference model is introduced.

## Done Scope
- `report` unified across route, contract, VM, and UI.
- Engine entry points unified.
- `runs artifacts` separated and compat isolated.
- `summary/evidence` unified.
- Legacy `/report` and official planning report boundaries made explicit in code, UI, and docs.
- Tests and typecheck passed.

## Remaining Items

### Strict report contract transition
- This is not missing implementation.
- It is a risk-managed transition that should happen only after `docs/runbook.md` P4 observation confirms safety.
- Turning fallback off immediately is higher risk than waiting for observation evidence.

### `/recommend` engine adapter
- `UserRecommendProfile` does not currently provide enough input to reproduce planning stage decisions.
- Wiring it now would create inferred or guessed linkage.
- The correct next move is a contract change or a `runId`-based reference model, not a forced adapter.

## Pre-transition Checks
- Confirm there is no direct `buildReportVM()` usage left in the official report path.
- Confirm every report contract fallback leaves an observable trace: source, count, and log.
- Confirm CI or guard rules block direct `core/v2` bypasses, not only `planner/*`.
- Confirm legacy `/report` cannot be mistaken for the official planning report in UI copy, links, or service entry points.
- Confirm `runs artifacts/resultDto` regeneration exists only as migration or fallback, not as the default path.

## Next-week Plan
1. Run P4 observation: staging for 3 days, production for 7 days.
2. Record fallback count and source, rendering stability, and export (`html` / `pdf`) smoke results.
3. If stable, open a strict-first transition PR.
4. Split fallback removal into a separate follow-up PR.
5. Prioritize `/recommend` `runId`-based SSOT reference over broad input contract expansion.

## Recommended Direction for `/recommend`
- Preferred option: `RecommendRequest { runId?: string, profile?: UserRecommendProfile }`
- If `runId` exists, reuse planning SSOT from `run/resultDto`.
- If `runId` does not exist, keep current recommend-only behavior and document that it does not guarantee the same planning result.

Reason:
- Smaller contract change.
- Best alignment with "same inputs, same result".
- Avoids implicit reconstruction of planning stage input from incomplete data.

## PRD / Runbook Wording

### PRD status update
Status: SSOT fixed, report unified, and legacy new-entry blocked across code, docs, and verification.

In Scope Done:
- `report`: route / contract / VM / UI aligned to `run -> resultDto -> contract -> VM`
- Engine entry point unification, `runs artifacts` separation, compat isolation
- `summary/evidence` unification
- Legacy `/report` vs official planning report boundary made explicit
- Typecheck and tests passed

Not Done Yet (Conditional):
- `strict report contract` transition: after P4 observation
- `/recommend` integration: requires input contract expansion or `runId` reference model first

### Runbook transition note
Observation Gate (P4):
- staging 3 days
- production 7 days
- observe fallback counts and source, rendering stability, and export smoke

Transition Plan:
- If observation passes, switch to strict-first
- Remove fallback later in a separate PR

Notes:
- Do not end fallback before observation evidence exists

## P4 Observation Log Templates

### Notion paste block
```text
P4 Observation Overview

Observation targets: report contract fallback / report rendering stability / export(html/pdf) / key planning screens

Observation window:
- staging: 3 days
- production: 7 days

Observation start:
- staging: YYYY-MM-DD HH:mm KST
- production: YYYY-MM-DD HH:mm KST

Observation expected end:
- staging: YYYY-MM-DD HH:mm KST
- production: YYYY-MM-DD HH:mm KST

Reference: docs/runbook.md P4
```

### Notion daily table
```text
date_kst	env	release_tag_or_commit	window_kst	fallback_total	fallback_source_top	issues_5xx	render_hub	render_detail	export_html	export_pdf	ops_metrics	links_or_run_id	decision	next_action
YYYY-MM-DD	staging	commit-or-tag	HH:mm~HH:mm	0	-	none	OK	OK	OK	OK	OK	-	OK	-
```

### Daily smoke checklist
- Planning key screen flow 1 OK
- Planning key screen flow 2 OK
- Planning reports list OK
- Planning report detail OK
- Export HTML OK
- Export PDF OK
- `/ops/metrics` fallback and error counters checked

### Go / No-Go
Go:
- No meaningful fallback on new runs
- Any fallback is limited to clearly legacy data or legacy run access
- Report hub, detail, HTML export, and PDF export remain stable
- No repeating 5xx or contract build failure during the observation window

No-Go:
- Fallback repeats on newly created runs
- Contract-based report VM shows missing or broken rendering
- Export failures repeat without a clear cause
- Boundary violations appear between legacy and official report paths

## Slack Daily Template
```text
[P4 Observation Day N / env: staging|production]

release: ...
window: HH:mm ~ HH:mm KST
fallback: total X (top source: A n, B n, C n)
report rendering: hub OK/Fail, detail OK/Fail (runId: ...)
export: html OK/Fail, pdf OK/Fail
/ops/metrics: OK / anomaly (note: ...)
issues: none or links / tickets / runId
decision: OK / Watch / Block
next action: ...
```

## CSV / Spreadsheet Header
```text
date_kst,env,release_tag,commit,window_start_kst,window_end_kst,fallback_total,fallback_source_top1,fallback_source_top1_count,fallback_source_top2,fallback_source_top2_count,fallback_source_top3,fallback_source_top3_count,errors_5xx_count,contract_build_errors_count,report_hub_ok,report_detail_ok,export_html_ok,export_pdf_ok,ops_metrics_ok,notes,links,decision,next_action
```

## Fallback Source Classification

Purpose:
- Keep naming stable across Notion, Slack, CSV, PRs, and `/ops/metrics`.

Usage:
- Always record `source_key` exactly as defined below.
- Add human explanation only in the note field.
- Do not use shorthand such as `legacy dto`, `old result dto`, or `compat`.

### Standard keys
`source_key: legacyEngineFallback`
- Meaning: a legacy planner/report computation result or legacy engine output was used as a substitute.
- Log location: metrics / log / fallback event
- Allowed: during observation only, remove after strict transition
- Note: repeated use on new runs is a No-Go candidate

`source_key: legacyResultDtoFallback`
- Meaning: a legacy `resultDto` path was used instead of the official run artifact or contract input path.
- Log location: metrics / log / fallback event
- Allowed: limited allowance during observation only
- Note: must distinguish legacy-only occurrence from new-run occurrence

`source_key: compatRebuild`
- Meaning: compat regeneration was used because stored artifacts could not be consumed directly.
- Log location: metrics / log / fallback event
- Allowed: migration or fallback path only
- Note: default-path occurrence is at least Watch; repeated use requires schema, storage, or missing-data investigation

`source_key: legacySnapshot`
- Meaning: an old snapshot or localStorage-backed dataset was used to reconstruct the output.
- Log location: metrics / log / fallback event
- Allowed: only on legacy `/report`
- Note: if seen on official planning report paths, treat as boundary breach

`source_key: contractBuildFailureFallback`
- Meaning: contract build failed and the system moved to a substitute path.
- Log location: error log / metrics
- Allowed: abnormal by default
- Note: repeated occurrences are Block candidates; no strict expansion before root cause resolution

## Fallback Summary Mini Table
```text
source_key	count	new_run_seen	scope	note
legacyEngineFallback	0	No	legacy-only	New-run occurrence is a No-Go signal candidate
legacyResultDtoFallback	0	No	legacy-data-only	New-run occurrence must be separated
compatRebuild	0	No	migration/fallback-only	Default-path occurrence is Watch+
legacySnapshot	0	No	legacy-report-only	Official planning report occurrence is a boundary breach
contractBuildFailureFallback	0	No	abnormal	Repeated occurrence is Block candidate
```

## Strict-first PR Template

### Suggested title
```text
planning reports: switch to strict-first report contract (fallback remains gated/observable)
```

### PR body
```text
This PR moves the report path to strict-first mode.

The default report flow is:
run -> resultDto -> ReportInputContract -> ReportVM

Legacy fallback is not removed immediately. It remains available only as an observable exception path.

This is not a feature PR. It is a default transition based on P4 observation evidence.

Observation basis:
- docs/runbook.md P4
- staging: YYYY-MM-DD ~ YYYY-MM-DD
- production: YYYY-MM-DD ~ YYYY-MM-DD

Fallback summary:
- legacyEngineFallback: N (new runs: yes/no)
- legacyResultDtoFallback: N (legacy-only: yes/no)
- compatRebuild: N (default path seen: yes/no)
- legacySnapshot: N (official planning route seen: yes/no)
- contractBuildFailureFallback: N

Report stability:
- reports hub: OK/Fail
- report detail: OK/Fail
- export html: OK/Fail
- export pdf: OK/Fail

Conclusion:
- strict-first transition: proceed / hold
- reason: 1-2 lines

Scope in this PR:
- switch the report contract default to strict-first
- keep fallback as fallback-only and observable with `source_key`
- preserve the boundary between legacy `/report` and official planning report

Out of scope:
- full fallback removal
- `/recommend` engine adapter
- legacy planner/report deletion

Verification:
- `pnpm typecheck:planning`
- `tests/planning-v2/reportInputContract.test.ts`
- `tests/planning-v2/reportViewModel.test.ts`
- `tests/planning-v2-api/runs-report-route.test.ts`
- `tests/planning-v2-api/runs-report-pdf-route.test.ts`
- `tests/planning-v2-api/reports-export-html-route.test.ts`

Smoke:
- planning reports hub / detail
- export html / pdf

Rollback:
- if strict-first causes issues, use the fallback-only path to mitigate immediately
- if `contractBuildFailureFallback` occurs, do not widen strict rollout before root cause is fixed
```

## `/ops/metrics` Naming Rules

### Metric
```text
planning_report_fallback_total
```

### Required labels
- `source_key`
- `env`
- `route_kind`
- `report_kind`
- `run_kind`

### Optional labels
- `strict_mode`
- `export_kind`
- `legacy_boundary`

### Recommended values
`source_key`
- `legacyEngineFallback`
- `legacyResultDtoFallback`
- `compatRebuild`
- `legacySnapshot`
- `contractBuildFailureFallback`

`env`
- `staging`
- `production`
- `local`

`route_kind`
- `reportsHub`
- `reportDetail`
- `exportHtml`
- `exportPdf`
- `legacyReport`

`report_kind`
- `planningOfficial`
- `legacy`

`run_kind`
- `newRun`
- `legacyRun`
- `unknown`

`strict_mode`
- `strictFirst`
- `fallbackOnly`
- `legacy`

`export_kind`
- `none`
- `html`
- `pdf`

`legacy_boundary`
- `inBoundary`
- `boundaryViolation`

### Example
```text
planning_report_fallback_total{
  source_key="compatRebuild",
  env="production",
  route_kind="reportDetail",
  report_kind="planningOfficial",
  run_kind="legacyRun",
  strict_mode="strictFirst",
  export_kind="none",
  legacy_boundary="inBoundary"
} 3
```

### Operating rules
- Always use the standard `source_key`.
- `legacySnapshot` with `report_kind="planningOfficial"` indicates likely boundary breach.
- `contractBuildFailureFallback` should always be linked to logs and investigated.
- `compatRebuild` on `run_kind="newRun"` is Watch or higher.
- Repeated `legacyEngineFallback` or `legacyResultDtoFallback` on new runs is a No-Go candidate.
- If `runKind="opsDoctor"`, treat the event as operational probe traffic first, not user traffic.

## Legacy Backfill Readiness
- Track remaining legacy candidates separately from live fallback counts.
- Recommended summary:
  - `totalRuns`
  - `opsDoctorRuns`
  - `userRuns`
  - `legacyCandidates`
  - `opsDoctorLegacyCandidates`
  - `userLegacyCandidates`
  - `resultDtoOnlyCandidates`
  - `missingResultDtoCandidates`
  - `missingEngineSchemaCandidates`
  - `unreadableCandidates`
- Interpretation:
  - `opsDoctorRuns` explain probe noise in lazy migration events.
  - `resultDtoOnlyCandidates` are the primary rebuild/backfill target.
  - `missingResultDtoCandidates` need separate investigation before strict expansion.

### Backfill CLI
- Dry-run:
  - `pnpm planning:v2:backfill-legacy-runs`
- Include ops-doctor runs in dry-run:
  - `pnpm planning:v2:backfill-legacy-runs -- --include-ops-doctor`
- Apply:
  - `pnpm planning:v2:backfill-legacy-runs -- --apply --confirm="BACKFILL LEGACY RUNS"`
- Apply including ops-doctor runs:
  - `pnpm planning:v2:backfill-legacy-runs -- --apply --include-ops-doctor --confirm="BACKFILL LEGACY RUNS"`

## Grafana / Prometheus Queries

### Total fallback by source over 24h
```promql
sum by (source_key) (
  increase(planning_report_fallback_total[24h])
)
```

### Production official report paths only
```promql
sum by (source_key, route_kind) (
  increase(planning_report_fallback_total{env="production",report_kind="planningOfficial"}[24h])
)
```

### New-run fallback only
```promql
sum by (source_key) (
  increase(planning_report_fallback_total{run_kind="newRun"}[24h])
)
```

### Boundary violation detection
```promql
sum by (source_key, report_kind, legacy_boundary) (
  increase(planning_report_fallback_total{legacy_boundary="boundaryViolation"}[24h])
)
```

### Contract build failure detection
```promql
sum(
  increase(planning_report_fallback_total{source_key="contractBuildFailureFallback"}[1h])
)
```

### `compatRebuild` on new runs
```promql
sum by (env, route_kind) (
  increase(planning_report_fallback_total{source_key="compatRebuild",run_kind="newRun"}[24h])
)
```

## Datadog Query Examples

### Source counts
```text
sum:planning_report_fallback_total{*}.as_count()
```

### Production official report grouped by source and route
```text
sum:planning_report_fallback_total{env:production,report_kind:planningOfficial} by {source_key,route_kind}.as_count()
```

### New-run fallback only
```text
sum:planning_report_fallback_total{run_kind:newRun} by {source_key}.as_count()
```

### Contract build failure
```text
sum:planning_report_fallback_total{source_key:contractBuildFailureFallback,env:production}.as_count()
```

### Boundary violation
```text
sum:planning_report_fallback_total{legacy_boundary:boundaryViolation}.as_count()
```

### `compatRebuild` on new runs
```text
sum:planning_report_fallback_total{source_key:compatRebuild,run_kind:newRun} by {env,route_kind}.as_count()
```

## Dashboard Panels
1. Fallback Total by Source (24h)
2. New Run Fallbacks
3. Boundary Violation
4. Contract Build Failure
5. Fallback by Route
6. Export Stability

### Panel details
`Fallback Total by Source (24h)`
- Query:
```promql
sum by (source_key) (
  increase(planning_report_fallback_total[24h])
)
```
- Display: bar chart
- Alert: `contractBuildFailureFallback > 0`

`New Run Fallbacks`
- Query:
```promql
sum by (source_key) (
  increase(planning_report_fallback_total{run_kind="newRun"}[24h])
)
```
- Display: stacked bar
- Alert:
  - `legacyEngineFallback > 0`
  - `legacyResultDtoFallback > 0`
  - `compatRebuild > 0`

`Boundary Violation`
- Query:
```promql
sum by (source_key, report_kind, legacy_boundary) (
  increase(planning_report_fallback_total{legacy_boundary="boundaryViolation"}[24h])
)
```
- Display: table
- Alert: any value `> 0`

`Contract Build Failure`
- Query:
```promql
sum(
  increase(planning_report_fallback_total{source_key="contractBuildFailureFallback"}[1h])
)
```
- Display: stat
- Alert:
  - staging: `> 0` warning
  - production: `> 0` page

`Fallback by Route`
- Query:
```promql
sum by (route_kind, source_key) (
  increase(planning_report_fallback_total[24h])
)
```
- Display: heatmap or table

`Export Stability`
- Query:
```promql
sum by (route_kind, source_key) (
  increase(planning_report_fallback_total{route_kind=~"exportHtml|exportPdf"}[24h])
)
```
- Alert:
  - rising production trend: Watch
  - with `contractBuildFailureFallback`: Block candidate

## P4 Alert Set
1. `contractBuildFailureFallback` in production over 1 hour is greater than 0.
2. `legacySnapshot` with `report_kind="planningOfficial"` over 24 hours is greater than 0.
3. `compatRebuild` with `run_kind="newRun"` over 24 hours is greater than 0.
4. `legacyEngineFallback` or `legacyResultDtoFallback` repeats on `newRun`.

### Alert message template
```text
[Planning Report Fallback Alert]
env={{env}}
source_key={{source_key}}
route_kind={{route_kind}}
report_kind={{report_kind}}
run_kind={{run_kind}}
count={{value}}

Action:
- confirm whether this is a new run
- confirm whether `legacy_boundary=boundaryViolation`
- attach runId, log, and release link
- evaluate strict transition impact
```
