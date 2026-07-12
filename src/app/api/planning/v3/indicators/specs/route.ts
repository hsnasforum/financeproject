import {
  NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { IndicatorCatalogRowSchema, buildIndicatorCatalogRows } from "@/lib/planning/v3/indicators/annotations";
import { SeriesSpecSchema } from "@/lib/planning/v3/indicators/contracts";
import {
  IndicatorSpecsImportApplyResultSchema,
  IndicatorSpecsImportPreviewSchema,
  IndicatorConfigError,
  applyImportSeriesSpecs,
  exportSeriesSpecList,
  previewImportSeriesSpecs,
} from "@/lib/planning/v3/indicators/specOverrides";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";

const UserMetaSchema = z.object({
  userId: z.string().min(1),
  authSource: z.enum(["auth-session", "trusted-header", "local-namespace"]),
});

const SpecsGetResponseSchema = z.object({
  ok: z.literal(true),
  meta: UserMetaSchema,
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
  meta: UserMetaSchema,
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

function toIndicatorConfigResponse(
  error: unknown,
  meta: Record<string, string>,
): Response | null {
  if (!(error instanceof IndicatorConfigError)) return null;
  const isRuntimeOverride = error.code === "INVALID_RUNTIME_OVERRIDES";
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: isRuntimeOverride ? "STORAGE_CORRUPT" : "INDICATOR_CONFIG_INVALID",
        message: isRuntimeOverride
          ? "저장된 지표 설정을 읽을 수 없습니다. 설정 파일을 점검해 주세요."
          : "지표 compatibility 설정을 읽을 수 없습니다. 배포 설정을 점검해 주세요.",
      },
      meta,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return toGuardResponse(error);
  }

  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);
    try {
      const specs = exportSeriesSpecList();
      const catalog = buildIndicatorCatalogRows(specs);
      const payload = parseWithV3Whitelist(SpecsGetResponseSchema, {
        ok: true,
        meta: userMeta,
        data: { specs, catalog },
      }, { scope: "response", context: "api.v3.indicators.specs.get" });
      return NextResponse.json(payload);
    } catch (error) {
      const configResponse = toIndicatorConfigResponse(error, userMeta);
      if (configResponse) return configResponse;
      throw error;
    }
  });
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    assertSameOrigin(request);
    requireCsrf(request, body as { csrf?: unknown } | null, { allowWhenCookieMissing: true });
  } catch (error) {
    return toGuardResponse(error);
  }

  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const parsed = SpecsPostBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "지표 스펙 import 요청 형식이 올바르지 않습니다." }, meta: userMeta },
        { status: 400 },
      );
    }

    try {
      const preview = previewImportSeriesSpecs(parsed.data.specs);
      const applied = parsed.data.mode === "apply"
        ? applyImportSeriesSpecs(parsed.data.specs)
        : null;

      const payload = parseWithV3Whitelist(SpecsPostResponseSchema, {
        ok: true,
        meta: userMeta,
        data: {
          mode: parsed.data.mode,
          preview,
          applied,
        },
      }, { scope: "response", context: "api.v3.indicators.specs.post" });
      return NextResponse.json(payload);
    } catch (error) {
      const configResponse = toIndicatorConfigResponse(error, userMeta);
      if (configResponse) return configResponse;
      throw error;
    }
  });
}
