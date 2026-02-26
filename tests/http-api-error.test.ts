import { afterEach, describe, expect, it } from "vitest";
import { isDebugEnabled, makeHttpError } from "../src/lib/http/apiError";

const originalNodeEnv = process.env.NODE_ENV;

function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
    return;
  }
  env[name] = value;
}

afterEach(() => {
  setEnv("NODE_ENV", originalNodeEnv);
});

describe("http api error helper", () => {
  it("hides debug in production by default", () => {
    setEnv("NODE_ENV", "production");
    const searchParams = new URLSearchParams();
    const error = makeHttpError("INTERNAL", "failure", {
      debugEnabled: isDebugEnabled(searchParams),
      debug: { traceId: "abc-123" },
    });

    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe("failure");
    expect("debug" in error).toBe(false);
  });

  it("shows debug when debug=1 in production", () => {
    setEnv("NODE_ENV", "production");
    const searchParams = new URLSearchParams("debug=1");
    const error = makeHttpError("INTERNAL", "failure", {
      debugEnabled: isDebugEnabled(searchParams),
      debug: { traceId: "abc-123" },
    });

    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe("failure");
    expect(error.debug).toEqual({ traceId: "abc-123" });
  });
});
