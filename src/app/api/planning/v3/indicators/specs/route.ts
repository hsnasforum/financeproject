import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { SeriesSpecSchema } from "../../../../../../../planning/v3/indicators/contracts";
import {
  IndicatorCatalogRowSchema,
  buildIndicatorCatalogRows,
} from "../../../../../../../planning/v3/indicators/annotations";
import {
  IndicatorSpecsImportApplyResultSchema,
  IndicatorSpecsImportPreviewSchema,
  applyImportSeriesSpecs,
  exportSeriesSpecList,
  previewImportSeriesSpecs,
} from "../../../../../../../planning/v3/indicators/specOverrides";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";

const SpecsGetResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    specs: z.array(SeriesSpecSchema),
    catalog: z.array(IndicatorCatalogRowSchema),
  }),
});

const SpecsPostBodySchema = z.object({
  csrf: z.string().optional(),
  mode: z.enum(["dry_run", "apply"]),
  specs: z.array(z.unknown()).default([]),
});

const SpecsPostResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    mode: z.enum(["dry_run", "apply"]),
    preview: IndicatorSpecsImportPreviewSchema,
    applied: IndicatorSpecsImportApplyResultSchema.nullable(),
  }),
});

function toGuardResponse(error: unknown): Response {
  const guard = toGuardErrorResponse(error);
  if (!guard) {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { ok: false, error: { code: guard.code, message: guard.message } },
    { status: guard.status },
  );
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
  } catch (error) {
    return toGuardResponse(error);
  }

  const specs = exportSeriesSpecList();
  const catalog = buildIndicatorCatalogRows(specs);
  const payload = parseWithV3Whitelist(SpecsGetResponseSchema, {
    ok: true,
    data: { specs, catalog },
  }, { scope: "response", context: "api.v3.indicators.specs.get" });
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertCsrf(request, body as { csrf?: unknown } | null);
  } catch (error) {
    return toGuardResponse(error);
  }

  const parsed = SpecsPostBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "지표 스펙 import 요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const preview = previewImportSeriesSpecs(parsed.data.specs);
  const applied = parsed.data.mode === "apply"
    ? applyImportSeriesSpecs(parsed.data.specs)
    : null;

  const payload = parseWithV3Whitelist(SpecsPostResponseSchema, {
    ok: true,
    data: {
      mode: parsed.data.mode,
      preview,
      applied,
    },
  }, { scope: "response", context: "api.v3.indicators.specs.post" });
  return NextResponse.json(payload);
}
