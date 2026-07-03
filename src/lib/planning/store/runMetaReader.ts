import fs from "node:fs/promises";

import { migrateLegacyRunToEngineEnvelope } from "./engineEnvelopeMigration";
import {
  fromStoredPayload,
  toStoredPayload,
  writeJsonAtomic,
} from "./runRecordCodec";
import {
  isRunRecord,
  normalizeRunMetaForRead,
} from "./runMetaRecord";
import {
  recordRunReadFallbackUsage,
  type ReadRunMetaByPathDetailedResult,
} from "./runReadObservability";
import { type PlanningRunRecord } from "./types";

export type ReadRunMetaRecordOptions = {
  persistMigrations?: boolean;
};

export async function readRunMetaRecordByPath(
  filePath: string,
  options?: ReadRunMetaRecordOptions,
): Promise<PlanningRunRecord | null> {
  const detailed = await readRunMetaRecordByPathDetailed(filePath, options);
  return detailed.status === "found" ? detailed.run : null;
}

export async function readRunMetaRecordByPathDetailed(
  filePath: string,
  options?: ReadRunMetaRecordOptions,
): Promise<ReadRunMetaByPathDetailedResult> {
  let loaded: unknown;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    loaded = JSON.parse(raw) as unknown;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return { status: "missing", reason: "file-missing" };
    }
    if (error instanceof SyntaxError) {
      return { status: "unreadable", reason: "invalid-json" };
    }
    return {
      status: "unreadable",
      reason: nodeError?.code ? `read-failed:${nodeError.code}` : "read-failed",
    };
  }

  let decoded: Awaited<ReturnType<typeof fromStoredPayload>>;
  try {
    decoded = await fromStoredPayload(loaded);
  } catch {
    return { status: "unreadable", reason: "decode-failed" };
  }

  const parsed = decoded.payload;
  if (!isRunRecord(parsed)) return { status: "unreadable", reason: "invalid-run-record" };
  try {
    const canonicalMeta = normalizeRunMetaForRead(parsed);
    const migration = migrateLegacyRunToEngineEnvelope(canonicalMeta.run);
    recordRunReadFallbackUsage({ canonicalMeta, migration });
    if (
      options?.persistMigrations === true
      && (decoded.rewriteToVault || canonicalMeta.migrated || migration.migrated)
    ) {
      await writeJsonAtomic(filePath, await toStoredPayload(migration.run));
    }
    return { status: "found", run: migration.run };
  } catch {
    return { status: "unreadable", reason: "canonicalization-failed" };
  }
}
