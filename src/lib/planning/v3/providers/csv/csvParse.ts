export type ParseCsvTextResult = {
  header: string[] | null;
  rows: string[][];
};

export type ParseCsvTextOptions = {
  delimiter?: string;
  hasHeader?: boolean;
};

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
  const delimiter = options.delimiter ?? ",";
  const hasHeader = options.hasHeader !== false;
  const allRows = splitCsv(text, delimiter);

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
