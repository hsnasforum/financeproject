import { NextResponse } from "next/server";
import { onlyDev } from "@/lib/dev/onlyDev";
import { getKstTodayYYYYMMDD, fetchEximExchange } from "@/lib/publicApis/providers/exchange";
import { searchBenefits } from "@/lib/publicApis/providers/benefits";
import { listSubscriptionNotices } from "@/lib/publicApis/providers/subscription";
import { getHousingRentBenchmark, getHousingSalesBenchmark } from "@/lib/publicApis/providers/housing";
import { getFinlifeProducts } from "@/lib/finlife/source";

type SourceName =
  | "exim_exchange"
  | "mois_benefits"
  | "reb_subscription"
  | "finlife"
  | "molit_sales"
  | "molit_rent";

const SOURCE_SET = new Set<SourceName>([
  "exim_exchange",
  "mois_benefits",
  "reb_subscription",
  "finlife",
  "molit_sales",
  "molit_rent",
]);

function statusFromCode(code?: string): number {
  if (!code) return 502;
  if (code === "INPUT") return 400;
  if (code.startsWith("ENV_")) return 400;
  return 502;
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const source = (searchParams.get("source") ?? "").trim().toLowerCase() as SourceName;
  if (!SOURCE_SET.has(source)) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "source 파라미터를 확인하세요." } },
      { status: 400 },
    );
  }

  const fetchedAt = new Date().toISOString();

  try {
    if (source === "exim_exchange") {
      const result = await fetchEximExchange({ dateYYYYMMDD: getKstTodayYYYYMMDD() });
      if (!result.ok) return NextResponse.json({ ok: false, data: { source }, error: result.error }, { status: statusFromCode(result.error.code) });
      return NextResponse.json({
        ok: true,
        data: {
          source,
          success: true,
          summary: { asOf: result.data.asOf, rateCount: Object.keys(result.data.rates).length },
          fetchedAt,
        },
      });
    }

    if (source === "mois_benefits") {
      const result = await searchBenefits("", { mode: "all" });
      if (!result.ok) return NextResponse.json({ ok: false, data: { source }, error: result.error }, { status: statusFromCode(result.error.code) });
      const scannedRows = typeof result.meta?.scannedRows === "number" ? result.meta.scannedRows : 0;
      return NextResponse.json({
        ok: true,
        data: {
          source,
          success: scannedRows > 0,
          summary: {
            count: result.data.length,
            normalizedCount: typeof result.meta?.normalizedCount === "number" ? result.meta.normalizedCount : result.data.length,
            rawMatched: typeof result.meta?.rawMatched === "number" ? result.meta.rawMatched : undefined,
            dropStats: typeof result.meta?.dropStats === "object" ? result.meta.dropStats : undefined,
            scannedRows,
            matchedRows: typeof result.meta?.matchedRows === "number" ? result.meta.matchedRows : undefined,
            endpointPath: typeof result.meta?.endpointPath === "string" ? result.meta.endpointPath : undefined,
            resolvedFrom: typeof result.meta?.resolvedFrom === "string" ? result.meta.resolvedFrom : undefined,
            authMode: typeof result.meta?.authMode === "string" ? result.meta.authMode : undefined,
            scannedPages: typeof result.meta?.scannedPages === "number" ? result.meta.scannedPages : undefined,
          },
          fetchedAt,
        },
      });
    }

    if (source === "reb_subscription") {
      const result = await listSubscriptionNotices("전국", { mode: "all" });
      if (!result.ok) return NextResponse.json({ ok: false, data: { source }, error: result.error }, { status: statusFromCode(result.error.code) });
      const scannedRows = typeof result.meta?.scannedRows === "number" ? result.meta.scannedRows : 0;
      return NextResponse.json({
        ok: true,
        data: {
          source,
          success: scannedRows > 0,
          summary: {
            count: result.data.length,
            normalizedCount: typeof result.meta?.normalizedCount === "number" ? result.meta.normalizedCount : result.data.length,
            rawMatched: typeof result.meta?.rawMatched === "number" ? result.meta.rawMatched : undefined,
            dropStats: typeof result.meta?.dropStats === "object" ? result.meta.dropStats : undefined,
            scannedRows,
            matchedRows: typeof result.meta?.matchedRows === "number" ? result.meta.matchedRows : undefined,
            endpointPath: typeof result.meta?.endpointPath === "string" ? result.meta.endpointPath : undefined,
            resolvedFrom: typeof result.meta?.resolvedFrom === "string" ? result.meta.resolvedFrom : undefined,
            authMode: typeof result.meta?.authMode === "string" ? result.meta.authMode : undefined,
            scannedPages: typeof result.meta?.scannedPages === "number" ? result.meta.scannedPages : undefined,
          },
          fetchedAt,
        },
      });
    }

    if (source === "finlife") {
      const result = await getFinlifeProducts("deposit", { pageNo: 1, topFinGrpNo: "020000" });
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, data: { source }, error: result.error ?? { code: "UPSTREAM", message: "FINLIFE 조회 실패" } },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        data: {
          source,
          success: true,
          summary: { mode: result.mode, count: result.data.length },
          fetchedAt,
        },
      });
    }

    const month = new Date().toISOString().slice(0, 7).replace("-", "");
    if (source === "molit_sales") {
      const result = await getHousingSalesBenchmark("11680", month, "84");
      if (!result.ok) return NextResponse.json({ ok: false, data: { source }, error: result.error }, { status: 502 });
      return NextResponse.json({
        ok: true,
        data: {
          source,
          success: true,
          summary: { month: result.data.month, count: result.data.count },
          fetchedAt,
        },
      });
    }

    const result = await getHousingRentBenchmark("11680", month, "84");
    if (!result.ok) return NextResponse.json({ ok: false, data: { source }, error: result.error }, { status: 502 });
    return NextResponse.json({
      ok: true,
      data: {
        source,
        success: true,
        summary: { month: result.data.month, count: result.data.count },
        fetchedAt,
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        data: { source },
        error: { code: "INTERNAL", message: "연결 테스트 중 오류가 발생했습니다." },
      },
      { status: 500 },
    );
  }
}
