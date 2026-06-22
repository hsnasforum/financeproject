import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import { type PlanningRouteUser } from "@/lib/planning/api/routeAuth";
import {
  cacheStats,
  getCacheUsageStats,
  purgeExpired,
} from "@/lib/planning/cache/storage";
import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";

export type PlanningNamespaceMeta = {
  planningNamespaceEnabled?: true;
};

export type OpsPlanningCacheStats = {
  entries: Awaited<ReturnType<typeof cacheStats>>;
  usage: Awaited<ReturnType<typeof getCacheUsageStats>> & {
    totalLookups: number;
    hitRate: number;
  };
};

type PlanningCachePurgeAuditInput = {
  result: "SUCCESS" | "ERROR";
  purged?: number;
  message: string;
  user: PlanningRouteUser;
};

export function planningNamespaceMeta(): PlanningNamespaceMeta {
  return isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {};
}

export async function getOpsPlanningCacheStats(): Promise<OpsPlanningCacheStats> {
  const [entryStats, usageStats] = await Promise.all([
    cacheStats(),
    getCacheUsageStats(),
  ]);

  const totalLookups = usageStats.totals.hits + usageStats.totals.misses;
  const hitRate = totalLookups > 0 ? usageStats.totals.hits / totalLookups : 0;

  return {
    entries: entryStats,
    usage: {
      ...usageStats,
      totalLookups,
      hitRate,
    },
  };
}

export async function purgeOpsPlanningCache(input: {
  user: PlanningRouteUser;
}): Promise<{
  result: Awaited<ReturnType<typeof purgeExpired>>;
  message: string;
}> {
  const result = await purgeExpired();
  const message = `만료 캐시 ${result.purged}건을 정리했습니다.`;

  appendPlanningCachePurgeAudit({
    result: "SUCCESS",
    purged: result.purged,
    message,
    user: input.user,
  });

  return { result, message };
}

export function auditOpsPlanningCachePurgeError(input: {
  message: string;
  user: PlanningRouteUser;
}): void {
  appendPlanningCachePurgeAudit({
    result: "ERROR",
    message: input.message,
    user: input.user,
  });
}

function appendPlanningCachePurgeAudit(input: PlanningCachePurgeAuditInput) {
  try {
    appendAuditLog({
      event: "PLANNING_CACHE_PURGE",
      route: "/api/ops/planning-cache/purge",
      summary: `PLANNING_CACHE_PURGE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        purged: input.purged ?? null,
        message: input.message,
        planningUserId: input.user.id,
        authSource: input.user.source,
        ...planningNamespaceMeta(),
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning cache purge log", error);
  }
}
