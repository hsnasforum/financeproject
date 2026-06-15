import { NextResponse } from "next/server";
import { guardDevReadRequest } from "@/lib/dev/devGuards";
import { readDisclosureAlerts } from "../../../../../lib/dart/disclosureAlertsReader";

export async function GET(request: Request) {
  const blocked = guardDevReadRequest(request);
  if (blocked) return blocked;

  const data = readDisclosureAlerts();
  return NextResponse.json({
    ok: true,
    data,
    prefs: data.prefs,
    meta: data.meta,
  });
}
