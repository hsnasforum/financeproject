import { createHash } from "node:crypto";
import path from "node:path";
import { resolvePlanningRuntimeRoots } from "./runtimeRoots.mjs";

export const PLANNING_WRITER_REGISTRY_VERSION = 1;

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze({
  ...row,
  ...(row.targets ? { targets: Object.freeze([...row.targets]) } : {}),
  ...(row.mutationSignals ? { mutationSignals: Object.freeze([...row.mutationSignals]) } : {}),
  ...(row.sources ? { sources: Object.freeze([...row.sources]) } : {}),
  ...(row.childEntrypoints ? { childEntrypoints: Object.freeze([...row.childEntrypoints]) } : {}),
  ...(row.childCommandPaths ? { childCommandPaths: Object.freeze([...row.childCommandPaths]) } : {}),
  ...(row.childCommandExclusions ? { childCommandExclusions: Object.freeze(row.childCommandExclusions.map((item) => Object.freeze({ ...item }))) } : {}),
})));

const target = (id, targetClass, rootKind, logicalPath, namespace, backupPolicy, restorePolicy, authoritative, description, pathKind = "directory") => ({
  id,
  class: targetClass,
  rootKind,
  logicalPath,
  pathKind: rootKind === "external-selected" ? "external-selected" : pathKind,
  namespace,
  backupPolicy,
  restorePolicy,
  authoritative,
  description,
});

const NON_ARCHIVE_TARGETS = [
  target("control.assumptions", "user-runtime-control", "planning-root", "assumptions", "user", "excluded-control", "operator-only", true, "Assumption overrides and history outside manifest v1."),
  target("control.assumptions-latest", "user-runtime-control", "planning-root", "assumptions.latest.json", "user", "excluded-control", "operator-only", true, "Current assumption state outside manifest v1.", "file"),
  target("control.migrations", "user-runtime-control", "planning-root", "migrations", "user", "excluded-control", "operator-only", true, "Migration state and snapshots."),
  target("control.security", "user-runtime-control", "planning-root", "security", "user", "excluded-control", "disabled", true, "Vault state and security control records."),
  target("control.storage-journal", "user-runtime-control", "planning-root", "storage", "user", "excluded-control", "operator-only", true, "Storage consistency journal."),
  target("control.trash", "user-runtime-control", "planning-root", "trash", "user", "excluded-control", "operator-only", true, "Deletion and recovery metadata."),
  target("control.local-auth", "user-runtime-control", "planning-root", "users/index.json", "user", "excluded-control", "disabled", true, "Local authentication index.", "file"),
  target("control.ops", "runtime-shared-control", "planning-root", "ops", "runtime-shared", "excluded-control", "operator-only", true, "Audit, action, metrics, scheduler, backup receipt, and operational state."),
  target("control.writer-ownership", "runtime-shared-control", "control-root", "writer", "runtime-shared", "excluded-control", "disabled", true, "Reserved data-root writer control boundary for later lease work."),
  target("control.start-local-instance", "runtime-shared-control", "planning-root", "runtime.lock", "runtime-shared", "excluded-control", "disabled", true, "Existing start:local instance evidence; it is not writer exclusivity evidence.", "file"),
  target("control.desktop-instance", "runtime-shared-control", "control-root", "desktop-instance.lock.json", "runtime-shared", "excluded-control", "disabled", true, "Existing desktop instance evidence; it is not writer exclusivity evidence.", "file"),
  target("derived.planning-cache", "derived-cache", "planning-root", "cache", "user", "excluded-derived", "rebuild", false, "Rebuildable Planning cache and indexes."),
  target("output.share", "output-artifact", "planning-root", "share", "user", "separate-output", "not-applicable", false, "Generated share artifacts."),
  target("output.release", "output-artifact", "planning-root", "release", "runtime-shared", "separate-output", "not-applicable", false, "Release logs, evidence, and completion records."),
  target("output.regression", "output-artifact", "planning-root", "eval", "runtime-shared", "separate-output", "not-applicable", false, "Regression reports and baselines produced by commands."),
  target("output.openapi", "output-artifact", "planning-root", "openapi", "runtime-shared", "separate-output", "not-applicable", false, "Generated Planning API contract artifacts."),
  target("output.external", "external-output", "external-selected", "selected-output", "external", "separate-output", "not-applicable", false, "Operator-selected archive, support bundle, or report output."),
  target("disabled.restore-apply", "disabled", "registered-owner-target", "restore-apply", "none", "disabled", "disabled", true, "Production restore apply remains fail-closed."),
  target("fixture.planning", "fixture", "temp-root", "planning-fixture", "none", "not-applicable", "not-applicable", false, "Isolated test or regression fixture."),
  target("outside.feedback", "out-of-scope", "runtime-root", "ops/feedback", "none", "not-applicable", "not-applicable", true, "Feedback store is outside the Planning root contract."),
  target("outside.upload-temp", "out-of-scope", "temp-root", "upload", "none", "not-applicable", "not-applicable", false, "Ephemeral upload staging under the OS temp root."),
  target("outside.prisma-db", "out-of-scope", "external-selected", "prisma-database", "external", "not-applicable", "not-applicable", true, "Prisma SQLite is governed by the database migration contract, not the Planning data-root writer lease."),
];

