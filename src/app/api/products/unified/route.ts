import { NextResponse } from "next/server";
import {
  getUnifiedProducts,
  UnifiedInputError,
  type UnifiedMode,
} from "@/lib/sources/unified";
import { parseIncludeSources } from "@/lib/sources/includeSources";
import type { UnifiedSourceId } from "@/lib/sources/types";

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseEnrichSources(input: string | null): Array<"datago_kdb"> {
  if (!input || !input.trim()) return [];
  const picked = new Set<"datago_kdb">();
  for (const token of input.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)) {
    if (token === "datago_kdb") picked.add(token);
  }
  return [...picked];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = (searchParams.get("kind") ?? "deposit").trim().toLowerCase();
    if (kind !== "deposit" && kind !== "saving") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INPUT",
            message: "kind는 deposit 또는 saving 이어야 합니다.",
          },
        },
        { status: 400 },
      );
    }

    const includeSourcesValues = searchParams.getAll("includeSources");
    const includeSources = parseIncludeSources(
      includeSourcesValues.length > 0 ? includeSourcesValues : searchParams.get("includeSources"),
    );
    const sourceIdRaw = searchParams.get("sourceId");
    if (sourceIdRaw && !["finlife", "datago_kdb"].includes(sourceIdRaw)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INPUT",
            message: "sourceId는 finlife, datago_kdb 중 하나여야 합니다.",
          },
        },
        { status: 400 },
      );
    }
    const sourceId = (sourceIdRaw && ["finlife", "datago_kdb"].includes(sourceIdRaw))
      ? (sourceIdRaw as UnifiedSourceId)
      : null;
    const cursor = searchParams.get("cursor");
    const q = searchParams.get("q");
    const qMode = (searchParams.get("qMode") ?? "contains").trim().toLowerCase();
    const queryMode = qMode === "prefix" ? "prefix" : "contains";
    const modeRaw = (searchParams.get("mode") ?? "merged").trim().toLowerCase();
    const mode: UnifiedMode = modeRaw === "integrated" ? "integrated" : "merged";
    const debugRequested = searchParams.get("debug") === "1";
    const canExposeDiagnostics = process.env.NODE_ENV !== "production" || process.env.UNIFIED_DEBUG_ALLOW_IN_PROD === "1";
    const debug = debugRequested && canExposeDiagnostics;
    const refresh = searchParams.get("refresh") === "1";
    const onlyNew = searchParams.get("onlyNew") === "1";
    const changedSince = searchParams.get("changedSince");
    const includeTimestamps = searchParams.get("includeTimestamps") === "1";
    const enrichSources = parseEnrichSources(searchParams.get("enrichSources"));
    const depositProtectionRaw = (searchParams.get("depositProtection") ?? "any").trim().toLowerCase();
    const depositProtection = (depositProtectionRaw === "prefer" || depositProtectionRaw === "require")
      ? depositProtectionRaw
      : "any";
    const includeKdbOnly = searchParams.get("includeKdbOnly") === "1";
    const limit = parsePositiveInt(searchParams.get("limit"), 200, 1, 1000);
    const sort = (searchParams.get("sort") ?? "recent").trim().toLowerCase();
    const sortMode = sort === "name" ? "name" : "recent";
    if (mode === "integrated") {
      if (!includeSources.includes("finlife")) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "INPUT",
              message: "Integrated mode requires finlife as canonical source.",
            },
          },
          { status: 400 },
        );
      }
      if (cursor) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "INPUT",
              message: "Cursor pagination is not supported in integrated mode.",
            },
          },
          { status: 400 },
        );
      }
    }
    if (cursor && (!sourceId || includeSources.length !== 1 || includeSources[0] !== sourceId)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INPUT",
            message: "Cursor pagination requires single sourceId.",
          },
        },
        { status: 400 },
      );
    }
    if (mode !== "integrated" && enrichSources.length > 0) {
      const singleFinlife = sourceId === "finlife" && includeSources.length === 1 && includeSources[0] === "finlife";
      if (!singleFinlife) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "INPUT",
              message: "enrichSources requires single sourceId=finlife",
            },
          },
          { status: 400 },
        );
      }
    }

    const data = await getUnifiedProducts({
      kind,
      mode,
      includeSources,
      sourceId,
      cursor,
      q,
      refresh,
      onlyNew,
      changedSince,
      includeTimestamps,
      limit,
      sort: sortMode,
      qMode: queryMode,
      enrichSources,
      depositProtection,
      includeKdbOnly,
      debug,
    });

    const itemRows = Array.isArray(data.items) ? data.items : [];
    const coverage = {
      totalProducts: itemRows.length,
      kdbBadged: itemRows.filter((item) => Array.isArray(item.badges) && item.badges.includes("KDB_MATCHED")).length,
    };

    return NextResponse.json({
      ok: true,
      data,
      coverage,
      ...(debug ? { diagnostics: data.diagnostics } : {}),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof UnifiedInputError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INPUT",
            message: error.message,
          },
        },
        { status: 400 },
      );
    }
    console.error("[products/unified] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM",
          message: "현재 데이터를 갱신하지 못했어요. 잠시 후 다시 시도해주세요.",
        },
      },
      { status: 502 },
    );
  }
}
