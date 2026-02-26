export function normalizeIssuePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "form";
  if (trimmed.startsWith("input.")) return trimmed.slice("input.".length);
  return trimmed;
}

export function pathToId(path: string): string {
  const normalized = normalizeIssuePath(path);
  const replaced = normalized
    .replace(/\[(\d+)\]/g, "_$1")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!replaced) return "field";
  if (!/^[A-Za-z]/.test(replaced)) return `field_${replaced}`;
  return replaced;
}
