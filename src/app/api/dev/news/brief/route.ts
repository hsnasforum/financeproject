import { NextResponse } from "next/server";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { readNewsBrief } from "../../../../../lib/news/briefReader";

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const data = readNewsBrief();
  return NextResponse.json({
    ok: true,
    data,
  });
}
