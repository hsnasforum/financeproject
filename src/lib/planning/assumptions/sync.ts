import { fetchKoreaAssumptions } from "./fetchers/korea.ts";
import { saveAssumptionsSnapshotToHistory, saveLatestAssumptionsSnapshot } from "./storage.ts";
import { type AssumptionsSnapshot } from "./types.ts";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning assumptions sync is server-only.");
  }
}

assertServerOnly();

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function latestDate(values: string[]): string | null {
  if (values.length === 0) return null;
  const uniqueSorted = Array.from(new Set(values))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
    .sort();
  if (uniqueSorted.length === 0) return null;
  return uniqueSorted[uniqueSorted.length - 1] ?? null;
}

function extractDateCandidatesFromSources(sources: AssumptionsSnapshot["sources"]): string[] {
  const dates: string[] = [];

  for (const source of sources) {
    const text = `${source.name} ${source.url}`;
    const matches = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
    dates.push(...matches);
  }

  return dates;
}

export type BuildAssumptionsSnapshotResult = {
  snapshot: AssumptionsSnapshot;
  snapshotId: string;
};

export async function buildAssumptionsSnapshot(): Promise<BuildAssumptionsSnapshotResult> {
  assertServerOnly();

  const fetchedAt = new Date().toISOString();
  const korea = await fetchKoreaAssumptions();

  const asOf = latestDate([
    ...(korea.asOfCandidate ? [korea.asOfCandidate] : []),
    ...extractDateCandidatesFromSources(korea.sources),
  ]) ?? todayIsoDate();

  const snapshot: AssumptionsSnapshot = {
    version: 1,
    asOf,
    fetchedAt,
    korea: korea.partial,
    sources: korea.sources,
    warnings: korea.warnings,
  };
  const { id: snapshotId } = await saveAssumptionsSnapshotToHistory(snapshot);
  await saveLatestAssumptionsSnapshot(snapshot);

  return {
    snapshot,
    snapshotId,
  };
}
