import { searchBenefits } from "../../../../../lib/publicApis/providers/benefits";
import { getBenefitQualityBucket } from "../../../../../lib/publicApis/benefitsQuality";
import { csvEscape } from "../../../../../lib/publicApis/benefitsCsv";
import { type BenefitCandidate } from "../../../../../lib/publicApis/contracts/types";

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parseMaxPages(value: string | null, fallback: number): number | "auto" {
  if (!value || value.trim() === "") return fallback;
  if (value.trim().toLowerCase() === "auto") return "auto";
  return parsePositiveInt(value, fallback, 1, 80);
}

function toExportRows(items: BenefitCandidate[]) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    org: item.org ?? "",
    summary: item.summary ?? "",
    applyHow: item.applyHow ?? "",
    regionScope: item.region.scope,
    regionTags: (item.region.tags ?? []).join("|"),
    qualityBucket: getBenefitQualityBucket(item),
    chips: (item.eligibilityChips ?? []).join("|"),
    eligibilityExcerpt: item.eligibilityExcerpt ?? "",
    contact: item.contact ?? "",
    link: item.link ?? "",
  }));
}

export async function GET(request: Request) {
  if ((process.env.NODE_ENV ?? "development") !== "development") {
    return new Response(JSON.stringify({ ok: false, error: "NOT_FOUND" }), { status: 404, headers: { "content-type": "application/json" } });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "csv").trim().toLowerCase();
  const scan = (searchParams.get("scan") ?? "all").trim().toLowerCase();
  const query = (searchParams.get("query") ?? "").trim();
  const maxPages = parseMaxPages(searchParams.get("maxPages"), 20);
  const rows = parsePositiveInt(searchParams.get("rows"), 200, 50, 300);
  const limit = parsePositiveInt(searchParams.get("limit"), 5000, 100, 10000);

  const result = await searchBenefits(query, {
    mode: "all",
    scanPages: scan === "all" ? maxPages : 1,
    rows,
    limit,
    maxMatches: Math.max(limit, (typeof maxPages === "number" ? maxPages : 20) * rows),
  });
  if (!result.ok) {
    return new Response(JSON.stringify(result), { status: 502, headers: { "content-type": "application/json" } });
  }

  const rowsOut = toExportRows(result.data);
  if (format === "json") {
    return new Response(
      JSON.stringify({ ok: true, count: rowsOut.length, items: rowsOut }, null, 2),
      { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="benefits-export.json"' } },
    );
  }

  const headers = ["id", "title", "org", "summary", "applyHow", "regionScope", "regionTags", "qualityBucket", "chips", "eligibilityExcerpt", "contact", "link"];
  const lines = [headers.join(",")];
  for (const row of rowsOut) {
    lines.push(headers.map((key) => csvEscape(row[key as keyof typeof row])).join(","));
  }
  const csv = `\uFEFF${lines.join("\n")}`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="benefits-export.csv"',
    },
  });
}
