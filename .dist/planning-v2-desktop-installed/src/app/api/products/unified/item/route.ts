import { NextResponse } from "next/server";
import { isDebugEnabled, makeHttpError } from "../../../../../lib/http/apiError";
import { getUnifiedProductById, UnifiedInputError } from "@/lib/sources/unified";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debugEnabled = isDebugEnabled(searchParams);
  const id = (searchParams.get("id") ?? "").trim();

  if (!id) {
    return NextResponse.json(
      {
        ok: false,
        error: makeHttpError("INPUT", "id는 필수입니다.", {
          debugEnabled,
        }),
      },
      { status: 400 },
    );
  }

  try {
    const item = await getUnifiedProductById({
      id,
      includeTimestamps: true,
    });

    if (!item) {
      return NextResponse.json(
        {
          ok: false,
          error: makeHttpError("NO_DATA", "요청한 통합 상품을 찾지 못했습니다.", {
            debugEnabled,
            debug: {
              id,
            },
          }),
        },
        { status: 404 },
      );
    }

    const generatedAt = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      data: {
        item,
      },
      meta: {
        generatedAt,
      },
    });
  } catch (error) {
    if (error instanceof UnifiedInputError) {
      return NextResponse.json(
        {
          ok: false,
          error: makeHttpError("INPUT", error.message, {
            debugEnabled,
            debug: {
              id,
            },
          }),
        },
        { status: 400 },
      );
    }

    console.error("[products/unified/item] failed", {
      id,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        ok: false,
        error: makeHttpError("UPSTREAM", "상품 상세 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", {
          debugEnabled,
          debug: {
            id,
            reason: error instanceof Error ? error.message : "unknown",
          },
        }),
      },
      { status: 502 },
    );
  }
}
