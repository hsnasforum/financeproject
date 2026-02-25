import { prisma } from "../db/prisma";
import { type Prisma } from "@prisma/client";
import { type ExternalSourceId, type UnifiedKind } from "./types";

export const DATAGO_DEFAULT_TTL_MS = 60 * 60 * 1000;
export { evaluateFreshness } from "./ttl";

function toInputJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function getExternalSnapshot(sourceId: ExternalSourceId, kind: UnifiedKind) {
  return prisma.externalSourceSnapshot.findUnique({
    where: {
      sourceId_kind: {
        sourceId,
        kind,
      },
    },
  });
}

export async function upsertExternalSnapshot(input: {
  sourceId: ExternalSourceId;
  kind: UnifiedKind;
  ttlMs: number;
  metaJson?: Record<string, unknown>;
}) {
  const now = new Date();
  return prisma.externalSourceSnapshot.upsert({
    where: {
      sourceId_kind: {
        sourceId: input.sourceId,
        kind: input.kind,
      },
    },
    update: {
      lastSyncedAt: now,
      ttlMs: input.ttlMs,
      metaJson: toInputJson(input.metaJson),
    },
    create: {
      sourceId: input.sourceId,
      kind: input.kind,
      lastSyncedAt: now,
      ttlMs: input.ttlMs,
      metaJson: toInputJson(input.metaJson),
    },
  });
}
