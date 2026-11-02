import { NextResponse } from "next/server";
import { isDebugEnabled, makeHttpError } from "@/lib/http/apiError";
import {
  buildPublicDiagnosticMeta,
  logPublicApiDiagnostic,
  publicErrorMessage,
  type PublicApiDiagnosticCode,
} from "@/lib/http/publicApiDiagnostics";
import { getOrCreateTraceId, setTraceHeader } from "@/lib/observability/trace";
import {
  FSS_PENSION_GUARANTEED_AREAS,
  FSS_PENSION_PAGES,
  FSS_PENSION_PRODUCT_AREAS,
  FSS_PENSION_SOURCE,
} from "@/lib/publicApis/providers/fssPension.mjs";
import {
  PensionQueryError,
  evaluateGuaranteedFreshness,
  evaluateProductsFreshness,
  parsePensionQuery,
  queryGuaranteed,
  queryProducts,
  type PensionGuaranteedResponseData,
  type PensionProductsResponseData,
} from "@/lib/products/pensionQuery";
import {
  loadPensionGuaranteedSnapshot,
  loadPensionProductsSnapshot,
  type PensionSnapshotArea,
  type PensionSnapshotResult,
} from "@/lib/products/pensionSnapshots";

type Dataset = "products" | "guaranteed";

function sourceFor(dataset: Dataset) {
  return {
    name: FSS_PENSION_SOURCE.name,
    attribution: FSS_PENSION_SOURCE.attribution,
    pageUrl: FSS_PENSION_PAGES[dataset],
  };
}

function areaSummaries(areas: PensionSnapshotArea[], known: ReadonlyArray<{ code: number; label: string }>) {
  return known.map((area) => {
    const recorded = areas.find((entry) => entry.code === area.code);
    return {
      code: area.code,
      label: area.label,
      rowCount: recorded?.rowCount ?? null,
      excludedRowsWithoutProductInfo: recorded?.excludedRowsWithoutProductInfo ?? 0,
    };
  });
}

/** A missing snapshot (never collected) and an unreadable one are different failures; neither is an empty list. */
function snapshotFailure(
  result: Exclude<PensionSnapshotResult<unknown>, { status: "ok" }>,
  dataset: Dataset,
  traceId: string,
  debugEnabled: boolean,
) {
  const missing = result.status === "missing";
  const diagnosticCode: PublicApiDiagnosticCode = missing ? "PENSION_SNAPSHOT_MISSING" : "PENSION_SNAPSHOT_INVALID";
  const status = missing ? 409 : 500;
  logPublicApiDiagnostic({ route: "/api/products/pension", source: "fss_pension", traceId, status, code: diagnosticCode });
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: missing ? "SNAPSHOT_MISSING" : "SNAPSHOT_INVALID",
        message: publicErrorMessage(diagnosticCode),
      },
      meta: {
        ...buildPublicDiagnosticMeta(diagnosticCode, { traceId, debug: debugEnabled }),
        dataset,
        ...(debugEnabled && result.status === "invalid" ? { reason: result.reason } : {}),
      },
    },
    { status },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debugEnabled = isDebugEnabled(searchParams);
  const traceId = getOrCreateTraceId(request);

  let query;
  try {
    query = parsePensionQuery(searchParams);
  } catch (error) {
    if (!(error instanceof PensionQueryError)) throw error;
    return NextResponse.json(
      { ok: false, error: makeHttpError("INPUT", error.message, { debugEnabled }) },
      { status: 400 },
    );
  }

  const now = new Date();
  const meta = { checkedAt: now.toISOString() };

  if (query.dataset === "products") {
    const loaded = loadPensionProductsSnapshot();
    if (loaded.status !== "ok") return setTraceHeader(snapshotFailure(loaded, "products", traceId, debugEnabled), traceId);
    const snapshot = loaded.snapshot;
    return NextResponse.json({
      ok: true,
      data: {
        dataset: "products" as const,
        source: sourceFor("products"),
        asOf: snapshot.asOf,
        freshness: evaluateProductsFreshness(snapshot, now),
        areas: areaSummaries(snapshot.areas, FSS_PENSION_PRODUCT_AREAS),
        query,
        ...queryProducts(snapshot, query),
      } satisfies PensionProductsResponseData,
      meta,
    });
  }

  const loaded = loadPensionGuaranteedSnapshot();
  if (loaded.status !== "ok") return setTraceHeader(snapshotFailure(loaded, "guaranteed", traceId, debugEnabled), traceId);
  const snapshot = loaded.snapshot;
  return NextResponse.json({
    ok: true,
    data: {
      dataset: "guaranteed" as const,
      source: sourceFor("guaranteed"),
      asOf: snapshot.asOf,
      freshness: evaluateGuaranteedFreshness(snapshot, now),
      areas: areaSummaries(snapshot.areas, FSS_PENSION_GUARANTEED_AREAS),
      query,
      ...queryGuaranteed(snapshot, query),
    } satisfies PensionGuaranteedResponseData,
    meta,
  });
}
