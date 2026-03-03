export type ParseCsvTextResult = {
  header: string[] | null;
  rows: string[][];
};

export type ParseCsvTextOptions = {
  delimiter?: string;
  hasHeader?: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function stripUtf8Bom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

export function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export function detectEncodingIssue(text: string): boolean {
  return text.includes("\uFFFD");
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === "\"") {
      if (quoted && line[index + 1] === "\"") {
        index += 1;
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

function firstNonEmptyLine(text: string): string {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return line;
  }
  return "";
}

export function detectCsvDelimiter(text: string): "," | "\t" | ";" {
  const source = normalizeNewlines(stripUtf8Bom(asString(text)));
  const headerLine = firstNonEmptyLine(source);
  if (!headerLine) return ",";

  const commaCount = countDelimiterOutsideQuotes(headerLine, ",");
  const tabCount = countDelimiterOutsideQuotes(headerLine, "\t");
  const semicolonCount = countDelimiterOutsideQuotes(headerLine, ";");

  if (tabCount > commaCount && tabCount >= semicolonCount) return "\t";
  if (semicolonCount > commaCount && semicolonCount > tabCount) return ";";
  return ",";
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
  const normalizedText = normalizeNewlines(stripUtf8Bom(asString(text)));
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
