import { NextResponse } from "next/server";
import { MemoryCache } from "@/lib/cache/memoryCache";
import { getDartCompany } from "@/lib/publicApis/dart/company";
import { mapDartErrorToHttp } from "@/lib/publicApis/dart/opendartErrors";
import { type DartApiResult, type DartCompany } from "@/lib/publicApis/dart/types";

const cache = new MemoryCache<DartApiResult<DartCompany>>();
const TTL_SECONDS = 24 * 60 * 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const corpCode = (searchParams.get("corpCode") ?? "").trim();

  const cacheKey = `company:${corpCode}`;
  const hit = cache.get(cacheKey);
  if (hit) {
    return NextResponse.json(hit);
  }

  const result = await getDartCompany(corpCode);
  if (result.ok) {
    cache.set(cacheKey, result, TTL_SECONDS);
    return NextResponse.json(result);
  }

  return NextResponse.json(result, { status: mapDartErrorToHttp(result.error) });
}
