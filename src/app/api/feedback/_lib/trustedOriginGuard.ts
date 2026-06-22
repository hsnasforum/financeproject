import { NextResponse } from "next/server";
import { decideTrustedOrigin, parseHostPatterns } from "@/lib/security/trustedOrigin";

export function guardFeedbackMutationOrigin(request: Request): NextResponse | null {
  const decision = decideTrustedOrigin(request.headers, {
    allowLoopbackEquivalence: true,
    trustedOriginHosts: parseHostPatterns(process.env.TRUSTED_ORIGIN_HOSTS),
    trustedForwardHosts: parseHostPatterns(process.env.TRUSTED_FORWARD_HOSTS),
  });
  if (decision.ok) return null;

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: decision.code,
        message: decision.message,
        ...(decision.hint ? { hint: decision.hint } : {}),
      },
    },
    { status: 403 },
  );
}
