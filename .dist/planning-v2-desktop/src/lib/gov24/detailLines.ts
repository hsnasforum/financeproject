export function normalizeDetailLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

export function dedupeConsecutiveLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let prev = "";
  for (const raw of lines) {
    const norm = normalizeDetailLine(raw);
    if (!norm) continue;
    if (/^상동[.)]?$/.test(norm)) continue;
    if (norm === prev) continue;
    if (seen.has(norm)) continue;
    out.push(norm);
    prev = norm;
    seen.add(norm);
  }
  return out;
}
