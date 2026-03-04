import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  SCENARIO_LIBRARY_SSOT,
  ScenarioLibraryOverrideItemSchema,
  loadEffectiveScenarioLibrary,
  readScenarioLibraryOverrides,
  writeScenarioLibraryOverrides,
} from "../../../../../../../planning/v3/scenarios/library";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";

const SaveBodySchema = z.object({
  csrf: z.string().optional(),
  items: z.array(ScenarioLibraryOverrideItemSchema).default([]),
});

const LibraryRowSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  defaultEnabled: z.boolean(),
  defaultOrder: z.number().int().nonnegative(),
  overrideEnabled: z.boolean().nullable(),
  overrideOrder: z.number().int().nonnegative().nullable(),
  effectiveEnabled: z.boolean(),
  effectiveOrder: z.number().int().nonnegative(),
});

const GetResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    updatedAt: z.string().datetime().nullable(),
    rows: z.array(LibraryRowSchema),
  }),
});

const PostResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    updatedAt: z.string().datetime().nullable(),
    rows: z.array(LibraryRowSchema),
    overrideCount: z.number().int().nonnegative(),
  }),
});

function withReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    return null;
  } catch (error) {
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
}

function withWriteGuard(request: Request, body: unknown): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body as { csrf?: unknown } | null);
    return null;
  } catch (error) {
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
}

function toRows() {
  const effective = loadEffectiveScenarioLibrary();
  const overrides = readScenarioLibraryOverrides();
  const overrideByTopic = new Map(
    overrides.items.map((row) => [row.topicId.toLowerCase(), row] as const),
  );
  const defaultByTopic = new Map(
    SCENARIO_LIBRARY_SSOT.map((row) => [row.topicId.toLowerCase(), row] as const),
  );

  return {
    updatedAt: overrides.updatedAt ?? null,
    rows: effective.entries.map((row) => {
      const key = row.topicId.toLowerCase();
      const override = overrideByTopic.get(key);
      const fallback = defaultByTopic.get(key) ?? row;
      return {
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        defaultEnabled: fallback.enabled,
        defaultOrder: fallback.order,
        overrideEnabled: typeof override?.enabled === "boolean" ? override.enabled : null,
        overrideOrder: Number.isInteger(override?.order) ? Number(override?.order) : null,
        effectiveEnabled: row.enabled,
        effectiveOrder: row.order,
      };
    }),
  };
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const data = toRows();
  const payload = parseWithV3Whitelist(GetResponseSchema, {
    ok: true,
    data,
  }, {
    scope: "response",
    context: "api.v3.scenarios.library.get",
  });
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

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const parsed = SaveBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "시나리오 라이브러리 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const allowedTopicIds = new Set(SCENARIO_LIBRARY_SSOT.map((row) => row.topicId.toLowerCase()));
  const items = parsed.data.items
    .filter((row) => allowedTopicIds.has(row.topicId.toLowerCase()))
    .map((row) => ({
      topicId: row.topicId.toLowerCase(),
      enabled: typeof row.enabled === "boolean" ? row.enabled : undefined,
      order: Number.isInteger(row.order) ? Number(row.order) : undefined,
    }));

  const written = writeScenarioLibraryOverrides({ items });
  const data = toRows();
  const payload = parseWithV3Whitelist(PostResponseSchema, {
    ok: true,
    data: {
      ...data,
      overrideCount: written.items.length,
    },
  }, {
    scope: "response",
    context: "api.v3.scenarios.library.post",
  });
  return NextResponse.json(payload);
}
