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
import { NEWS_SOURCES } from "../../../../../../../planning/v3/news/sources";
import { NEWS_TOPICS } from "../../../../../../../planning/v3/news/taxonomy";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";
import {
  loadEffectiveNewsConfig,
  readNewsSettings,
  writeNewsSettings,
} from "../../../../../../../planning/v3/news/settings";

const SourceOverrideInputSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  weight: z.number().finite().optional().nullable(),
});

const TopicOverrideInputSchema = z.object({
  id: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).optional(),
});

const SaveBodySchema = z.object({
  csrf: z.string().optional(),
  sources: z.array(SourceOverrideInputSchema).default([]),
  topics: z.array(TopicOverrideInputSchema).default([]),
});

const SettingsGetResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    updatedAt: z.string().datetime().nullable(),
    sources: z.array(z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      feedUrl: z.string().trim().min(1),
      country: z.string().trim().min(1),
      language: z.string().trim().min(1),
      defaultEnabled: z.boolean(),
      defaultWeight: z.number().finite(),
      overrideEnabled: z.boolean().nullable(),
      overrideWeight: z.number().finite().nullable(),
      effectiveEnabled: z.boolean(),
      effectiveWeight: z.number().finite(),
    })),
    topics: z.array(z.object({
      id: z.string().trim().min(1),
      label: z.string().trim().min(1),
      defaultKeywords: z.array(z.string()),
      overrideKeywords: z.array(z.string()).nullable(),
      effectiveKeywords: z.array(z.string()),
    })),
  }),
});

const SettingsPostResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    updatedAt: z.string().datetime().nullable(),
    sourcesCount: z.number().int().nonnegative(),
    topicsCount: z.number().int().nonnegative(),
  }),
});

function dedupeKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const token = value.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const settings = readNewsSettings();
  const effective = loadEffectiveNewsConfig();
  const sourceOverrideById = new Map(settings.sources.map((row) => [row.id, row]));
  const topicOverrideById = new Map(settings.topics.map((row) => [row.id, row]));
  const defaultSourceById = new Map(NEWS_SOURCES.map((row) => [row.id, row]));

  const data = {
    updatedAt: settings.updatedAt ?? null,
    sources: effective.sources.map((source) => {
      const base = defaultSourceById.get(source.id);
      const override = sourceOverrideById.get(source.id);
      return {
        id: source.id,
        name: source.name,
        feedUrl: source.feedUrl,
        country: source.country,
        language: source.language,
        defaultEnabled: base?.enabled ?? source.enabled,
        defaultWeight: base?.weight ?? source.weight,
        overrideEnabled: typeof override?.enabled === "boolean" ? override.enabled : null,
        overrideWeight: Number.isFinite(override?.weight) ? Number(override?.weight) : null,
        effectiveEnabled: source.enabled,
        effectiveWeight: source.weight,
      };
    }).sort((a, b) => a.id.localeCompare(b.id)),
    topics: NEWS_TOPICS.map((topic) => {
      const override = topicOverrideById.get(topic.id);
      const merged = effective.topics.find((row) => row.id === topic.id) ?? topic;
      return {
        id: topic.id,
        label: topic.label,
        defaultKeywords: topic.keywords,
        overrideKeywords: Array.isArray(override?.keywords) ? override.keywords : null,
        effectiveKeywords: merged.keywords,
      };
    }),
  };

  const payload = parseWithV3Whitelist(SettingsGetResponseSchema, { ok: true, data }, {
    scope: "response",
    context: "api.v3.news.settings.get",
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
      { ok: false, error: { code: "INPUT", message: "설정 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const effective = loadEffectiveNewsConfig();
  const allowedSourceIds = new Set(effective.sources.map((row) => row.id));
  const topicIds = new Set(NEWS_TOPICS.map((row) => row.id));
  const current = readNewsSettings();

  const next = writeNewsSettings({
    ...current,
    sources: parsed.data.sources
      .filter((row) => allowedSourceIds.has(row.id))
      .map((row) => ({
        id: row.id,
        enabled: typeof row.enabled === "boolean" ? row.enabled : undefined,
        weight: typeof row.weight === "number" && Number.isFinite(row.weight) ? row.weight : undefined,
      }))
      .filter((row) => typeof row.enabled === "boolean" || Number.isFinite(row.weight)),
    topics: parsed.data.topics
      .filter((row) => topicIds.has(row.id))
      .map((row) => ({
        id: row.id,
        keywords: Array.isArray(row.keywords) ? dedupeKeywords(row.keywords) : undefined,
      }))
      .filter((row) => Array.isArray(row.keywords)),
    customSources: current.customSources ?? [],
  });

  const payload = parseWithV3Whitelist(SettingsPostResponseSchema, {
    ok: true,
    data: {
      updatedAt: next.updatedAt ?? null,
      sourcesCount: next.sources.length,
      topicsCount: next.topics.length,
    },
  }, {
    scope: "response",
    context: "api.v3.news.settings.post",
  });
  return NextResponse.json(payload);
}
