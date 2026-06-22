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

function providerIds(providers: unknown): string[] {
  return (providers as Array<{ id?: unknown }>)
    .map((provider) => provider.id)
    .filter((id): id is string => typeof id === "string");
}

function testEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...values,
  } as NodeJS.ProcessEnv;
}

describe("Auth.js planning integration contract", () => {
  it("keeps the planning auth verification gate explicit in package scripts", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["planning:auth:check"]).toBe(
      "vitest run tests/planning/auth/*.test.ts tests/middleware-security.test.ts tests/planner-compute-route-auth.test.ts tests/recommend-api.test.ts tests/planning-v2-api/profiles-route.test.ts tests/planning-v2-api/assumptions-overrides-route.test.ts tests/planning/ops/planning-cache-route-user-scope.test.ts tests/planning/ops/ops-runs-route-service-boundary.test.ts tests/planning/ops/ops-doctor-route-service-boundary.test.ts tests/planning/ops/ops-doctor-route-action-response.test.ts tests/planning/ops/ops-doctor-action-result.test.ts tests/planning/ops/actions-preview-route.test.ts tests/planning/ops/actions-run-route.test.ts",
    );
  });

  it("keeps Auth.js dependencies and OAuth providers explicit", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    const source = read("src/auth.ts");
    const configSource = read("src/lib/auth/config.ts");

    expect(pkg.dependencies?.["next-auth"]).toBeTruthy();
    expect(pkg.dependencies?.["@auth/prisma-adapter"]).toBeTruthy();
    expect(source).toContain('import { PrismaAdapter } from "@auth/prisma-adapter"');
    expect(configSource).toContain('import GitHub from "next-auth/providers/github"');
    expect(configSource).toContain('import Google from "next-auth/providers/google"');
    expect(configSource).toContain("AUTH_GITHUB_ID");
    expect(configSource).toContain("AUTH_GOOGLE_ID");
    expect(source).toContain("export { buildAuthConfig, buildOAuthProviders }");
    expect(configSource).toContain("export function buildOAuthProviders");
    expect(configSource).not.toContain("next-auth/providers/credentials");
    expect(configSource).not.toContain("next-auth/providers/email");
    expect(configSource).not.toContain("next-auth/providers/nodemailer");
  });

  it("builds only configured GitHub and Google OAuth providers from env", async () => {
    const { buildOAuthProviders } = await import("../../../src/lib/auth/config");

    expect(providerIds(buildOAuthProviders(testEnv()))).toEqual([]);
    expect(providerIds(buildOAuthProviders(testEnv({
      AUTH_GITHUB_ID: "github-id",
      AUTH_GITHUB_SECRET: "github-secret",
    })))).toEqual(["github"]);
    expect(providerIds(buildOAuthProviders(testEnv({
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
    })))).toEqual(["google"]);
    expect(providerIds(buildOAuthProviders(testEnv({
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
    })))).toEqual(["github", "google"]);
    expect(providerIds(buildOAuthProviders(testEnv({
      AUTH_GITHUB_ID: "github-id",
      AUTH_GOOGLE_SECRET: "google-secret",
    })))).toEqual([]);
  });

  it("keeps Prisma adapter opt-in until the Auth.js tables are migrated", () => {
    const source = read("src/auth.ts");
    const configSource = read("src/lib/auth/config.ts");

    expect(configSource).toContain("AUTH_PRISMA_ADAPTER_ENABLED");
    expect(source).toContain("export { buildAuthConfig, buildOAuthProviders }");
    expect(configSource).toContain("export function buildAuthConfig");
    expect(configSource).toContain("const authSecret = configured(env.AUTH_SECRET ?? env.NEXTAUTH_SECRET)");
    expect(configSource).toContain("...(authSecret ? { secret: authSecret } : {})");
    expect(configSource).toContain("if (usePrismaAdapter && !options.adapter)");
    expect(configSource).toContain("...(usePrismaAdapter ? { adapter: options.adapter } : {})");
    expect(configSource).toContain('strategy: usePrismaAdapter ? "database" : "jwt"');
    expect(configSource).toContain("providers: buildOAuthProviders(env)");
    expect(source).toContain("isPrismaAdapterEnabled(process.env) ? PrismaAdapter(prisma) : undefined");
    expect(source).toContain("buildAuthConfig(process.env, { adapter: authAdapter })");
  });

  it("builds JWT sessions by default and keeps database sessions opt-in", async () => {
    const { buildAuthConfig } = await import("../../../src/lib/auth/config");

    const defaultConfig = buildAuthConfig(testEnv({
      NODE_ENV: "production",
      AUTH_SECRET: " auth-secret ",
    }));
    expect(defaultConfig.secret).toBe("auth-secret");
    expect(defaultConfig.session?.strategy).toBe("jwt");
    expect(defaultConfig.adapter).toBeUndefined();
    expect(defaultConfig.trustHost).toBe(false);

    const devConfig = buildAuthConfig(testEnv({
      NODE_ENV: "development",
    }));
    expect(devConfig.trustHost).toBe(true);

    const trustedHostConfig = buildAuthConfig(testEnv({
      NODE_ENV: "production",
      AUTH_TRUST_HOST: "true",
    }));
    expect(trustedHostConfig.trustHost).toBe(true);
  });

  it("keeps session.user.id available for planning ownership scope", () => {
    const source = read("src/lib/auth/config.ts");
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

  it("keeps planning auth required by default unless local fallback is explicit", () => {
    const currentUser = read("src/lib/planning/auth/currentUser.ts");
    const middleware = read("middleware.ts");
    const vitestConfig = read("vitest.config.ts");
    const envExample = read(".env.example");
    const currentScreens = read("docs/current-screens.md");

    expect(currentUser).toContain("function defaultPlanningAuthRequired(): boolean");
    expect(currentUser).toContain("function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean");
    expect(currentUser).toContain("if (isProductionEnv(env)) return true");
    expect(currentUser).toContain("parseBoolean(env.PLANNING_AUTH_REQUIRED, defaultPlanningAuthRequired())");
    expect(middleware).toContain('process.env.NODE_ENV ?? ""');
    expect(middleware).toContain("parseBoolean(process.env.PLANNING_AUTH_REQUIRED, true)");
    expect(vitestConfig).not.toContain("PLANNING_AUTH_REQUIRED");
    expect(envExample).toContain("AUTH_SECRET=");
    expect(envExample).toContain("NEXTAUTH_SECRET= # optional legacy alias for AUTH_SECRET");
    expect(envExample).toContain("AUTH_GITHUB_ID= # optional");
    expect(envExample).toContain("AUTH_GOOGLE_ID= # optional");
    expect(envExample).toContain("GITHUB_CLIENT_ID= # optional legacy alias for AUTH_GITHUB_ID");
    expect(envExample).toContain("GOOGLE_CLIENT_ID= # optional legacy alias for AUTH_GOOGLE_ID");
    expect(envExample).toContain("PLANNING_AUTH_REQUIRED=false # local/dev only; ignored in production");
    expect(envExample).toContain("PLANNING_TRUST_AUTH_HEADERS=false # optional: local/internal bridge only");
    expect(currentScreens).toContain("/api/auth/*");
    expect(currentScreens).toContain("GitHub/Google OAuth");
    expect(currentScreens).toContain("Credentials/Email provider");
    expect(currentScreens).toContain("AUTH_PRISMA_ADAPTER_ENABLED=true");
    expect(currentScreens).toContain("/api/planning/*");
    expect(currentScreens).toContain("/api/planner/compute");
    expect(currentScreens).toContain("same-origin 요청과 routeAuth current-user scope를 모두 요구");
    expect(currentScreens).toContain("/api/recommend");
    expect(currentScreens).toContain("기존 추천 trace/source meta에 `meta.userId`와 `meta.authSource`를 함께 유지");
    expect(currentScreens).toContain("/api/ops/actions/preview");
    expect(currentScreens).toContain("/api/ops/actions/run");
    expect(currentScreens).toContain("401");
    expect(currentScreens).toContain("403");
    expect(currentScreens).toContain("meta.userId");
    expect(currentScreens).toContain("meta.authSource");
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
