import { NextResponse } from "next/server";
import { loadDataSourceImpactSnapshot } from "@/lib/dataSources/impactSnapshot";
import { onlyDev } from "@/lib/dev/onlyDev";
import { shouldCooldown } from "@/lib/http/rateLimitCooldown";
import { listProviders } from "@/lib/providers/registry";

type SourceHealthRow = {
  sourceKey: string;
  configured: boolean;
  replayEnabled: boolean;
  cooldownNextRetryAt: string | null;
  lastSnapshotGeneratedAt: string | null;
};

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const impactSnapshot = await loadDataSourceImpactSnapshot();

  const rows: SourceHealthRow[] = listProviders().map((provider) => {
    const sourceKey = provider.cooldownKey ?? provider.id;
    return {
      sourceKey: provider.id,
      configured: provider.isConfigured(process.env),
      replayEnabled: provider.replayEnabled?.() ?? false,
      cooldownNextRetryAt: shouldCooldown(sourceKey).nextRetryAt ?? null,
      lastSnapshotGeneratedAt: provider.lastSnapshotGeneratedAt?.() ?? null,
    };
  });
  rows.push({
    sourceKey: "opendart",
    configured: impactSnapshot.openDartConfigured,
    replayEnabled: impactSnapshot.openDartIndexStatus.exists,
    cooldownNextRetryAt: null,
    lastSnapshotGeneratedAt: impactSnapshot.openDartIndexStatus.meta?.generatedAt ?? null,
  });

  return NextResponse.json({
    ok: true,
    data: rows,
    meta: {
      opendartConfigured: impactSnapshot.openDartConfigured,
      impactHealthByCardId: impactSnapshot.impactHealthByCardId,
      impactReadOnlyByCardId: impactSnapshot.impactReadOnlyByCardId,
    },
    fetchedAt: new Date().toISOString(),
  });
}
