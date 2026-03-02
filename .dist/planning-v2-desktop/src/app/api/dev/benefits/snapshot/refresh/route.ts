import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/publicApis/benefitsSnapshot";
import { searchBenefits } from "@/lib/publicApis/providers/benefits";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parseMaxPages(value: string | null, fallback: number | "auto"): number | "auto" {
  if (!value || value.trim() === "") return fallback;
  const lowered = value.trim().toLowerCase();
  if (lowered === "auto") return "auto";
  return parsePositiveInt(value, typeof fallback === "number" ? fallback : 10, 1, 80);
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const maxPages = parseMaxPages(searchParams.get("maxPages"), "auto");
  const envRows = parsePositiveInt(process.env.BENEFITS_SCAN_ROWS ?? null, 200, 50, 300);
  const rows = parsePositiveInt(searchParams.get("rows"), envRows, 50, 300);

  try {
    const built = await buildSnapshot({
      build: async () => {
        const result = await searchBenefits("", {
          mode: "all",
          scanPages: maxPages,
          rows,
          scope: "auto",
          limit: 50000,
          maxMatches: typeof maxPages === "number" ? Math.max(rows * maxPages * 2, 10000) : 30000,
        });
        if (!result.ok) throw new Error(result.error.message);
        const meta = (result.meta ?? {}) as Record<string, unknown>;
        return {
          items: result.data,
          meta: {
            upstreamTotalCount: typeof meta.upstreamTotalCount === "number" ? meta.upstreamTotalCount : undefined,
            rows,
            neededPagesEstimate: typeof meta.neededPagesEstimate === "number" ? meta.neededPagesEstimate : undefined,
            requestedMaxPages: meta.requestedMaxPages === "auto" || typeof meta.requestedMaxPages === "number"
              ? meta.requestedMaxPages
              : maxPages,
            effectiveMaxPages: typeof meta.effectiveMaxPages === "number" ? meta.effectiveMaxPages : undefined,
            pagesFetched: typeof meta.pagesFetched === "number" ? meta.pagesFetched : undefined,
            rowsFetched: typeof meta.rowsFetched === "number" ? meta.rowsFetched : undefined,
            uniqueCount: typeof meta.uniqueCount === "number" ? meta.uniqueCount : result.data.length,
            completionRate:
              typeof meta.upstreamTotalCount === "number" && meta.upstreamTotalCount > 0
                ? Math.min(1, (typeof meta.uniqueCount === "number" ? meta.uniqueCount : result.data.length) / meta.upstreamTotalCount)
                : undefined,
            truncatedByHardCap: Boolean(meta.truncatedByHardCap),
            dedupedCount: typeof meta.dedupedCount === "number" ? meta.dedupedCount : undefined,
            paginationSuspected: Boolean(meta.paginationSuspected),
          },
        };
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        fromCache: built.fromCache,
        snapshot: built.snapshot.meta,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: error instanceof Error ? error.message : "snapshot refresh failed" } },
      { status: 502 },
    );
  }
}
