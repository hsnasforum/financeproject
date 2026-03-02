type UnifiedCursorPayload = {
  id: number;
};

export function encodeUnifiedCursor(payload: UnifiedCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

export function decodeUnifiedCursor(cursor: string): UnifiedCursorPayload | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded) as { id?: unknown };
    const id = typeof parsed.id === "number" ? parsed.id : Number(parsed.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { id };
  } catch {
    return null;
  }
}

