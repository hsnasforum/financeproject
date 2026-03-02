export type GroupOpenState = Record<string, boolean>;

export function toggleOpen(prev: GroupOpenState, key: string): GroupOpenState {
  return {
    ...prev,
    [key]: !prev[key],
  };
}

export function pruneOpen(prev: GroupOpenState, validKeys: string[]): GroupOpenState {
  const valid = new Set(validKeys);
  const next: GroupOpenState = {};
  for (const [key, isOpen] of Object.entries(prev)) {
    if (!valid.has(key)) continue;
    next[key] = isOpen;
  }
  return next;
}
