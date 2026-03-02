import { NextResponse } from "next/server";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { getOrCreateVaultCsrfToken, setVaultCsrfCookie } from "../../../../../lib/planning/security/vaultCsrf";
import { getVaultStatus } from "../../../../../lib/planning/security/vaultState";
import { guardLocalRequest, withVaultCsrf } from "../_lib";

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const status = await getVaultStatus();
  const csrfToken = getOrCreateVaultCsrfToken(request);
  const response = NextResponse.json({ ok: true, data: status, csrfToken });
  return setVaultCsrfCookie(response, csrfToken);
}
