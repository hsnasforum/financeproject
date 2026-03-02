export type EligibilityKey = "거주" | "연령" | "소득" | "재산" | "가구" | "기타";

export type EligibilityItem = { key: EligibilityKey; value: string };

const META_PATTERN = /(신청방법|소관기관|접수기관|신청기간|접수기간|전화문의|지원형태|관할)\s*[:：]/;

const KEY_PATTERNS: Array<{ key: EligibilityKey; pattern: RegExp }> = [
  { key: "거주", pattern: /거주|특별시|광역시|특별자치시|특별자치도|[가-힣]+도\s*거주|[가-힣]+시\s*거주/ },
  { key: "연령", pattern: /연령|만\s*\d+|\d+\s*~\s*\d+\s*세|\d+\s*세\s*(이상|이하)/ },
  { key: "소득", pattern: /소득|중위소득|원가구|가구소득|기준중위소득/ },
  { key: "재산", pattern: /재산|금액|억원|만원|총재산/ },
  { key: "가구", pattern: /가구|세대|부모님|신혼부부|자녀|무주택/ },
];

function splitSegmentByDelimiters(line: string): string[] {
  let s = line;
  s = s.replace(/[\u2022•●○◦▪]/g, " ");
  s = s.replace(/\s*[;|·]\s*/g, "\n");
  s = s.replace(/(?<!\d),(?!\d)/g, "\n");
  s = s.replace(/\n+/g, "\n");
  return s.split(/\n/).map((v) => v.trim()).filter(Boolean);
}

function normalizeSegment(segment: string): string {
  let s = segment;
  s = s.replace(/^[\s\-–—]+/, "");
  s = s.replace(/^\(?\s*[\u2022•●○◦▪\-]+\s*\)?/, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*\.+$/, "");
  s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  return s;
}

function isMetaSegment(segment: string): boolean {
  return META_PATTERN.test(segment);
}

function dedupeExact(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function dedupeByContainment(lines: string[]): string[] {
  const dropped = new Set<number>();
  const canon = lines.map((line) => line.replace(/\s+/g, ""));
  const indexes = lines.map((_, idx) => idx).sort((a, b) => canon[b].length - canon[a].length);

  for (let i = 0; i < indexes.length; i += 1) {
    const longIdx = indexes[i];
    if (dropped.has(longIdx)) continue;
    const longText = canon[longIdx];
    for (let j = i + 1; j < indexes.length; j += 1) {
      const shortIdx = indexes[j];
      if (dropped.has(shortIdx)) continue;
      const shortText = canon[shortIdx];
      if (shortText.length < 12) continue;
      if (longText.includes(shortText)) {
        dropped.add(shortIdx);
      }
    }
  }

  return lines.filter((_, idx) => !dropped.has(idx));
}

function mapTokenToKey(token: string): EligibilityKey | null {
  const t = token.replace(/\s+/g, "");
  if (!t) return null;
  for (const { key, pattern } of KEY_PATTERNS) {
    if (pattern.test(t)) return key;
  }
  return null;
}

function classifyLine(line: string): EligibilityKey {
  const colonIdx = line.search(/[:：]/);
  if (colonIdx > 0) {
    const token = line.slice(0, colonIdx).trim();
    const byToken = mapTokenToKey(token);
    if (byToken) return byToken;
  }
  for (const { key, pattern } of KEY_PATTERNS) {
    if (pattern.test(line)) return key;
  }
  return "기타";
}

function mergeValues(values: string[]): string {
  const text = values.join(" · ");
  if (text.length <= 240) return text;
  return `${text.slice(0, 239).trim()}…`;
}

export function normalizeEligibilityLines(rawLines: string[]): { items: EligibilityItem[]; raw: string[] } {
  const segments = rawLines
    .flatMap((line) => splitSegmentByDelimiters(line))
    .map((line) => normalizeSegment(line))
    .filter((line) => line.length > 0)
    .filter((line) => !isMetaSegment(line));

  const deduped = dedupeByContainment(dedupeExact(segments)).slice(0, 20);

  const grouped = new Map<EligibilityKey, string[]>();
  for (const line of deduped) {
    const key = classifyLine(line);
    const list = grouped.get(key) ?? [];
    if (!list.includes(line)) list.push(line);
    grouped.set(key, list);
  }

  const order: EligibilityKey[] = ["거주", "연령", "소득", "재산", "가구", "기타"];
  const items: EligibilityItem[] = [];
  for (const key of order) {
    const values = grouped.get(key) ?? [];
    if (values.length === 0) continue;
    items.push({ key, value: mergeValues(values) });
    if (items.length >= 8) break;
  }

  return { items, raw: deduped };
}