export function createPlanningWriterTargetRegistry(archiveOwnerIds) {
  const runtimeSharedOwners = new Set(["v3.indicators", "v3.legacy-transactions"]);
  const archiveTargets = [...archiveOwnerIds].map((archiveOwnerId) => ({
    id: `archive:${archiveOwnerId}`,
    class: "archive-owner",
    archiveOwnerId,
    rootKind: "registered-owner-target",
    logicalPath: `archive/${archiveOwnerId}`,
    pathKind: "registered-owner-locations",
    namespace: runtimeSharedOwners.has(archiveOwnerId) ? "runtime-shared" : "user",
    backupPolicy: "archive-owner",
    restorePolicy: "owner-restore",
    authoritative: true,
    description: "Physical locations are resolved only by the canonical archive owner registry.",
  }));
  return freezeRows([...archiveTargets, ...NON_ARCHIVE_TARGETS]);
}

export function resolvePlanningNonArchiveWriterTarget(targetId, input) {
  const target = NON_ARCHIVE_TARGETS.find((entry) => entry.id === targetId);
  if (!target) throw new Error(`PLANNING_NON_ARCHIVE_WRITER_TARGET_UNKNOWN:${targetId}`);
  const roots = resolvePlanningRuntimeRoots(input);
  const pathApi = input.platform === "win32" && /^(?:[A-Za-z]:[\\/]|\\\\)/u.test(roots.planningRoot)
    ? path.win32
    : path.posix;
  let root;
  if (target.rootKind === "planning-root") {
    root = roots.planningRoot;
  } else if (target.rootKind === "runtime-root") {
    root = roots.runtimeRoot;
  } else if (target.rootKind === "control-root") {
    root = roots.controlRoot;
  } else if (target.rootKind === "external-selected") {
    if (!input.externalPath) throw new Error(`PLANNING_EXTERNAL_TARGET_PATH_REQUIRED:${targetId}`);
    root = input.externalPath;
  } else if (target.rootKind === "temp-root") {
    if (!input.tempRoot) throw new Error(`PLANNING_TEMP_TARGET_ROOT_REQUIRED:${targetId}`);
    root = input.tempRoot;
  } else {
    throw new Error(`PLANNING_NON_ARCHIVE_WRITER_TARGET_UNRESOLVED:${targetId}`);
  }
  const targetPath = target.rootKind === "external-selected"
    ? pathApi.resolve(root)
    : pathApi.resolve(root, target.logicalPath);
  return Object.freeze({ target: Object.freeze({ ...target }), path: targetPath });
}

const source = (id, sourcePath, kind, targets, mutationSignals, futureLeasePolicy, exportedBypassRisk, notes) => ({
  id, sourcePath, kind, targets, mutationSignals, futureLeasePolicy, exportedBypassRisk, notes,
});

