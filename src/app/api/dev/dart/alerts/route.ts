import { NextResponse } from "next/server";
import { readDisclosureAlerts } from "../../../../../lib/dart/disclosureAlertsReader";

export async function GET() {
  const data = readDisclosureAlerts();
  return NextResponse.json({
    ok: true,
    data,
    prefs: data.prefs,
    meta: data.meta,
  });
}
