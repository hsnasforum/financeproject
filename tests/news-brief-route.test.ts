import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/dev/news/brief/route";
import { resolveNewsBriefJsonPath } from "../src/lib/news/storageSqlite";

const BRIEF_PATH = resolveNewsBriefJsonPath();

function withBriefFile(content: string | null, run: () => Promise<void>) {
  const backup = fs.existsSync(BRIEF_PATH) ? fs.readFileSync(BRIEF_PATH, "utf-8") : null;
  if (content === null) {
    if (backup !== null) fs.unlinkSync(BRIEF_PATH);
  } else {
    fs.mkdirSync(path.dirname(BRIEF_PATH), { recursive: true });
    fs.writeFileSync(BRIEF_PATH, content, "utf-8");
  }

  return run().finally(() => {
    if (backup === null) {
      if (fs.existsSync(BRIEF_PATH)) fs.unlinkSync(BRIEF_PATH);
      return;
    }
    fs.mkdirSync(path.dirname(BRIEF_PATH), { recursive: true });
    fs.writeFileSync(BRIEF_PATH, backup, "utf-8");
  });
}

describe("news brief route", () => {
  it("returns {ok:true,data:null} when brief file is missing", async () => {
    await withBriefFile(null, async () => {
      const response = await GET();
      const json = (await response.json()) as { ok?: boolean; data?: unknown };
      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data).toBeNull();
    });
  });

  it("returns null when brief file is invalid json", async () => {
    await withBriefFile("{invalid", async () => {
      const response = await GET();
      const json = (await response.json()) as { ok?: boolean; data?: unknown };
      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data).toBeNull();
    });
  });

  it("returns parsed brief payload when brief file is valid", async () => {
    const briefPayload = {
      generatedAt: "2026-03-04T00:00:00.000Z",
      stats: { totalItems: 1, totalClusters: 1, dedupedCount: 0, feeds: 1 },
      topToday: [],
      topByTopic: [],
      risingTopics: [],
      summary: {
        observation: "테스트 관찰",
        evidenceLinks: ["https://example.com/news/1"],
        watchVariables: ["원/달러 환율"],
        counterSignals: ["기사량 둔화"],
      },
    };

    await withBriefFile(`${JSON.stringify(briefPayload)}\n`, async () => {
      const response = await GET();
      const json = (await response.json()) as { ok?: boolean; data?: { generatedAt?: string } | null };
      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data?.generatedAt).toBe("2026-03-04T00:00:00.000Z");
    });
  });
});