export const PLANNING_WRITER_SOURCES = freezeRows([
  source("news.alerts", "src/lib/news/alerts.ts", "server-module", ["archive:v3.alerts"], ["fs-direct"], "inherited-runtime", true, "News alert mutation helper."),
  source("news.exposure", "src/lib/news/exposureStore.ts", "server-module", ["archive:v3.exposure"], ["fs-direct"], "inherited-runtime", true, "Exposure profile helper."),
  source("news.search-index", "src/lib/news/searchIndex.ts", "server-module", ["archive:v3.news"], ["fs-direct"], "inherited-runtime", true, "News search index."),
  source("news.sqlite", "src/lib/news/storageSqlite.ts", "server-module", ["archive:v3.news"], ["sqlite", "fs-direct"], "inherited-runtime", true, "SQLite news store and artifacts."),
  source("planning.assumptions-overrides", "src/lib/planning/assumptions/overridesStorage.ts", "server-module", ["control.assumptions", "archive:stable.profile-run-vault"], ["fs-direct"], "inherited-runtime", true, "Legacy shared overrides and profile-partition overrides."),
  source("planning.assumptions", "src/lib/planning/assumptions/storage.ts", "server-module", ["control.assumptions", "control.assumptions-latest"], ["fs-direct"], "inherited-runtime", true, "Assumption latest/history state."),
  source("planning.cache", "src/lib/planning/cache/storage.ts", "server-module", ["derived.planning-cache"], ["fs-direct"], "inherited-runtime", true, "Rebuildable Planning cache."),
  source("planning.migration-manager", "src/lib/planning/migrations/manager.ts", "cli-module", ["control.migrations", "archive:stable.profile-run-vault"], ["fs-direct"], "one-shot", true, "Migration state, snapshots, and stable owner writes."),
  source("planning.migration-runner", "src/lib/planning/migrations/runner.ts", "cli-module", ["archive:stable.profile-run-vault"], ["fs-direct"], "one-shot", true, "Stable profile/run migration."),
  source("planning.retention", "src/lib/planning/retention/cleanup.ts", "cli-module", ["archive:stable.profile-run-vault", "control.assumptions", "control.assumptions-latest", "control.trash", "derived.planning-cache"], ["fs-direct"], "one-shot", true, "Retention across owned and control targets."),
  source("planning.vault-reset", "src/lib/planning/security/vaultReset.ts", "server-module", ["control.assumptions", "control.assumptions-latest", "control.security", "control.ops"], ["fs-direct"], "inherited-runtime", true, "Vault reset control mutation."),
  source("planning.vault-state", "src/lib/planning/security/vaultState.ts", "server-module", ["control.security"], ["fs-direct"], "inherited-runtime", true, "Vault state/config."),
  source("planning.consistency", "src/lib/planning/storage/consistency.ts", "server-module", ["archive:stable.profile-run-vault"], ["fs-direct"], "inherited-runtime", true, "Stable owner consistency repair."),
  source("planning.storage-journal", "src/lib/planning/storage/journal.ts", "server-module", ["control.storage-journal"], ["fs-direct"], "inherited-runtime", true, "Storage journal."),
  source("planning.profile-store", "src/lib/planning/store/profileStore.ts", "server-module", ["archive:stable.profile-run-vault"], ["fs-direct", "atomic-helper"], "inherited-runtime", true, "Stable profile store."),
  source("planning.run-create", "src/lib/planning/store/runCreateStore.ts", "server-module", ["archive:stable.profile-run-vault"], ["fs-direct", "atomic-helper"], "inherited-runtime", true, "Stable run creation."),
  source("planning.run-meta", "src/lib/planning/store/runMetaWriter.ts", "server-module", ["archive:stable.profile-run-vault"], ["fs-direct"], "inherited-runtime", true, "Stable run metadata."),
  source("planning.run-read-migration", "src/lib/planning/store/runReadMigration.ts", "server-module", ["archive:stable.profile-run-vault"], ["fs-direct"], "inherited-runtime", true, "Write-on-read migration."),
  source("planning.run-trash", "src/lib/planning/store/runTrashStore.ts", "server-module", ["archive:stable.profile-run-vault", "control.trash"], ["fs-direct"], "inherited-runtime", true, "Run deletion and trash metadata."),
  source("planning.trash", "src/lib/planning/store/trash.ts", "server-module", ["archive:stable.profile-run-vault", "control.trash"], ["fs-direct"], "inherited-runtime", true, "Stable owner trash helper."),
  source("v3.alerts", "src/lib/planning/v3/alerts/store.ts", "server-module", ["archive:v3.alerts"], ["fs-direct"], "inherited-runtime", true, "V3 alert store."),
  source("v3.csv-drafts", "src/lib/planning/v3/drafts/draftStore.ts", "server-module", ["archive:v3.csv-drafts"], ["fs-direct"], "inherited-runtime", true, "CSV draft store."),
  source("v3.exposure", "src/lib/planning/v3/exposure/store.ts", "server-module", ["archive:v3.exposure"], ["fs-direct"], "inherited-runtime", true, "V3 exposure store."),
  source("v3.indicator-overrides", "src/lib/planning/v3/indicators/specOverrides.ts", "server-module", ["archive:v3.indicators"], ["fs-direct"], "inherited-runtime", true, "Indicator overrides."),
  source("v3.indicators", "src/lib/planning/v3/indicators/store/index.ts", "server-module", ["archive:v3.indicators"], ["fs-direct"], "inherited-runtime", true, "Indicator store."),
  source("v3.journal", "src/lib/planning/v3/journal/store.ts", "server-module", ["archive:v3.journal"], ["fs-direct"], "inherited-runtime", true, "Journal store."),
  source("v3.news-notes", "src/lib/planning/v3/news/notes.ts", "server-module", ["archive:v3.news"], ["fs-direct"], "inherited-runtime", true, "News notes."),
  source("v3.news-search", "src/lib/planning/v3/news/search.ts", "server-module", ["archive:v3.news"], ["fs-direct"], "inherited-runtime", true, "News search cache."),
  source("v3.news-settings", "src/lib/planning/v3/news/settings.ts", "server-module", ["archive:v3.news"], ["fs-direct"], "inherited-runtime", true, "News settings."),
  source("v3.news-store", "src/lib/planning/v3/news/store/index.ts", "server-module", ["archive:v3.news"], ["fs-direct"], "inherited-runtime", true, "News store."),
  source("v3.news-weekly-plan", "src/lib/planning/v3/news/weeklyPlan.ts", "server-module", ["archive:v3.news"], ["fs-direct"], "inherited-runtime", true, "Weekly plan output."),
  source("v3.migrate", "src/lib/planning/v3/ops/migrate.ts", "cli-module", ["archive:v3.news", "archive:v3.indicators", "archive:v3.exposure", "output.external"], ["fs-direct"], "one-shot", true, "V3 schema migration and backup."),
  source("v3.trim", "src/lib/planning/v3/ops/trim.ts", "cli-module", ["archive:v3.news", "archive:v3.indicators", "archive:v3.alerts", "archive:v3.journal"], ["fs-direct"], "one-shot", true, "V3 retention trim."),
  source("v3.weekly-html", "src/lib/planning/v3/report/weeklyHtml.ts", "cli-module", ["archive:v3.news", "output.external"], ["fs-direct"], "one-shot", true, "Weekly report read and output."),
  source("v3.routines", "src/lib/planning/v3/routines/store.ts", "server-module", ["archive:v3.routines"], ["fs-direct"], "inherited-runtime", true, "Routine store."),
  source("v3.scenarios", "src/lib/planning/v3/scenarios/library.ts", "server-module", ["archive:v3.scenario-overrides"], ["fs-direct"], "inherited-runtime", true, "Scenario override library."),
  source("v3.legacy-transactions", "src/lib/planning/v3/service/transactionStore.ts", "server-module", ["archive:v3.legacy-transactions"], ["fs-direct"], "inherited-runtime", true, "Legacy transaction store."),
  source("v3.batches", "src/lib/planning/v3/store/batchesStore.ts", "server-module", ["archive:v3.batches"], ["fs-direct", "atomic-helper"], "inherited-runtime", true, "Batch store."),
  source("v3.drafts", "src/lib/planning/v3/store/draftStore.ts", "server-module", ["archive:v3.drafts"], ["fs-direct"], "inherited-runtime", true, "V3 draft store."),
  source("ops.audit-log", "src/lib/audit/auditLogStore.ts", "server-module", ["control.ops"], ["fs-direct"], "inherited-runtime", true, "Legacy audit log."),
  source("ops.action-log", "src/lib/ops/actions/actionLog.ts", "server-module", ["control.ops"], ["manual-indirect"], "inherited-runtime", true, "Action log."),
  source("ops.auto-merge", "src/lib/ops/autoMergePolicy.ts", "server-module", ["control.ops"], ["manual-indirect"], "inherited-runtime", true, "Auto-merge policy."),
  source("ops.planning-data-vault", "src/lib/ops/backup/planningDataVault.ts", "shared-helper", ["control.assumptions", "control.assumptions-latest", "control.ops", "disabled.restore-apply"], ["manual-indirect"], "disabled", true, "Legacy restore surface remains disabled for apply."),
  source("ops.preview-token", "src/lib/ops/backup/previewToken.ts", "server-module", ["control.ops"], ["manual-indirect"], "inherited-runtime", true, "Backup preview receipt and token."),
  source("ops.replace-restore", "src/lib/ops/backup/replaceRestoreTransaction.ts", "shared-helper", ["disabled.restore-apply"], ["manual-indirect"], "disabled", true, "Legacy replace restore is not a production apply path."),
  source("ops.data-quality", "src/lib/ops/dataQuality.ts", "server-module", ["control.ops"], ["manual-indirect"], "inherited-runtime", true, "Data quality reports."),
  source("ops.metrics-store", "src/lib/ops/metrics/metricsStore.ts", "server-module", ["control.ops"], ["manual-indirect"], "inherited-runtime", true, "Metrics store."),
  source("ops.metrics-log", "src/lib/ops/metricsLog.ts", "server-module", ["control.ops"], ["manual-indirect"], "inherited-runtime", true, "Metrics events."),
  source("ops.scheduler-health", "src/lib/ops/scheduler/health.ts", "shared-helper", ["control.ops"], ["manual-indirect"], "inherited-runtime", true, "Scheduler health state."),
  source("ops.security-audit", "src/lib/ops/securityAuditLog.ts", "server-module", ["control.ops"], ["manual-indirect"], "inherited-runtime", true, "Security audit log."),
  source("planning.local-auth", "src/lib/planning/auth/localAuth.ts", "server-module", ["control.local-auth"], ["manual-indirect"], "inherited-runtime", true, "Local auth index."),
  source("planning.reports", "src/lib/planning/reports/storage.ts", "server-module", ["archive:stable.reports"], ["manual-indirect"], "inherited-runtime", true, "Stable reports."),
  source("planning.share", "src/lib/planning/share/storage.ts", "server-module", ["output.share"], ["manual-indirect"], "inherited-runtime", true, "Share artifacts."),
  source("planning.run-actions", "src/lib/planning/store/runActionStore.ts", "server-module", ["archive:stable.profile-run-vault"], ["atomic-helper"], "inherited-runtime", true, "Run action center."),
  source("planning.run-codec", "src/lib/planning/store/runRecordCodec.ts", "shared-helper", ["archive:stable.profile-run-vault"], ["manual-indirect"], "inherited-runtime", true, "Run record codec writes."),
  source("v3.account-mapping", "src/lib/planning/v3/store/accountMappingOverridesStore.ts", "server-module", ["archive:v3.transaction-overrides"], ["atomic-helper"], "inherited-runtime", true, "Account mapping overrides."),
  source("v3.accounts", "src/lib/planning/v3/store/accountsStore.ts", "server-module", ["archive:v3.accounts"], ["atomic-helper"], "inherited-runtime", true, "Account store."),
  source("v3.category-rules", "src/lib/planning/v3/store/categoryRulesStore.ts", "server-module", ["archive:v3.category-rules"], ["atomic-helper"], "inherited-runtime", true, "Category rules."),
  source("v3.opening-balances", "src/lib/planning/v3/store/openingBalancesStore.ts", "server-module", ["archive:v3.opening-balances"], ["atomic-helper"], "inherited-runtime", true, "Opening balances."),
  source("v3.txn-overrides", "src/lib/planning/v3/store/txnOverridesStore.ts", "server-module", ["archive:v3.transaction-overrides"], ["atomic-helper"], "inherited-runtime", true, "Transaction overrides."),
  source("v3.txn-transfer-overrides", "src/lib/planning/v3/store/txnTransferOverridesStore.ts", "server-module", ["archive:v3.transaction-overrides"], ["atomic-helper"], "inherited-runtime", true, "Transfer overrides."),
  source("ops.scheduler-policy", "src/lib/ops/scheduler/policy.ts", "scheduler-module", ["control.ops"], ["fs-direct"], "inherited-runtime", true, "Scheduler policy state."),
  source("outside.auth-sqlite-backfill", "scripts/planning_auth_sqlite_backfill.mjs", "cli-module", ["outside.prisma-db"], ["sqlite"], "out-of-scope", false, "Explicit Prisma SQLite migration outside the Planning data-root lease boundary."),
]);

