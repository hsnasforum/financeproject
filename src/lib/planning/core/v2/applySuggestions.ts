import { type ProfileV2 } from "./types";
import { suggestProfileNormalizations } from "./normalizeProfile";

function cloneProfile(profile: ProfileV2): ProfileV2 {
  return JSON.parse(JSON.stringify(profile)) as ProfileV2;
}

function setByPointer(target: unknown, pointer: string, value: unknown): boolean {
  if (!pointer.startsWith("/")) return false;
  const tokens = pointer
    .split("/")
    .slice(1)
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));

  if (tokens.length === 0) return false;

  let cursor: unknown = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (Array.isArray(cursor)) {
      const index = Number.parseInt(token, 10);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) return false;
      cursor = cursor[index];
      continue;
    }
    if (cursor && typeof cursor === "object") {
      const record = cursor as Record<string, unknown>;
      if (!(token in record)) return false;
      cursor = record[token];
      continue;
    }
    return false;
  }

  const leaf = tokens[tokens.length - 1];
  if (Array.isArray(cursor)) {
    const index = Number.parseInt(leaf, 10);
    if (!Number.isInteger(index) || index < 0 || index >= cursor.length) return false;
    cursor[index] = value;
    return true;
  }
  if (cursor && typeof cursor === "object") {
    (cursor as Record<string, unknown>)[leaf] = value;
    return true;
  }
  return false;
}

export function applySuggestions(profile: ProfileV2, acceptedCodes: string[]): ProfileV2 {
  const accepted = new Set(
    acceptedCodes
      .map((code) => code.trim())
      .filter((code) => code.length > 0),
  );
  if (accepted.size === 0) return profile;

  const suggestions = suggestProfileNormalizations(profile);
  if (suggestions.length === 0) return profile;

  const next = cloneProfile(profile);
  for (const suggestion of suggestions) {
    if (!accepted.has(suggestion.code)) continue;
    for (const patch of suggestion.patch) {
      setByPointer(next, patch.path, patch.value);
    }
  }
  return next;
}
