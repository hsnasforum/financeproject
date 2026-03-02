import { NextResponse } from "next/server";
import { getDataSourceStatuses } from "@/lib/dataSources/registry";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: getDataSourceStatuses(),
    fetchedAt: new Date().toISOString(),
  });
}