export const PLANNING_WRITER_EXCLUSIONS = freezeRows([
  { sourcePath: "src/lib/planning/server/runtime/dataDir.ts", class: "generic-primitive", reason: "Directory creation helper does not choose a concrete writer target.", targetOutsidePlanningRoot: false, evidence: "Callers supply the target path." },
  { sourcePath: "src/lib/planning/storage/atomicWrite.ts", class: "generic-primitive", reason: "Atomic replace helper cannot identify its caller owner.", targetOutsidePlanningRoot: false, evidence: "Concrete callers are registered separately." },
  { sourcePath: "src/lib/ops/backup/planningOwnerArchive.ts", class: "read-only-source", reason: "Planning source is read-only; only a caller-selected archive is written.", targetOutsidePlanningRoot: true, evidence: "Archive output maps to output.external." },
  { sourcePath: "src/lib/planning/v3/ops/export.ts", class: "read-only-source", reason: "Planning source is read-only; export output is external-selected.", targetOutsidePlanningRoot: true, evidence: "No source owner mutation." },
  { sourcePath: "src/lib/planning/v3/ops/supportBundle.ts", class: "read-only-source", reason: "Planning source is read-only; support output is external-selected.", targetOutsidePlanningRoot: true, evidence: "No source owner mutation." },
  { sourcePath: "src/lib/ops/backup/uploadTemp.ts", class: "out-of-scope", reason: "Upload staging is confined to the OS temp root.", targetOutsidePlanningRoot: true, evidence: "Uses os.tmpdir()." },
  { sourcePath: "src/lib/ops/feedback/planningFeedbackStore.ts", class: "out-of-scope", reason: "Feedback storage is a separate ops surface outside Planning roots.", targetOutsidePlanningRoot: true, evidence: "Canonical path is .data/ops/feedback." },
  { sourcePath: "src/lib/ops/backup/planningOwnerRestoreTransaction.ts", class: "fixture", reason: "Restore transaction is not connected to production orchestration.", targetOutsidePlanningRoot: false, evidence: "Production restore apply remains blocked." },
  { sourcePath: "src/lib/ops/backup/planningOwnerCollector.ts", class: "read-only-source", reason: "Owner collector opens source files read-only and does not mutate Planning targets.", targetOutsidePlanningRoot: false, evidence: "Open flags are O_RDONLY with O_NOFOLLOW where supported." },
  { sourcePath: "src/lib/ops/backup/planningOwnerDoctor.ts", class: "read-only-source", reason: "Owner doctor opens source files read-only and reports validation findings.", targetOutsidePlanningRoot: false, evidence: "Open flags are O_RDONLY with O_NOFOLLOW where supported." },
  { sourcePath: "scripts/planning_postgres_readiness.mjs", class: "out-of-scope", reason: "Postgres readiness stages operator-selected migration evidence and file exports outside the Planning runtime root.", targetOutsidePlanningRoot: true, evidence: "Its output directory is an explicit command argument and database changes use the PostgreSQL contract." },
  { sourcePath: "scripts/planning_v2_compat.mjs", class: "fixture", reason: "Compatibility verification mutates only its isolated temporary sandbox.", targetOutsidePlanningRoot: true, evidence: "The mutation is sandbox cleanup under os.tmpdir()." },
  { sourcePath: "scripts/planning_v2_desktop_build.mjs", class: "output-artifact", reason: "Desktop build writes packaged application artifacts, not live Planning data.", targetOutsidePlanningRoot: true, evidence: "Writes are confined to the configured artifact directory." },
  { sourcePath: "scripts/planning_v2_desktop_install.mjs", class: "out-of-scope", reason: "Desktop install writes application files under the selected installation directory.", targetOutsidePlanningRoot: true, evidence: "It does not resolve or mutate the Planning data root." },
  { sourcePath: "scripts/planning_v2_desktop_uninstall.mjs", class: "out-of-scope", reason: "Desktop uninstall removes application installation files, not Planning user data.", targetOutsidePlanningRoot: true, evidence: "Its targets are the installation directory and launcher files." },
  { sourcePath: "scripts/planning_v2_release_notes.mjs", class: "output-artifact", reason: "Release note generation writes a caller-selected release artifact.", targetOutsidePlanningRoot: true, evidence: "The output is under the configured release note directory." },
  { sourcePath: "scripts/playwright_with_webserver_debug.mjs", class: "fixture", reason: "Browser debug wrapper temporarily rewrites and restores a test support file.", targetOutsidePlanningRoot: true, evidence: "The mutation is limited to test instrumentation and is restored on exit." },
]);

