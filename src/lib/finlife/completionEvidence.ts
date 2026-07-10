import { prisma } from "@/lib/db/prisma";

export type FinlifeEvidenceState = "db-complete" | "complete";

export type FinlifeCompletionEvidenceLookup =
  | { status: "missing" }
  | {
      status: "found";
      state: FinlifeEvidenceState;
      lastSyncedAt: Date | null;
      ttlMs: number;
      meta: Record<string, unknown>;
    }
  | { status: "error"; error: unknown };

function isMissingEvidenceStorage(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return /does not exist|no such table|relation .+ does not exist|P2021|not initialized/i.test(raw);
}

export async function readFinlifeCompletionEvidence(
  kind: "deposit" | "saving",
): Promise<FinlifeCompletionEvidenceLookup> {
  try {
    const row = await prisma.externalSourceSnapshot.findUnique({
      where: {
        sourceId_kind: {
          sourceId: "finlife",
          kind,
        },
      },
    });
    if (!row) return { status: "missing" };

    const meta = (row.metaJson as Record<string, unknown> | null) ?? null;
    const state = meta?.completionState;
    if (meta?.evidenceType !== "finlife-prisma-product-sync"
      || (state !== "db-complete" && state !== "complete")) {
      return { status: "missing" };
    }

    const rawLastSyncedAt = row.lastSyncedAt instanceof Date
      ? row.lastSyncedAt
      : new Date(row.lastSyncedAt);
    const lastSyncedAt = Number.isFinite(rawLastSyncedAt.getTime()) && rawLastSyncedAt.getTime() > 0
      ? rawLastSyncedAt
      : null;
    return {
      status: "found",
      state,
      lastSyncedAt,
      ttlMs: row.ttlMs,
      meta,
    };
  } catch (error) {
    return isMissingEvidenceStorage(error)
      ? { status: "missing" }
      : { status: "error", error };
  }
}
