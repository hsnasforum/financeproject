import { isServerPathWhitelisted } from "./backupBundle";

export type ContentSummary = {
  exists: boolean;
  size: number;
  hash: string;
};

export type ServerFileDiffItem = {
  path: string;
  current: ContentSummary;
  incoming: ContentSummary;
};

export type ServerFileDiffResult = {
  same: ServerFileDiffItem[];
  changed: ServerFileDiffItem[];
  added: ServerFileDiffItem[];
  missing: ServerFileDiffItem[];
};

function normalizePath(value: string): string {
  return String(value ?? "").trim().replaceAll("\\", "/");
}

function hashText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function summarizeContent(content: string | null | undefined): ContentSummary {
  if (typeof content !== "string") {
    return {
      exists: false,
      size: 0,
      hash: "",
    };
  }
  return {
    exists: true,
    size: content.length,
    hash: hashText(content),
  };
}

export function diffServerFiles(
  current: Record<string, string | null>,
  incoming: Record<string, string | null>,
): ServerFileDiffResult {
  const pathSet = new Set<string>();
  for (const key of Object.keys(current)) {
    const normalized = normalizePath(key);
    if (isServerPathWhitelisted(normalized)) pathSet.add(normalized);
  }
  for (const key of Object.keys(incoming)) {
    const normalized = normalizePath(key);
    if (isServerPathWhitelisted(normalized)) pathSet.add(normalized);
  }

  const same: ServerFileDiffItem[] = [];
  const changed: ServerFileDiffItem[] = [];
  const added: ServerFileDiffItem[] = [];
  const missing: ServerFileDiffItem[] = [];

  const paths = [...pathSet].sort((a, b) => a.localeCompare(b));
  for (const path of paths) {
    const currentSummary = summarizeContent(current[path] ?? null);
    const incomingSummary = summarizeContent(incoming[path] ?? null);
    const item: ServerFileDiffItem = {
      path,
      current: currentSummary,
      incoming: incomingSummary,
    };

    if (currentSummary.exists && !incomingSummary.exists) {
      missing.push(item);
      continue;
    }
    if (!currentSummary.exists && incomingSummary.exists) {
      added.push(item);
      continue;
    }
    if (
      currentSummary.exists
      && incomingSummary.exists
      && (
        currentSummary.hash !== incomingSummary.hash
        || currentSummary.size !== incomingSummary.size
      )
    ) {
      changed.push(item);
      continue;
    }
    same.push(item);
  }

  return {
    same,
    changed,
    added,
    missing,
  };
}
