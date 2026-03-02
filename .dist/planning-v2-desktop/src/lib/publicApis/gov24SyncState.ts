type Gov24SyncResult = {
  completionRate?: number;
  uniqueCount?: number;
  upstreamTotalCount?: number;
  pagesFetched?: number;
  effectiveMaxPages?: number;
  neededPagesEstimate?: number;
  truncatedByHardCap?: boolean;
};

let inFlightSync: Promise<Gov24SyncResult> | null = null;

export function isGov24SyncInFlight(): boolean {
  return inFlightSync !== null;
}

export async function runGov24SyncOnce(run: () => Promise<Gov24SyncResult>): Promise<Gov24SyncResult> {
  if (inFlightSync) return inFlightSync;
  inFlightSync = run().finally(() => {
    inFlightSync = null;
  });
  return inFlightSync;
}

