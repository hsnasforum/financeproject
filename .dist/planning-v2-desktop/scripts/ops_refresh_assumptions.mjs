import { tsImport } from "tsx/esm/api";

function fmt(value) {
  if (value === undefined || value === null) return "-";
  return String(value);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadTsModule(modulePath) {
  const raw = await tsImport(modulePath, { parentURL: import.meta.url });
  return raw?.default && typeof raw.default === "object" ? raw.default : raw;
}

async function main() {
  const startedAt = Date.now();
  const [sync, storage, scheduledTasks] = await Promise.all([
    loadTsModule("../src/lib/planning/server/assumptions/sync.ts"),
    loadTsModule("../src/lib/planning/server/assumptions/storage.ts"),
    loadTsModule("../src/lib/ops/scheduledTasks.ts"),
  ]);
  if (typeof sync?.buildAssumptionsSnapshot !== "function") {
    throw new Error("buildAssumptionsSnapshot not available");
  }

  const guard = await scheduledTasks.ensureScheduledTaskVaultUnlocked();
  if (!guard?.ok) {
    const durationMs = Math.max(0, Date.now() - startedAt);
    await scheduledTasks.appendScheduledTaskEvent({
      taskName: "OPS_REFRESH_ASSUMPTIONS",
      status: "FAILED",
      code: "LOCKED",
      durationMs,
      message: guard.message ?? "Vault is locked",
    });
    process.stderr.write("[ops:refresh-assumptions] failed code=LOCKED\nVault is locked. Unlock via /ops/security\n");
    process.exit(2);
    return;
  }

  const assumptionsPath = typeof storage?.ASSUMPTIONS_PATH === "string"
    ? storage.ASSUMPTIONS_PATH
    : ".data/planning/assumptions.latest.json";
  const { snapshot, snapshotId } = await sync.buildAssumptionsSnapshot();
  const ecosConfigured = Boolean((process.env.BOK_ECOS_API_KEY ?? process.env.ECOS_API_KEY ?? "").trim());
  const ecosUsed = snapshot.sources.some((source) => source.name.includes("ECOS"));
  const durationMs = Math.max(0, Date.now() - startedAt);
  await scheduledTasks.appendScheduledTaskEvent({
    taskName: "OPS_REFRESH_ASSUMPTIONS",
    status: "SUCCESS",
    code: "OK",
    durationMs,
    meta: {
      snapshotId,
      warningsCount: snapshot.warnings.length,
    },
  });

  const lines = [
    "[ops:refresh-assumptions] done",
    `path=${assumptionsPath}`,
    `snapshotId=${snapshotId}`,
    `asOf=${snapshot.asOf}`,
    `fetchedAt=${snapshot.fetchedAt}`,
    `sources=${snapshot.sources.length}`,
    `warnings=${snapshot.warnings.length}`,
    `ecosConfigured=${ecosConfigured}`,
    `ecosUsed=${ecosUsed}`,
    `policyRatePct=${fmt(snapshot.korea.policyRatePct)}`,
    `baseRatePct=${fmt(snapshot.korea.baseRatePct)}`,
    `cpiYoYPct=${fmt(snapshot.korea.cpiYoYPct)}`,
  ];

  for (const warning of snapshot.warnings) {
    lines.push(`warn=${warning}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

main().catch(async (error) => {
  const scheduledTasks = await loadTsModule("../src/lib/ops/scheduledTasks.ts");
  const code = scheduledTasks.toScheduledTaskErrorCode(error);
  const message = scheduledTasks.toScheduledTaskErrorMessage(error);
  await scheduledTasks.appendScheduledTaskEvent({
    taskName: "OPS_REFRESH_ASSUMPTIONS",
    status: "FAILED",
    code,
    message,
  });
  process.stderr.write(`[ops:refresh-assumptions] failed code=${code}\n${asString(message) || "unknown error"}\n`);
  process.exit(code === "LOCKED" ? 2 : 1);
});
