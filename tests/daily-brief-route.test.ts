import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/dev/dart/brief/route";

const BRIEF_PATH = path.join(process.cwd(), "tmp", "dart", "daily_brief.json");

describe("dart brief route", () => {
  it("returns {ok:true,data:null} when brief file is missing", async () => {
    const backup = fs.existsSync(BRIEF_PATH) ? fs.readFileSync(BRIEF_PATH, "utf-8") : null;
    if (backup === null && fs.existsSync(BRIEF_PATH)) fs.unlinkSync(BRIEF_PATH);
    if (backup !== null) fs.unlinkSync(BRIEF_PATH);

    try {
      const response = await GET();
      const json = (await response.json()) as { ok?: boolean; data?: unknown };
      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data).toBeNull();
    } finally {
      if (backup !== null) {
        fs.mkdirSync(path.dirname(BRIEF_PATH), { recursive: true });
        fs.writeFileSync(BRIEF_PATH, backup, "utf-8");
      }
    }
  });
});
