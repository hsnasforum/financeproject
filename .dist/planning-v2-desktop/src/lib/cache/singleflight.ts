const inflightMap = new Map<string, Promise<unknown>>();

export async function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflightMap.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const next = fn().finally(() => {
    const current = inflightMap.get(key);
    if (current === next) {
      inflightMap.delete(key);
    }
  });

  inflightMap.set(key, next as Promise<unknown>);
  return next;
}

export function clearSingleflightForTest(): void {
  inflightMap.clear();
}
