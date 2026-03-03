import { type CsvDelimiter } from "./types";

const CANDIDATE_DELIMITERS: CsvDelimiter[] = [",", "\t", ";"];

function splitRowByDelimiter(row: string, delimiter: CsvDelimiter): number {
  if (!row.trim()) return 0;
  let count = 1;
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (ch === "\"") {
      if (quoted && row[i + 1] === "\"") {
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

export function detectDelimiter(csvText: string): CsvDelimiter {
  const lines = csvText
    .split(/\r\n|\n|\r/g)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, 10);
  if (lines.length < 1) return ",";

  let best: { delimiter: CsvDelimiter; avgCols: number; variance: number } = {
    delimiter: ",",
    avgCols: 0,
    variance: Number.POSITIVE_INFINITY,
  };

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const cols = lines.map((line) => splitRowByDelimiter(line, delimiter)).filter((count) => count > 0);
    if (cols.length < 1) continue;
    const avg = cols.reduce((sum, value) => sum + value, 0) / cols.length;
    const variance = cols.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / cols.length;

    const betterByCols = avg > best.avgCols + 0.001;
    const tieByCols = Math.abs(avg - best.avgCols) <= 0.001;
    const betterByVariance = tieByCols && variance < best.variance;

    if (betterByCols || betterByVariance) {
      best = { delimiter, avgCols: avg, variance };
    }
  }

  return best.delimiter;
}

