export type ParseCsvTextResult = {
  header: string[] | null;
  rows: string[][];
};

export type ParseCsvTextOptions = {
  delimiter?: string;
  hasHeader?: boolean;
};

export function stripUtf8Bom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function detectEncodingIssue(text: string): boolean {
  return text.includes("\uFFFD");
}

function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (quoted && line[i + 1] === "\"") {
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && ch === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectCsvDelimiter(text: string): "," | "\t" | ";" {
  const normalized = normalizeNewlines(stripUtf8Bom(text));
  const sample = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, 10);

  if (sample.length < 1) return ",";

  const candidates: Array<"," | "\t" | ";"> = [",", "\t", ";"];
  let best: {
    delimiter: "," | "\t" | ";";
    score: number;
    mean: number;
  } = {
    delimiter: ",",
    score: Number.NEGATIVE_INFINITY,
    mean: 0,
  };

  for (const delimiter of candidates) {
    const counts = sample.map((line) => countDelimiter(line, delimiter));
    const maxCount = Math.max(...counts);
    if (maxCount <= 0) continue;
    const mean = counts.reduce((sum, n) => sum + n, 0) / counts.length;
    const variance = counts.reduce((sum, n) => sum + ((n - mean) ** 2), 0) / counts.length;
    const score = mean - variance;

    if (
      score > best.score
      || (score === best.score && mean > best.mean)
    ) {
      best = { delimiter, score, mean };
    }
  }

  return best.score === Number.NEGATIVE_INFINITY ? "," : best.delimiter;
}

function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === "\"") {
      if (quoted && text[i + 1] === "\"") {
        cell += "\"";
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && ch === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((entry) => entry.trim().length > 0)) {
        rows.push(row.map((entry) => entry.trim()));
      }
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some((entry) => entry.trim().length > 0)) {
    rows.push(row.map((entry) => entry.trim()));
  }

  return rows;
}

export function parseCsvText(text: string, options: ParseCsvTextOptions = {}): ParseCsvTextResult {
  const normalizedText = normalizeNewlines(stripUtf8Bom(text));
  const delimiter = options.delimiter ?? detectCsvDelimiter(normalizedText);
  const hasHeader = options.hasHeader !== false;
  const allRows = splitCsv(normalizedText, delimiter);

  if (allRows.length === 0) {
    return { header: null, rows: [] };
  }

  if (!hasHeader) {
    return { header: null, rows: allRows };
  }

  return {
    header: allRows[0] ?? null,
    rows: allRows.slice(1),
  };
}
