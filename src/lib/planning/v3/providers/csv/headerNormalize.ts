function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeHeader(header: string): string {
  return asString(header)
    .trim()
    .toLowerCase()
    .replace(/[()\[\]{}<>]/g, " ")
    .replace(/[^0-9a-zA-Z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
