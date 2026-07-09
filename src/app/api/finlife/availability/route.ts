import { NextResponse } from "next/server";
import { MemoryCache } from "@/lib/cache/memoryCache";
import { getFinlifeProductsForHttp } from "@/lib/finlife/productsHttp";
import { FINLIFE_TOP_GROUPS } from "@/lib/finlife/topGroups";
import { type FinlifeKind } from "@/lib/finlife/types";

const cache = new MemoryCache<unknown>();

function isKind(value: string | null): value is FinlifeKind {
  return (
    value === "deposit" ||
    value === "saving" ||
    value === "pension" ||
    value === "mortgage-loan" ||
    value === "rent-house-loan" ||
    value === "credit-loan"
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    if (!isKind(kind)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "kind 쿼리가 올바르지 않습니다." } },
        { status: 400 },
      );
    }

    const pageNoRaw = Number(searchParams.get("pageNo") ?? "1");
    const pageNo = Number.isFinite(pageNoRaw) && pageNoRaw > 0 ? Math.floor(pageNoRaw) : 1;
    const cacheKey = `availability:${kind}:${pageNo}:${process.env.FINLIFE_MODE ?? "auto"}`;
    const hit = cache.get(cacheKey);
    if (hit) return NextResponse.json(hit);

    const rows = [] as Array<{
      topFinGrpNo: string;
      label: string;
      short: string;
      totalCount: number | null;
      status: "ok" | "missing" | "error";
      message?: string;
    }>;

    let mode: "mock" | "live" | "fixture" = "mock";

    for (const group of FINLIFE_TOP_GROUPS) {
      try {
        const url = new URL(request.url);
        url.searchParams.set("topFinGrpNo", group.id);
        url.searchParams.set("pageNo", String(pageNo));
        url.searchParams.delete("kind");
        const result = await getFinlifeProductsForHttp(kind, new Request(url.toString()));
        const payload = result.payload;
        mode = payload.mode;

        if (payload.ok) {
          rows.push({
            topFinGrpNo: group.id,
            label: group.label,
            short: group.short,
            totalCount: typeof payload.meta.totalCount === "number" ? payload.meta.totalCount : payload.data.length,
            status: "ok",
          });
          continue;
        }

        if (payload.error?.code === "REPLAY_MISSING") {
          rows.push({
            topFinGrpNo: group.id,
            label: group.label,
            short: group.short,
            totalCount: null,
            status: "missing",
            message: "fixture 미녹화",
          });
          continue;
        }

        rows.push({
          topFinGrpNo: group.id,
          label: group.label,
          short: group.short,
          totalCount: null,
          status: "error",
          message: payload.error?.message,
        });
      } catch {
        rows.push({
          topFinGrpNo: group.id,
          label: group.label,
          short: group.short,
          totalCount: null,
          status: "error",
          message: "availability 조회 중 오류",
        });
      }
    }

    const payload = {
      ok: true,
      mode,
      meta: {
        kind,
        generatedAt: new Date().toISOString(),
        pageNo,
      },
      data: rows,
    };

    cache.set(cacheKey, payload, 60 * 15);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "availability API 처리 중 오류가 발생했습니다." } },
      { status: 503 },
    );
  }
}
