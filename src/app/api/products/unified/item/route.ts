import { NextResponse } from "next/server";
import { isDebugEnabled, makeHttpError } from "../../../../../lib/http/apiError";
import { isSamplebankProductId, isSamplebankPublicAccessAllowed } from "@/lib/products/samplebankPolicy";
import { getUnifiedProductById, UnifiedInputError } from "@/lib/sources/unified";
import { getProductFreshnessSummary } from "@/lib/sources/productFreshness";
import type { UnifiedKind, UnifiedSourceId } from "@/lib/sources/types";

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
  if (isSamplebankProductId(id) && !isSamplebankPublicAccessAllowed()) {
    return NextResponse.json(
      {
        ok: false,
        error: makeHttpError("INPUT", "샘플 데이터 상품은 운영 공개 카탈로그에서 조회할 수 없습니다.", {
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
    const sourceIds = (item.sourceIds ?? [item.sourceId]).filter(
      (sourceId): sourceId is UnifiedSourceId => sourceId === "finlife" || sourceId === "datago_kdb" || sourceId === "samplebank",
    );
    const freshness = await getProductFreshnessSummary({
      kind: item.kind as UnifiedKind,
      sourceIds,
      checkedAt: generatedAt,
    });
    return NextResponse.json({
      ok: true,
      data: {
        item,
      },
      meta: {
        generatedAt,
        freshness,
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
