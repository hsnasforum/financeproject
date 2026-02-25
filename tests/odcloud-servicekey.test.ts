import { describe, expect, it } from "vitest";
import { appendServiceKey, encodeServiceKey } from "../src/lib/publicApis/odcloud";

describe("odcloud serviceKey encoding", () => {
  it("does not double-encode already encoded keys", () => {
    const key = "abc%2Bdef%3D";
    expect(encodeServiceKey(key)).toBe(key);
    const url = new URL("https://api.example.com/path");
    appendServiceKey(url, key);
    expect(url.toString()).toBe("https://api.example.com/path?serviceKey=abc%2Bdef%3D");
  });

  it("encodes decoding key once", () => {
    const key = "abc+def=";
    const url = new URL("https://api.example.com/path?a=1");
    appendServiceKey(url, key);
    expect(url.toString()).toBe("https://api.example.com/path?a=1&serviceKey=abc%2Bdef%3D");
  });
});

