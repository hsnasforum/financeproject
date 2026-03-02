import { NextResponse } from "next/server";
import { readDisclosureAlerts } from "../../../../../lib/dart/disclosureAlertsReader";
import { onlyDev } from "../../../../../lib/dev/onlyDev";

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const data = readDisclosureAlerts();
  return NextResponse.json({
    ok: true,
    data,
    prefs: data.prefs,
    meta: data.meta,
  });
}
