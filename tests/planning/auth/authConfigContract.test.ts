import fs from "node:fs";
import { describe, expect, it } from "vitest";

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function modelBlock(schema: string, modelName: string): string {
  const match = new RegExp(`model\\s+${modelName}\\s+\\{([\\s\\S]*?)\\n\\}`, "u").exec(schema);
  if (!match?.[1]) throw new Error(`Model not found: ${modelName}`);
  return match[1];
}

describe("Auth.js planning integration contract", () => {
  it("keeps Auth.js dependencies and OAuth providers explicit", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    const source = read("src/auth.ts");

    expect(pkg.dependencies?.["next-auth"]).toBeTruthy();
    expect(pkg.dependencies?.["@auth/prisma-adapter"]).toBeTruthy();
    expect(source).toContain('import { PrismaAdapter } from "@auth/prisma-adapter"');
    expect(source).toContain('import GitHub from "next-auth/providers/github"');
    expect(source).toContain('import Google from "next-auth/providers/google"');
    expect(source).toContain("AUTH_GITHUB_ID");
    expect(source).toContain("AUTH_GOOGLE_ID");
  });

  it("keeps Prisma adapter opt-in until the Auth.js tables are migrated", () => {
    const source = read("src/auth.ts");

    expect(source).toContain("AUTH_PRISMA_ADAPTER_ENABLED");
    expect(source).toContain("const authSecret = configured(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)");
    expect(source).toContain("...(authSecret ? { secret: authSecret } : {})");
    expect(source).toContain("usePrismaAdapter ? { adapter: PrismaAdapter(prisma) } : {}");
    expect(source).toContain('strategy: usePrismaAdapter ? "database" : "jwt"');
  });

  it("keeps session.user.id available for planning ownership scope", () => {
    const source = read("src/auth.ts");
    const currentUser = read("src/lib/planning/auth/currentUser.ts");

    expect(source).toContain("jwt({ token, user })");
    expect(source).toContain("if (user?.id) token.sub = user.id");
    expect(source).toContain("session({ session, token, user })");
    expect(source).toContain("const userId = user?.id ?? token.sub");
    expect(source).toContain("session.user");
    expect(currentUser).toContain('const authModule = await import("@/auth")');
    expect(currentUser).toContain("hasAuthRuntimeSecret");
    expect(currentUser).toContain('if (!hasAuthRuntimeSecret(env)) return ""');
    expect(currentUser).toContain("const session = await authModule.auth()");
  });

  it("keeps the App Router auth route on the Node.js runtime", () => {
    const route = read("src/app/api/auth/[...nextauth]/route.ts");

    expect(route).toContain('import { handlers } from "@/auth"');
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("export const { GET, POST } = handlers");
  });

  it("keeps Auth.js schema models and nullable legacy ownership columns in the active SQLite schema", () => {
    const schema = read("prisma/schema.prisma");

    for (const modelName of ["User", "Account", "Session", "VerificationToken"]) {
      expect(schema).toContain(`model ${modelName} {`);
    }

    expect(modelBlock(schema, "User")).toContain("passwordHash");
    expect(modelBlock(schema, "User")).toContain("plannerSnapshots PlannerSnapshot[]");
    expect(modelBlock(schema, "Account")).toContain("@@unique([provider, providerAccountId])");
    expect(modelBlock(schema, "Session")).toContain("sessionToken String   @unique");
    expect(modelBlock(schema, "UserProfile")).toContain("userId           String?");
    expect(modelBlock(schema, "Favorite")).toContain("userId        String?");
    expect(modelBlock(schema, "PlannerSnapshot")).toContain("userId              String?");
  });
});
