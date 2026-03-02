import { buildSnapshot } from "../publicApis/benefitsSnapshot";
import { searchBenefits } from "../publicApis/providers/benefits";

export type Gov24SyncOk = {
  ok: true;
  meta: {
    completionRate?: number;
    uniqueCount?: number;
    upstreamTotalCount?: number;
    hardCapPages: number;
    effectivePerPage: number;
    pagesFetched?: number;
    effectiveMaxPages?: number;
    neededPagesEstimate?: number;
    truncatedByHardCap: boolean;
  };
};

export type Gov24SyncErr = {
  ok: false;
  error: {
    code: string;
    message: string;
    upstreamStatus?: number;
    diagnostics?: Record<string, unknown>;
  };
};

function parsePositiveInt(value: string | null | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parseUpstreamStatus(message: string): number | undefined {
  const match = message.match(/\((\d{3})\)/);
  if (!match?.[1]) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

export async function runGov24SnapshotSync(opts?: {
  rows?: number;
  hardCapPages?: number;
  limit?: number;
  maxMatches?: number;
  scanPages?: "auto" | number;
}): Promise<Gov24SyncOk | Gov24SyncErr> {
  const rows = parsePositiveInt(String(opts?.rows ?? process.env.BENEFITS_SCAN_ROWS ?? ""), 200, 50, 300);
  const envHardCap = parsePositiveInt(String(opts?.hardCapPages ?? process.env.BENEFITS_SCAN_HARD_CAP_PAGES ?? ""), 200, 1, 10_000);
  const hardCapPages = Math.max(200, envHardCap);
  process.env.BENEFITS_SCAN_HARD_CAP_PAGES = String(hardCapPages);

  const built = await buildSnapshot({
    build: async () => {
      const scanned = await searchBenefits("", {
        mode: "all",
        scanPages: opts?.scanPages ?? "auto",
        rows,
        limit: opts?.limit ?? 100_000,
        maxMatches: opts?.maxMatches ?? 200_000,
      });
      if (!scanned.ok) {
        const upstreamStatus = parseUpstreamStatus(scanned.error.message);
        return Promise.reject({
          code: scanned.error.code || "UPSTREAM_ERROR",
          message: scanned.error.message,
          upstreamStatus,
          diagnostics: scanned.error.diagnostics,
        });
      }

      const meta = (scanned.meta ?? {}) as Record<string, unknown>;
      const upstreamTotalCount = typeof meta.upstreamTotalCount === "number" ? meta.upstreamTotalCount : undefined;
      const uniqueCount = typeof meta.uniqueCount === "number" ? meta.uniqueCount : scanned.data.length;
      const completionRate = upstreamTotalCount && upstreamTotalCount > 0
        ? Math.min(1, uniqueCount / upstreamTotalCount)
        : undefined;

      return {
        items: scanned.data,
        meta: {
          upstreamTotalCount,
          hardCapPages,
          effectivePerPage: typeof meta.effectivePerPage === "number" ? meta.effectivePerPage : rows,
          rows,
          neededPagesEstimate: typeof meta.neededPagesEstimate === "number" ? meta.neededPagesEstimate : undefined,
          requestedMaxPages: meta.requestedMaxPages === "auto" || typeof meta.requestedMaxPages === "number" ? meta.requestedMaxPages : "auto",
          effectiveMaxPages: typeof meta.effectiveMaxPages === "number" ? meta.effectiveMaxPages : undefined,
          pagesFetched: typeof meta.pagesFetched === "number" ? meta.pagesFetched : undefined,
          rowsFetched: typeof meta.rowsFetched === "number" ? meta.rowsFetched : undefined,
          uniqueCount,
          dedupedCount: typeof meta.dedupedCount === "number" ? meta.dedupedCount : undefined,
          completionRate,
          truncatedByHardCap: Boolean(meta.truncatedByHardCap),
          paginationSuspected: Boolean(meta.paginationSuspected),
        },
      };
    },
  }).catch((error: unknown) => {
    const fallback = error && typeof error === "object"
      ? error as { code?: string; message?: string; upstreamStatus?: number; diagnostics?: Record<string, unknown> }
      : {};
    return {
      error: {
        code: fallback.code ?? "INTERNAL",
        message: fallback.message ?? "gov24 sync failed",
        upstreamStatus: fallback.upstreamStatus,
        diagnostics: fallback.diagnostics,
      },
    };
  });

  if ("error" in built) {
    return { ok: false, error: built.error };
  }

  const snapshotMeta = built.snapshot.meta as Record<string, unknown>;
  return {
    ok: true,
    meta: {
      completionRate: typeof snapshotMeta.completionRate === "number" ? snapshotMeta.completionRate : undefined,
      uniqueCount: typeof snapshotMeta.uniqueCount === "number" ? snapshotMeta.uniqueCount : undefined,
      upstreamTotalCount: typeof snapshotMeta.upstreamTotalCount === "number" ? snapshotMeta.upstreamTotalCount : undefined,
      hardCapPages: typeof snapshotMeta.hardCapPages === "number" ? snapshotMeta.hardCapPages : hardCapPages,
      effectivePerPage: typeof snapshotMeta.effectivePerPage === "number" ? snapshotMeta.effectivePerPage : rows,
      pagesFetched: typeof snapshotMeta.pagesFetched === "number" ? snapshotMeta.pagesFetched : undefined,
      effectiveMaxPages: typeof snapshotMeta.effectiveMaxPages === "number" ? snapshotMeta.effectiveMaxPages : undefined,
      neededPagesEstimate: typeof snapshotMeta.neededPagesEstimate === "number" ? snapshotMeta.neededPagesEstimate : undefined,
      truncatedByHardCap: Boolean(snapshotMeta.truncatedByHardCap),
    },
  };
}
