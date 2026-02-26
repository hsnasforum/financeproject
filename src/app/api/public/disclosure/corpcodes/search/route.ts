import { NextResponse } from "next/server";
import { getCorpIndexPath, getCorpIndexStatus, loadCorpIndex, searchCorpIndex, type CorpCodeSort } from "@/lib/publicApis/dart/corpIndex";
import { buildMissingCorpIndexPayload } from "@/lib/publicApis/dart/missingIndex";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? searchParams.get("query") ?? "").trim();
  const sortRaw = (searchParams.get("sort") ?? "name").trim();
  const limitRaw = (searchParams.get("limit") ?? "50").trim();
  const debug = searchParams.get("debug") === "1";

  if (!query) {
    return NextResponse.json(
      {
        error: "INPUT",
        message: "q(query) 값을 입력하세요.",
      },
      { status: 400 },
    );
  }

  const sort = parseSort(sortRaw);
  if (!sort) {
    return NextResponse.json(
      {
        error: "INPUT",
        message: "sort는 name | name_desc | stock_first 중 하나여야 합니다.",
      },
      { status: 400 },
    );
  }

  const limit = parseLimit(limitRaw);
  if (!limit) {
    return NextResponse.json(
      {
        error: "INPUT",
        message: "limit는 1~100 범위의 숫자여야 합니다.",
      },
      { status: 400 },
    );
  }

  const index = loadCorpIndex();
  if (!index) {
    const status = getCorpIndexStatus();
    return NextResponse.json(
      {
        ...buildMissingCorpIndexPayload(status),
        primaryPath: status.primaryPath,
        path: getCorpIndexPath(),
        triedPaths: status.triedPaths,
      },
      { status: 409 },
    );
  }

  try {
    const result = searchCorpIndex({ query, sort, limit }, index);
    const payload: Record<string, unknown> = {
      items: result.items.map((item) => ({
        corpCode: item.corpCode,
        corpName: item.corpName,
        stockCode: item.stockCode,
      })),
      total: result.total,
      generatedAt: index.generatedAt,
    };

    if (debug) {
      payload.indexMeta = {
        loadedPath: getCorpIndexPath(),
        count: index.count,
        generatedAt: index.generatedAt,
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[disclosure] corp search failed", {
      query,
      sort,
      limit,
      reason: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "INTERNAL",
        message: "회사 검색 처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.",
      },
      { status: 500 },
    );
  }
}

function parseSort(value: string): CorpCodeSort | null {
  if (value === "name" || value === "name_desc" || value === "stock_first") {
    return value;
  }
  return null;
}

function parseLimit(value: string): number | null {
  const num = Number(value);
  if (!Number.isInteger(num)) return null;
  if (num < 1 || num > 100) return null;
  return num;
}