const entry = (id, packageScript, executablePath, kind, sources, targets, childEntrypoints, futureLeasePolicy, childCommandPaths = [], childCommandExclusions = []) => ({
  id, ...(packageScript ? { packageScript } : {}), executablePath, kind, sources, targets, childEntrypoints, futureLeasePolicy, childCommandPaths, childCommandExclusions,
});

const RUNTIME_HTTP_SOURCES = Object.freeze(PLANNING_WRITER_SOURCES
  .filter((row) => row.futureLeasePolicy === "inherited-runtime")
  .map((row) => row.id));
const RUNTIME_HTTP_TARGETS = Object.freeze([...new Set(PLANNING_WRITER_SOURCES
  .filter((row) => row.futureLeasePolicy === "inherited-runtime")
  .flatMap((row) => row.targets))].sort());

export const PLANNING_WRITER_ENTRYPOINTS = freezeRows([
  entry("runtime.direct-server", "start", "scripts/next_prod_safe.mjs", "runtime-parent", [], RUNTIME_HTTP_TARGETS, ["runtime.http-store"], "parent-acquire-child-inherit"),
  entry("runtime.local", "start:local", "scripts/start_local.mjs", "runtime-parent", [], ["control.start-local-instance", ...RUNTIME_HTTP_TARGETS], ["runtime.http-store"], "parent-acquire-child-inherit", [], [{ packageScript: "start", reason: "Literal is the Next.js start subcommand, not a pnpm package child." }]),
  entry("runtime.desktop", "planning:v2:desktop:launch", "scripts/planning_v2_desktop_launch.mjs", "runtime-parent", [], ["control.desktop-instance", ...RUNTIME_HTTP_TARGETS], ["runtime.http-store"], "parent-acquire-child-inherit", [], [{ packageScript: "start", reason: "Literal is the Next.js start subcommand, not a pnpm package child." }]),
  entry("runtime.raw", "start:raw", "package.json", "disabled", [], RUNTIME_HTTP_TARGETS, [], "disabled"),
  entry("runtime.http-store", null, "src/app/api", "runtime-child", RUNTIME_HTTP_SOURCES, RUNTIME_HTTP_TARGETS, [], "parent-acquire-child-inherit"),
  entry("cli.news-refresh", "news:refresh", "scripts/news_refresh.mjs", "one-shot-cli", ["news.alerts", "news.exposure", "news.search-index", "news.sqlite"], ["archive:v3.news", "archive:v3.alerts", "archive:v3.exposure"], [], "one-shot"),
  entry("cli.indicators-refresh", "indicators:refresh", "scripts/indicators_refresh.mjs", "one-shot-cli", ["v3.indicators", "v3.alerts"], ["archive:v3.indicators", "archive:v3.alerts"], [], "one-shot"),
  entry("cli.refresh-all", "v3:refresh-all", "src/lib/planning/v3/ops/refreshAll.ts", "one-shot-cli", [], ["archive:v3.news", "archive:v3.indicators", "archive:v3.alerts"], ["cli.news-refresh", "cli.indicators-refresh"], "one-shot", ["src/lib/planning/v3/ops/refreshAll.ts"]),
  entry("cli.v3-trim", "v3:trim", "src/lib/planning/v3/ops/trim.ts", "one-shot-cli", ["v3.trim"], ["archive:v3.news", "archive:v3.indicators", "archive:v3.alerts", "archive:v3.journal"], [], "one-shot"),
  entry("cli.v3-migrate", "v3:migrate", "src/lib/planning/v3/ops/migrate.ts", "one-shot-cli", ["v3.migrate"], ["archive:v3.news", "archive:v3.indicators", "archive:v3.exposure"], [], "one-shot"),
  entry("cli.assumptions", "planning:assumptions:sync", "scripts/planning_assumptions_sync.mjs", "one-shot-cli", ["planning.assumptions"], ["control.assumptions", "control.assumptions-latest"], [], "one-shot"),
  entry("cli.monthly", "planning:run:monthly", "scripts/planning_run_monthly.mjs", "one-shot-cli", ["planning.run-create", "planning.run-actions"], ["archive:stable.profile-run-vault", "control.ops"], [], "one-shot"),
  entry("cli.v2-seed", "planning:v2:seed", "scripts/planning_v2_seed_demo.mjs", "one-shot-cli", ["planning.profile-store", "planning.run-create"], ["archive:stable.profile-run-vault"], [], "one-shot"),
  entry("cli.v2-backfill", "planning:v2:backfill-legacy-runs", "scripts/planning_v2_backfill_legacy_runs.mjs", "one-shot-cli", ["planning.run-read-migration"], ["archive:stable.profile-run-vault"], [], "one-shot"),
  entry("cli.v2-migrate", "planning:v2:migrate:apply", "scripts/planning_v2_migrate.mjs", "one-shot-cli", ["planning.migration-manager", "planning.migration-runner"], ["archive:stable.profile-run-vault", "control.migrations"], [], "one-shot"),
  entry("cli.ops-run", "planning:v2:ops:run", "scripts/planning_v2_ops_run.mjs", "one-shot-cli", ["ops.action-log", "ops.data-quality", "ops.metrics-store"], ["control.ops"], ["cli.assumptions", "cli.v2-regress"], "one-shot"),
  entry("cli.ops-safety", "planning:v2:ops:safety", "scripts/planning_v2_ops_safety.mjs", "one-shot-cli", ["ops.security-audit", "ops.metrics-log"], ["control.ops"], [], "one-shot"),
  entry("cli.scheduler-health", "planning:v2:ops:scheduler:health", "scripts/planning_v2_ops_scheduler_health.mjs", "one-shot-cli", ["ops.scheduler-health", "ops.scheduler-policy"], ["control.ops"], [], "one-shot"),
  entry("cli.ops-prune", "planning:v2:ops:prune", "scripts/planning_v2_ops_prune.mjs", "one-shot-cli", ["ops.action-log", "ops.metrics-log"], ["control.ops"], [], "one-shot"),
  entry("scheduler.ops", null, "scripts/planning_v2_ops_scheduler.sh", "scheduler-parent", [], ["control.ops", "archive:stable.profile-run-vault"], ["cli.ops-run", "cli.monthly"], "parent-acquire-child-inherit"),
  entry("scheduler.daily", "daily:refresh", "scripts/daily_refresh.mjs", "scheduler-parent", [], ["archive:v3.news", "archive:v3.indicators"], ["cli.news-refresh", "cli.indicators-refresh", "cli.cleanup"], "parent-acquire-child-inherit", ["scripts/daily_refresh.mjs"]),
  entry("scheduler.daily-strict", "daily:refresh:strict", "scripts/daily_refresh.mjs", "scheduler-parent", [], ["archive:v3.news", "archive:v3.indicators"], ["cli.news-refresh", "cli.indicators-refresh", "cli.cleanup"], "parent-acquire-child-inherit", ["scripts/daily_refresh.mjs"]),
  entry("cli.v2-report", "planning:v2:report", "scripts/planning_v2_report.mjs", "one-shot-cli", ["planning.reports"], ["archive:stable.reports"], [], "one-shot"),
  entry("cli.v2-regress", "planning:v2:regress", "scripts/planning_v2_regression.mjs", "one-shot-cli", [], ["output.regression"], [], "one-shot"),
  entry("cli.v2-regress-update", "planning:v2:regress:update", "scripts/planning_v2_regression.mjs", "one-shot-cli", [], ["output.regression"], [], "one-shot"),
  entry("cli.v2-regress-report", "planning:v2:regress:report", "scripts/planning_v2_regression.mjs", "one-shot-cli", [], ["output.regression"], [], "one-shot"),
  entry("cli.v2-final-report", "planning:v2:final-report", "scripts/planning_v2_final_report.mjs", "one-shot-cli", [], ["output.release"], ["cli.v2-regress"], "one-shot", ["scripts/planning_v2_final_report.mjs"]),
  entry("cli.v2-record", "planning:v2:record", "scripts/planning_v2_completion_record.mjs", "one-shot-cli", [], ["output.release"], [], "one-shot"),
  entry("cli.v2-evidence", "planning:v2:release:evidence", "scripts/planning_v2_evidence_bundle.mjs", "one-shot-cli", [], ["output.release", "output.external"], [], "one-shot", [], [{ packageScript: "planning:assumptions:sync", reason: "The evidence bundle inventories Planning scripts but does not execute this command." }]),
  entry("cli.v2-release", "planning:v2:release", "scripts/planning_v2_release.mjs", "one-shot-cli", [], ["output.release"], ["cli.v2-evidence"], "parent-acquire-child-inherit", ["src/lib/planning/release/plan.ts"]),
  entry("cli.v2-release-local", "planning:v2:release:local", "scripts/planning_v2_release.mjs", "one-shot-cli", [], ["output.release"], ["cli.v2-evidence"], "parent-acquire-child-inherit", ["src/lib/planning/release/plan.ts"]),
  entry("cli.weekly-report", "v3:report:weekly", "src/lib/planning/v3/report/weeklyHtml.ts", "one-shot-cli", ["v3.weekly-html"], ["archive:v3.news", "output.external"], [], "one-shot"),
  entry("cli.cleanup", "cleanup", "scripts/cleanup.mjs", "one-shot-cli", ["planning.retention"], ["archive:stable.profile-run-vault", "control.assumptions", "control.assumptions-latest", "control.trash", "derived.planning-cache"], [], "one-shot"),
  entry("cli.restore", "v3:restore", "src/lib/planning/v3/ops/restore.ts", "disabled", ["ops.planning-data-vault", "ops.replace-restore"], ["disabled.restore-apply"], [], "disabled"),
  entry("cli.doctor", "v3:doctor", "src/lib/planning/v3/ops/doctor.ts", "read-only", [], [], [], "read-only"),
  entry("cli.export", "v3:export", "src/lib/planning/v3/ops/export.ts", "read-only", [], ["output.external"], [], "read-only"),
  entry("cli.support", "v3:support-bundle", "src/lib/planning/v3/ops/supportBundle.ts", "read-only", [], ["output.external"], [], "read-only"),
  entry("cli.csv-preview", "planning:v3:import:csv", "scripts/planning_v3_import_csv.mjs", "read-only", [], [], [], "read-only"),
  entry("cli.v2-report-samples", "planning:v2:report:samples", "scripts/planning_v2_report_samples.mjs", "one-shot-cli", [], ["archive:stable.reports"], [], "one-shot"),
  entry("cli.v2-openapi", "planning:v2:openapi", "scripts/planning_v2_openapi.mjs", "one-shot-cli", [], ["output.openapi"], [], "one-shot"),
  entry("cli.v2-migrate-preview", "planning:v2:migrate", "scripts/planning_v2_migrate.mjs", "read-only", [], [], [], "read-only"),
  entry("cli.v2-migrate-dry", "planning:v2:migrate:dry", "scripts/planning_v2_migrate.mjs", "read-only", [], [], [], "read-only"),
  entry("cli.ops-run-regress", "planning:v2:ops:run:regress", "scripts/planning_v2_ops_run.mjs", "one-shot-cli", ["ops.action-log", "ops.data-quality", "ops.metrics-store"], ["control.ops"], ["cli.assumptions", "cli.v2-regress"], "one-shot", ["scripts/planning_v2_ops_run.mjs"]),
  entry("cli.ops-safety-weekly", "planning:v2:ops:safety:weekly", "scripts/planning_v2_ops_safety.mjs", "one-shot-cli", ["ops.security-audit", "ops.metrics-log"], ["control.ops"], [], "one-shot"),
  entry("cli.ops-safety-regress", "planning:v2:ops:safety:regress", "scripts/planning_v2_ops_safety.mjs", "one-shot-cli", ["ops.security-audit", "ops.metrics-log"], ["control.ops"], [], "one-shot"),
  entry("cli.auth-sqlite-backfill", "planning:auth:sqlite-backfill", "scripts/planning_auth_sqlite_backfill.mjs", "one-shot-cli", ["outside.auth-sqlite-backfill"], ["outside.prisma-db"], [], "out-of-scope"),
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entryValue]) => [key, stableValue(entryValue)]));
}

export function planningWriterRegistryDigest({ targets, sources = PLANNING_WRITER_SOURCES, exclusions = PLANNING_WRITER_EXCLUSIONS, entrypoints = PLANNING_WRITER_ENTRYPOINTS }) {
  const payload = stableValue({ version: PLANNING_WRITER_REGISTRY_VERSION, targets, sources, exclusions, entrypoints });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
