import { NextResponse } from "next/server";
import { getFinlifeProductsForHttp } from "@/lib/finlife/productsHttp";

export async function GET(request: Request) {
  const result = await getFinlifeProductsForHttp("saving", request);
  return NextResponse.json(result.payload, { status: result.status, headers: result.headers });
}
