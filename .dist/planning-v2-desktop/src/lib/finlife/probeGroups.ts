import { fetchLiveFinlife } from "./fetchLive";
import { extractPagingMeta } from "./meta";
import { type FinlifeSnapshotKind } from "./snapshot";

export type ProbeKind = FinlifeSnapshotKind;

export type ProbeHit = {
  kind: ProbeKind;
  group: string;
  hasData: boolean;
  totalCount?: number;
};

export type ProbeFailure = {
  kind: ProbeKind;
  group: string;
  status?: number | null;
  code?: string;
};

export type ProbeAggregate = {
  validByKind: Record<ProbeKind, string[]>;
  countsByKindAndGroup: Record<ProbeKind, Record<string, number>>;
  recommendedGroups: string[];
  failures: ProbeFailure[];
};

function toCode(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, "").trim();
  return cleaned.padStart(6, "0").slice(0, 6);
}

export function parseProbeCandidates(raw?: string): string[] {
  const fromEnv = (raw ?? "").trim();
  if (fromEnv) {
    const parsed = fromEnv.split(",").map((v) => toCode(v)).filter((v) => /^\d{6}$/.test(v));
    return [...new Set(parsed)].sort();
  }

  const generated: string[] = [];
  for (let n = 10_000; n <= 90_000; n += 10_000) {
    generated.push(String(n).padStart(6, "0"));
  }
  return generated;
}

function parseHttpStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/HTTP\s*(\d{3})/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function hasRows(raw: unknown): { hasData: boolean; totalCount?: number } {
  const root = (raw as { result?: { baseList?: unknown[]; optionList?: unknown[]; data?: unknown[] } })?.result ?? {};
  const baseList = Array.isArray(root.baseList) ? root.baseList : [];
  const optionList = Array.isArray(root.optionList) ? root.optionList : [];
  const data = Array.isArray(root.data) ? root.data : [];
  const meta = extractPagingMeta(raw);
  const totalCount = typeof meta.totalCount === "number" ? meta.totalCount : undefined;
  const hasData = Boolean((totalCount ?? 0) > 0 || baseList.length > 0 || optionList.length > 0 || data.length > 0);
  return { hasData, totalCount };
}

export function aggregateProbeResults(hits: ProbeHit[], failures: ProbeFailure[]): ProbeAggregate {
  const validByKind: Record<ProbeKind, string[]> = { deposit: [], saving: [] };
  const countsByKindAndGroup: Record<ProbeKind, Record<string, number>> = { deposit: {}, saving: {} };

  for (const hit of hits) {
    if (!hit.hasData) continue;
    if (!validByKind[hit.kind].includes(hit.group)) validByKind[hit.kind].push(hit.group);
    if (typeof hit.totalCount === "number") countsByKindAndGroup[hit.kind][hit.group] = hit.totalCount;
  }

  validByKind.deposit.sort();
  validByKind.saving.sort();

  const recommendedGroups = [...new Set([...validByKind.deposit, ...validByKind.saving])].sort();

  return {
    validByKind,
    countsByKindAndGroup,
    recommendedGroups,
    failures,
  };
}

export async function probeFinlifeGroups(candidates: string[]): Promise<ProbeAggregate> {
  const hits: ProbeHit[] = [];
  const failures: ProbeFailure[] = [];
  const kinds: ProbeKind[] = ["deposit", "saving"];

  for (const kind of kinds) {
    for (const group of candidates) {
      try {
        const raw = await fetchLiveFinlife(kind, {
          topFinGrpNo: group,
          pageNo: 1,
          scan: "page",
          scanMaxPages: "auto",
        });
        const parsed = hasRows(raw);
        hits.push({ kind, group, hasData: parsed.hasData, totalCount: parsed.totalCount });
      } catch (error) {
        failures.push({ kind, group, status: parseHttpStatus(error), code: "FETCH_FAILED" });
      }
    }
  }

  return aggregateProbeResults(hits, failures);
}
