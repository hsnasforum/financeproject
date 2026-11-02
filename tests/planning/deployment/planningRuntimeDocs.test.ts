import fs from "node:fs";
import { describe, expect, it } from "vitest";

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

describe("desktop runtime documentation", () => {
  it("documents schema preflight and broker-based cookie recovery consistently", () => {
    const runtime = read("docs/runtime.md");
    const deploy = read("docs/deploy.md");
    const guide = read("USER_GUIDE.md");
    const readme = read("README.md");

    expect(readme).toContain("pnpm prisma:generate");
    expect(readme).toContain("pnpm prisma:db:push");
    expect(runtime).toContain("Windows 호환 절대");
    expect(deploy).toContain("포트를 열기 전에 실패");
    expect(runtime).toContain("bootstrap URL을 출력하지 않고");
    expect(deploy).toContain("owner-only broker");
    expect(guide).toContain("앱을 종료할 필요는 없습니다");

    for (const source of [runtime, deploy, guide]) {
      expect(source).not.toMatch(/출력된 bootstrap URL/u);
      expect(source).not.toMatch(/cookie를 지[^\n]*종료한 뒤/u);
    }
  });
});
