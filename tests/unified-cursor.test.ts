import { describe, expect, it } from "vitest";
import { decodeUnifiedCursor, encodeUnifiedCursor } from "../src/lib/sources/unifiedCursor";

describe("unified cursor", () => {
  it("encodes and decodes cursor payload", () => {
    const encoded = encodeUnifiedCursor({ id: 123 });
    const decoded = decodeUnifiedCursor(encoded);
    expect(decoded).toEqual({ id: 123 });
  });

  it("returns null for invalid cursor", () => {
    expect(decodeUnifiedCursor("not-a-valid-cursor")).toBeNull();
  });
});

