import { NextResponse } from "next/server";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../../../lib/dev/devGuards";
import { buildCorpCodesIndex } from "../../../../../../lib/publicApis/dart/corpIndexBuildService";
import { canBuildCorpIndex } from "../../../../../../lib/publicApis/dart/indexBuildGuard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const nodeEnv = (process.env.NODE_ENV ?? "development").trim();
  if (nodeEnv === "production") {
    const guard = canBuildCorpIndex({
      nodeEnv,
      configuredToken: process.env.DART_INDEX_BUILD_TOKEN,
      requestToken: request.headers.get("x-build-token"),
    });
    if (!guard.allowed) {
      return NextResponse.json(
        {
          ok: false,
          message: "빌드 권한이 없습니다.",
        },
        { status: 403 },
      );
    }
  } else {
    try {
      assertLocalHost(request);
      assertSameOrigin(request);
    } catch (error) {
      const guard = toGuardErrorResponse(error);
      if (guard) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: guard.code,
              message: guard.message,
            },
          },
          { status: guard.status },
        );
      }
      throw error;
    }
  }

  const result = await buildCorpCodesIndex();
  return NextResponse.json(result.payload, { status: result.status });
}
