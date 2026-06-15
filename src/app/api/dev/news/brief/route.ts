import { NextResponse } from "next/server";
import { guardDevReadRequest } from "@/lib/dev/devGuards";
import { readNewsBrief } from "../../../../../lib/news/briefReader";

export async function GET(request: Request) {
  const blocked = guardDevReadRequest(request);
  if (blocked) return blocked;

  const data = readNewsBrief();
  return NextResponse.json({
    ok: true,
    data,
  });
}
