import { NextResponse } from "next/server";
import { shouldCooldown } from "@/lib/http/rateLimitCooldown";
import { listProviders } from "@/lib/providers/registry";
import { getCorpIndexStatus } from "@/lib/publicApis/dart/corpIndex";

type SourceHealthRow = {
  sourceKey: string;
  configured: boolean;
  replayEnabled: boolean;
  cooldownNextRetryAt: string | null;
  lastSnapshotGeneratedAt: string | null;
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }

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
  const openDartConfigured = Boolean((process.env.OPENDART_API_KEY ?? "").trim());
  const openDartIndexStatus = getCorpIndexStatus();
  rows.push({
    sourceKey: "opendart",
    configured: openDartConfigured,
    replayEnabled: openDartIndexStatus.exists,
    cooldownNextRetryAt: null,
    lastSnapshotGeneratedAt: openDartIndexStatus.meta?.generatedAt ?? null,
  });

  return NextResponse.json({
    ok: true,
    data: rows,
    meta: {
      opendartConfigured: openDartConfigured,
    },
    fetchedAt: new Date().toISOString(),
  });
}
