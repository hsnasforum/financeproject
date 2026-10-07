import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverExportedHttpMethodsFromSource,
  scanMutationRouteCapabilities,
} from "../scripts/security_route_guard_scan.mjs";
import {
  CAPABILITY_AXES,
  CAPABILITY_PROVIDERS,
  resolveMutationRouteContract,
} from "../scripts/security_route_registry.mjs";

const tempRoots = [];

function capabilities(input = {}) {
  return Object.fromEntries(CAPABILITY_AXES.map((axis) => [axis, input[axis] === true]));
}

function profile(requirements, execution = "enabled") {
  return { execution, requirements: capabilities(requirements) };
}

function registry(input = {}) {
  return {
    profiles: input.profiles ?? {
      publicOrigin: profile({ originCsrf: true }),
    },
    exactRoutes: input.exactRoutes ?? [],
    familyRoutes: input.familyRoutes ?? [],
    providers: input.providers ?? [],
  };
}

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-route-capability-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "src", "app", "api"), { recursive: true });
  return root;
}

function write(root, relative, source) {
  const target = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source, "utf8");
}

function exact(input = {}) {
  return {
    id: input.id ?? "example",
    method: input.method ?? "POST",
    file: input.file ?? "src/app/api/example/route.ts",
    risk: input.risk ?? "medium",
    effect: input.effect ?? "test",
    audience: input.audience ?? "test",
    profile: input.profile ?? "publicOrigin",
    ...(input.disabledContract ? { disabledContract: input.disabledContract } : {}),
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("security route mutation discovery", () => {
  it("discovers function, const, local export alias, and re-export methods", () => {
    const source = `
      export function POST() { return new Response(); }
      export const PATCH = async () => new Response();
      function remove() { return new Response(); }
      export { remove as DELETE };
      export { externalPut as PUT } from "./handler";
    `;

    expect(discoverExportedHttpMethodsFromSource(source)).toEqual([
      "DELETE",
      "PATCH",
      "POST",
      "PUT",
    ]);
  });

  it("uses an exact contract before a matching family and leaves unknown public families unclassified", () => {
    const custom = registry({
      exactRoutes: [exact({ id: "exact-example" })],
      familyRoutes: [{
        id: "api-family",
        prefix: "src/app/api/example/",
        risk: "high",
        effect: "family",
        audience: "local-ops",
        profile: "publicOrigin",
      }],
    });

    const resolved = resolveMutationRouteContract("POST", "src/app/api/example/route.ts", custom);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.source).toBe("exact");
      expect(resolved.contract.id).toBe("exact-example");
    }
    expect(resolveMutationRouteContract("POST", "src/app/api/unknown/route.ts", custom)).toMatchObject({
      ok: false,
      reason: "unclassified",
    });
  });
});

describe("security route capability matrix", () => {
  it("requires the Auth.js protocol adapter response to be returned, not ignored", () => {
    const root = makeRoot();
    const routeFile = "src/app/api/auth/[...nextauth]/route.ts";
    const resolved = resolveMutationRouteContract("POST", routeFile);
    expect(resolved.ok).toBe(true);
    expect(resolved.contract.profile).toBe("publicOrigin");
    const provider = CAPABILITY_PROVIDERS.find((item) => item.module === "src/lib/auth/routeHandlers.ts");
    expect(provider.provides).toEqual(capabilities({ originCsrf: true }));
    write(root, provider.module, "export async function handleWebAuthPost() { return new Response(); }");
    const custom = registry({ exactRoutes: [resolved.contract], providers: [provider] });
    write(root, routeFile, `
      import { handleWebAuthPost } from "@/lib/auth/routeHandlers";
      export async function POST(request) { return handleWebAuthPost(request); }
    `);
    expect(scanMutationRouteCapabilities({ root, registry: custom }).issues).toEqual([]);
    write(root, routeFile, `
      import { handleWebAuthPost } from "@/lib/auth/routeHandlers";
      export async function POST(request) { await handleWebAuthPost(request); return new Response(); }
    `);
    expect(scanMutationRouteCapabilities({ root, registry: custom }).issues.join("\n")).toContain("missing originCsrf");
  });

  it("keeps authentication, authorization, locality, origin/CSRF, rate-limit, and audit as distinct axes", () => {
    expect(CAPABILITY_AXES).toEqual([
      "auth",
      "authorization",
      "locality",
      "originCsrf",
      "rateLimit",
      "audit",
    ]);
  });

  it("does not promote origin or singleflight evidence to auth, authorization, locality, rate-limit, or audit", () => {
    const root = makeRoot();
    write(root, "src/lib/security/trustedOrigin.ts", "export function decideTrustedOrigin() { return { ok: true }; }");
    write(root, "src/lib/cache/singleflight.ts", "export async function singleflight(_key, run) { return await run(); }");
    write(root, "src/app/api/example/route.ts", `
      import { decideTrustedOrigin as verifyOrigin } from "@/lib/security/trustedOrigin";
      import { singleflight } from "@/lib/cache/singleflight";
      export async function POST(request) {
        const origin = verifyOrigin(request.headers);
        if (!origin.ok) return new Response(null, { status: 403 });
        return await singleflight("example", async () => new Response());
      }
    `);
    const custom = registry({
      profiles: {
        enabledHighCostJob: profile({
          auth: true,
          authorization: true,
          locality: true,
          originCsrf: true,
          rateLimit: true,
          audit: true,
        }),
      },
      exactRoutes: [exact({
        risk: "high",
        effect: "external-job",
        profile: "enabledHighCostJob",
      })],
      providers: [{
        module: "src/lib/security/trustedOrigin.ts",
        symbols: ["decideTrustedOrigin"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth, authorization, locality, rateLimit, audit -> POST src/app/api/example/route.ts [risk=high effect=external-job profile=enabledHighCostJob]",
    );
    expect(result.results[0]?.observed).toEqual(capabilities({ originCsrf: true }));
  });

  it("follows a re-exported handler and resolves aliased provider imports", () => {
    const root = makeRoot();
    write(root, "src/lib/dev/devGuards.ts", "export function assertSameOrigin() {}");
    write(root, "src/app/api/reexport/handler.ts", `
      import { assertSameOrigin as verifyOrigin } from "@/lib/dev/devGuards";
      export async function handler(request) {
        verifyOrigin(request);
        return new Response();
      }
    `);
    write(root, "src/app/api/reexport/route.ts", "export { handler as POST } from \"./handler\";");
    const custom = registry({
      exactRoutes: [exact({
        id: "reexport",
        file: "src/app/api/reexport/route.ts",
      })],
      providers: [{
        module: "src/lib/dev/devGuards.ts",
        symbols: ["assertSameOrigin"],
        enforcement: "throws",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toEqual([]);
    expect(result.results[0]?.observed.originCsrf).toBe(true);
  });

  it("fails an unclassified mutation", () => {
    const root = makeRoot();
    write(root, "src/app/api/unknown/route.ts", "export async function POST() { return new Response(); }");

    const result = scanMutationRouteCapabilities({ root, registry: registry() });
    expect(result.issues).toContain(
      "route-capability: unclassified -> POST src/app/api/unknown/route.ts",
    );
  });

  it("fails a stale exact registry entry", () => {
    const root = makeRoot();
    const custom = registry({
      exactRoutes: [exact({ id: "stale-entry" })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-registry: stale exact entry stale-entry -> POST src/app/api/example/route.ts",
    );
  });

  it("fails a capability provider that points to a missing module", () => {
    const root = makeRoot();
    const custom = registry({
      providers: [{
        module: "src/lib/security/missingProvider.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-registry: missing capability provider module -> src/lib/security/missingProvider.ts",
    );
  });

  it("accepts an inline disabled-http tombstone with only NextResponse responses", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", `
      import { NextResponse } from "next/server";
      export async function POST(_request) {
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
        }
        return NextResponse.json({
          ok: false,
          error: { code: "OPERATOR_COMMAND_REQUIRED", hint: "run pnpm example:sync locally" },
        }, { status: 403 });
      }
    `);
    const custom = registry({
      profiles: { disabledHttp: profile({}, "disabled") },
      exactRoutes: [exact({
        risk: "high",
        effect: "external-job",
        profile: "disabledHttp",
        disabledContract: {
          allowedImports: ["next/server"],
          errorCodes: ["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"],
          statuses: [403, 404],
          commandHint: "pnpm example:sync",
          responsePairs: [
            { code: "NOT_FOUND", status: 404, hint: "forbidden" },
            { code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" },
          ],
        },
      })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toEqual([]);
    expect(result.stats.disabled).toBe(1);
  });

  it("rejects a tombstone that shadows NextResponse inside the handler", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", `
      import { NextResponse } from "next/server";
      export async function POST() {
        const NextResponse = { json: () => undefined };
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
        }
        return NextResponse.json({
          ok: false,
          error: { code: "OPERATOR_COMMAND_REQUIRED", hint: "run pnpm example:sync locally" },
        }, { status: 403 });
      }
    `);
    const custom = registry({
      profiles: { disabledHttp: profile({}, "disabled") },
      exactRoutes: [exact({
        risk: "high",
        effect: "external-job",
        profile: "disabledHttp",
        disabledContract: {
          allowedImports: ["next/server"],
          errorCodes: ["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"],
          statuses: [403, 404],
          commandHint: "pnpm example:sync",
          responsePairs: [
            { code: "NOT_FOUND", status: 404, hint: "forbidden" },
            { code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" },
          ],
        },
      })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "disabled-http: every return must be NextResponse.json -> POST src/app/api/example/route.ts",
    );
  });

  it("rejects runner imports and calls from a disabled-http route", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", `
      import { NextResponse } from "next/server";
      import { spawn } from "node:child_process";
      export async function POST(_request) {
        spawn("pnpm", ["example:sync"]);
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
        }
        return NextResponse.json({
          ok: false,
          error: { code: "OPERATOR_COMMAND_REQUIRED", hint: "run pnpm example:sync locally" },
        }, { status: 403 });
      }
    `);
    const custom = registry({
      profiles: { disabledHttp: profile({}, "disabled") },
      exactRoutes: [exact({
        risk: "high",
        effect: "process-exec",
        profile: "disabledHttp",
        disabledContract: {
          allowedImports: ["next/server"],
          errorCodes: ["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"],
          statuses: [403, 404],
          commandHint: "pnpm example:sync",
          responsePairs: [
            { code: "NOT_FOUND", status: 404, hint: "forbidden" },
            { code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" },
          ],
        },
      })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "disabled-http: disallowed import node:child_process -> POST src/app/api/example/route.ts",
    );
    expect(result.issues).toContain(
      "disabled-http: only NextResponse.json calls are allowed -> POST src/app/api/example/route.ts",
    );
  });

  it("does not treat comments or string literals as capability evidence", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", `
      export async function POST() {
        // withPlanningRouteUser(request)
        const marker = "guardFeedbackManagementAccess(request) assertSameOrigin(request)";
        return Response.json({ marker });
      }
    `);
    const custom = registry({
      profiles: {
        authenticatedUser: profile({
          auth: true,
          authorization: true,
          originCsrf: true,
        }),
      },
      exactRoutes: [exact({ profile: "authenticatedUser" })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.results[0]?.observed).toEqual(capabilities());
    expect(result.issues).toContain(
      "route-capability: missing auth, authorization, originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticatedUser]",
    );
  });

  it("does not count ignored decision results or providers in a statically dead branch", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", `
      export function authorize() {}
      export function decideOrigin() { return { ok: true }; }
    `);
    write(root, "src/app/api/example/route.ts", `
      import { authorize, decideOrigin } from "@/lib/security/guards";
      export async function POST() {
        if (false) authorize();
        const ignoredDecision = decideOrigin();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: {
        guarded: profile({ auth: true, originCsrf: true }),
      },
      exactRoutes: [exact({ profile: "guarded" })],
      providers: [
        {
          module: "src/lib/security/guards.ts",
          symbols: ["authorize"],
          enforcement: "throws",
          provides: capabilities({ auth: true }),
        },
        {
          module: "src/lib/security/guards.ts",
          symbols: ["decideOrigin"],
          enforcement: "result",
          provides: capabilities({ originCsrf: true }),
        },
      ],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.results[0]?.observed).toEqual(capabilities());
    expect(result.issues).toContain(
      "route-capability: missing auth, originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=guarded]",
    );
  });

  it("does not count a result provider that is only observed or logged", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", `
      export function decideOrigin() { return null; }
    `);
    write(root, "src/app/api/example/route.ts", `
      import { decideOrigin } from "@/lib/security/guards";
      export async function POST(request) {
        const decision = decideOrigin(request);
        console.log(decision);
        return new Response();
      }
    `);
    const custom = registry({
      exactRoutes: [exact()],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["decideOrigin"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.results[0]?.observed.originCsrf).toBe(false);
    expect(result.issues).toContain(
      "route-capability: missing originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=publicOrigin]",
    );
  });

  it("rejects an inverted result-provider branch that lets blocked requests mutate", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function decideOrigin() { return null; }");
    write(root, "src/app/api/example/route.ts", `
      import { decideOrigin } from "@/lib/security/guards";
      export async function POST(request) {
        const blocked = decideOrigin(request);
        if (!blocked) return new Response(null, { status: 204 });
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      exactRoutes: [exact()],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["decideOrigin"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=publicOrigin]",
    );
  });

  it("rejects providers hidden behind unsupported short-circuit conditions", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      export async function POST(request) {
        request.headers.has("x-authorize") && authorize();
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("rejects a throwing provider when its failure is swallowed", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      export async function POST() {
        try {
          authorize();
        } catch {}
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("rejects a helper that converts a throwing provider failure into a local return", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      function safeAuthorize() {
        try {
          authorize();
        } catch {
          return;
        }
      }
      export async function POST() {
        safeAuthorize();
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("does not recreate an enforced return boundary through a two-hop helper", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      function safeAuthorize() {
        try {
          authorize();
        } catch {
          return;
        }
      }
      const proxy = () => safeAuthorize();
      export async function POST() {
        proxy();
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("rejects an asserted falsy catch return as a blocking result", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      function safeAuthorize() {
        try {
          authorize();
        } catch {
          return false as boolean;
        }
      }
      export async function POST() {
        const blocked = safeAuthorize();
        if (blocked) return blocked;
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("rejects an unknown catch return as a blocking result", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      function failOpen() {
        return false;
      }
      function safeAuthorize() {
        try {
          authorize();
        } catch {
          return failOpen();
        }
      }
      export async function POST() {
        const blocked = safeAuthorize();
        if (blocked) return blocked;
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("does not trust a shadowed Response.json as a blocking result", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      const Response = { json: () => false };
      function failOpen() {
        return Response.json();
      }
      function safeAuthorize() {
        try {
          authorize();
        } catch {
          return failOpen();
        }
      }
      export async function POST() {
        const blocked = safeAuthorize();
        if (blocked) return blocked;
        await updateRecord();
        return new globalThis.Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("does not trust a shadowed NextResponse.json as a blocking result", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { NextResponse } from "next/server";
      import { authorize } from "@/lib/security/guards";
      function failOpen() {
        const NextResponse = { json: () => false };
        return NextResponse.json();
      }
      function safeAuthorize() {
        try {
          authorize();
        } catch {
          return failOpen();
        }
      }
      export async function POST() {
        const blocked = safeAuthorize();
        if (blocked) return blocked;
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("uses the route effect contract to catch a domain mutation before its guard", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function decideOrigin() { return null; }");
    write(root, "src/lib/feedback/feedbackStore.ts", "export function addPublicFeedback() {}");
    write(root, "src/app/api/example/route.ts", `
      import { decideOrigin } from "@/lib/security/guards";
      import { addPublicFeedback } from "@/lib/feedback/feedbackStore";
      export async function POST(request) {
        addPublicFeedback();
        const blocked = decideOrigin(request);
        if (blocked) return blocked;
        return new Response();
      }
    `);
    const custom = registry({
      exactRoutes: [exact({ effect: "public-submission" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["decideOrigin"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=public-submission profile=publicOrigin]",
    );
  });

  it("follows a renamed mutation wrapper to its write implementation", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function decideOrigin() { return null; }");
    write(root, "src/lib/records.ts", `
      import { writeFileSync } from "node:fs";
      const emit = writeFileSync;
      export function finalizeRecord() { emit("record.json", "{}"); }
    `);
    write(root, "src/app/api/example/route.ts", `
      import { decideOrigin } from "@/lib/security/guards";
      import { finalizeRecord } from "@/lib/records";
      export async function POST(request) {
        finalizeRecord();
        const blocked = decideOrigin(request);
        if (blocked) return blocked;
        return new Response();
      }
    `);
    const custom = registry({
      exactRoutes: [exact()],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["decideOrigin"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=publicOrigin]",
    );
  });

  it("follows a destructured external mutation alias", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function decideOrigin() { return null; }");
    write(root, "src/lib/records.ts", `
      import * as fs from "node:fs";
      const { writeFileSync: emit } = fs;
      export function finalizeRecord() { emit("record.json", "{}"); }
    `);
    write(root, "src/app/api/example/route.ts", `
      import { decideOrigin } from "@/lib/security/guards";
      import { finalizeRecord } from "@/lib/records";
      export async function POST(request) {
        finalizeRecord();
        const blocked = decideOrigin(request);
        if (blocked) return blocked;
        return new Response();
      }
    `);
    const custom = registry({
      exactRoutes: [exact()],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["decideOrigin"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=publicOrigin]",
    );
  });

  it("rejects a required guard that only runs on one reachable branch", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      export async function POST(request) {
        if (request.headers.get("x-authorize")) authorize();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: incompatible branches for auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("rejects a required guard that runs after a mutation effect", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function authorize() {}");
    write(root, "src/app/api/example/route.ts", `
      import { authorize } from "@/lib/security/guards";
      async function mutate() { await writeRecord(); }
      export async function POST() {
        await mutate();
        authorize();
        return new Response();
      }
    `);
    const custom = registry({
      profiles: { authenticated: profile({ auth: true }) },
      exactRoutes: [exact({ profile: "authenticated" })],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing auth -> POST src/app/api/example/route.ts [risk=medium effect=test profile=authenticated]",
    );
  });

  it("evaluates mutation arguments before recording provider evidence", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function decideOrigin() { return null; }");
    write(root, "src/app/api/example/route.ts", `
      import { decideOrigin } from "@/lib/security/guards";
      export async function POST() {
        const blocked = decideOrigin(updateRecord());
        if (blocked) return blocked;
        return new Response();
      }
    `);
    const custom = registry({
      exactRoutes: [exact()],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["decideOrigin"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=publicOrigin]",
    );
  });

  it("does not use an imported provider hidden by a lexical binding", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function check() { return null; }");
    write(root, "src/app/api/example/route.ts", `
      import { check } from "@/lib/security/guards";
      export async function POST(request) {
        const check = () => null;
        const blocked = check(request);
        if (blocked) return blocked;
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      exactRoutes: [exact()],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["check"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=publicOrigin]",
    );
  });

  it("does not use a namespace provider hidden by a lexical binding", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", "export function check() { return null; }");
    write(root, "src/app/api/example/route.ts", `
      import * as guards from "@/lib/security/guards";
      export async function POST(request) {
        const guards = { check: () => null };
        const blocked = guards.check(request);
        if (blocked) return blocked;
        await updateRecord();
        return new Response();
      }
    `);
    const custom = registry({
      exactRoutes: [exact()],
      providers: [{
        module: "src/lib/security/guards.ts",
        symbols: ["check"],
        enforcement: "result",
        provides: capabilities({ originCsrf: true }),
      }],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-capability: missing originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=publicOrigin]",
    );
  });

  it("binds disabled status and error codes to actual response objects", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", `
      import { NextResponse } from "next/server";
      export async function POST() {
        const unused = [403, 404, "NOT_FOUND", "OPERATOR_COMMAND_REQUIRED", "pnpm example:sync"];
        return NextResponse.json({ ok: true, error: { code: "OK" }, unused }, { status: 200 });
      }
    `);
    const custom = registry({
      profiles: { disabledHttp: profile({}, "disabled") },
      exactRoutes: [exact({
        risk: "high",
        effect: "external-job",
        profile: "disabledHttp",
        disabledContract: {
          allowedImports: ["next/server"],
          errorCodes: ["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"],
          statuses: [403, 404],
          commandHint: "pnpm example:sync",
          responsePairs: [
            { code: "NOT_FOUND", status: 404, hint: "forbidden" },
            { code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" },
          ],
        },
      })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "disabled-http: unexpected status 200 -> POST src/app/api/example/route.ts",
    );
    expect(result.issues).toContain(
      "disabled-http: unexpected error code OK -> POST src/app/api/example/route.ts",
    );
  });

  it("rejects swapped disabled response code and status pairs", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", `
      import { NextResponse } from "next/server";
      export async function POST() {
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", hint: "pnpm example:sync" } }, { status: 403 });
        }
        return NextResponse.json({ ok: false, error: { code: "OPERATOR_COMMAND_REQUIRED" } }, { status: 404 });
      }
    `);
    const custom = registry({
      profiles: { disabledHttp: profile({}, "disabled") },
      exactRoutes: [exact({
        risk: "high",
        effect: "external-job",
        profile: "disabledHttp",
        disabledContract: {
          allowedImports: ["next/server"],
          errorCodes: ["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"],
          statuses: [403, 404],
          commandHint: "pnpm example:sync",
          responsePairs: [
            { code: "NOT_FOUND", status: 404, hint: "forbidden" },
            { code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" },
          ],
        },
      })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "disabled-http: missing response pair NOT_FOUND/404 -> POST src/app/api/example/route.ts",
    );
    expect(result.issues).toContain(
      "disabled-http: unexpected response pair NOT_FOUND/403 -> POST src/app/api/example/route.ts",
    );
  });

  it("rejects disabled response pairs bound to the wrong NODE_ENV branch", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", `
      import { NextResponse } from "next/server";
      export async function POST() {
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json({
            ok: false,
            error: { code: "OPERATOR_COMMAND_REQUIRED", hint: "run pnpm example:sync locally" },
          }, { status: 403 });
        }
        return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
      }
    `);
    const custom = registry({
      profiles: { disabledHttp: profile({}, "disabled") },
      exactRoutes: [exact({
        risk: "high",
        effect: "external-job",
        profile: "disabledHttp",
        disabledContract: {
          allowedImports: ["next/server"],
          errorCodes: ["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"],
          statuses: [403, 404],
          commandHint: "pnpm example:sync",
          responsePairs: [
            { code: "NOT_FOUND", status: 404, hint: "forbidden" },
            { code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" },
          ],
        },
      })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "disabled-http: NOT_FOUND/404 must be returned from the production branch -> POST src/app/api/example/route.ts",
    );
    expect(result.issues).toContain(
      "disabled-http: OPERATOR_COMMAND_REQUIRED/403 must be returned from the non-production branch -> POST src/app/api/example/route.ts",
    );
  });

  it("validates every duplicate disabled response pair against its NODE_ENV branch", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", `
      import { NextResponse } from "next/server";
      export async function POST() {
        if (process.env.NODE_ENV !== "production") {
          return NextResponse.json({
            ok: false,
            error: { code: "OPERATOR_COMMAND_REQUIRED", hint: "run pnpm example:sync locally" },
          }, { status: 403 });
        }
        if (process.env.NODE_ENV === "production") {
          if (true) {
            return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
          }
          return NextResponse.json({
            ok: false,
            error: { code: "OPERATOR_COMMAND_REQUIRED", hint: "run pnpm example:sync locally" },
          }, { status: 403 });
        }
      }
    `);
    const custom = registry({
      profiles: { disabledHttp: profile({}, "disabled") },
      exactRoutes: [exact({
        risk: "high",
        effect: "external-job",
        profile: "disabledHttp",
        disabledContract: {
          allowedImports: ["next/server"],
          errorCodes: ["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"],
          statuses: [403, 404],
          commandHint: "pnpm example:sync",
          responsePairs: [
            { code: "NOT_FOUND", status: 404, hint: "forbidden" },
            { code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" },
          ],
        },
      })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "disabled-http: OPERATOR_COMMAND_REQUIRED/403 must be returned from the non-production branch -> POST src/app/api/example/route.ts",
    );
  });

  it("fails unknown route risk levels", () => {
    const root = makeRoot();
    write(root, "src/app/api/example/route.ts", "export async function POST() { return new Response(); }");
    const custom = registry({
      exactRoutes: [exact({ risk: "urgent" })],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toContain(
      "route-registry: exact route POST src/app/api/example/route.ts: invalid risk urgent",
    );
  });

  it("does not combine mutually exclusive branches for a conjunction profile", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", `
      export function authorize() {}
      export function assertLocal() {}
    `);
    write(root, "src/app/api/example/route.ts", `
      import { authorize, assertLocal } from "@/lib/security/guards";
      export async function POST() {
        if (process.env.NODE_ENV === "production") authorize();
        else assertLocal();
        return new Response();
      }
    `);
    const providers = [
      {
        module: "src/lib/security/guards.ts",
        symbols: ["authorize"],
        enforcement: "throws",
        provides: capabilities({ auth: true, authorization: true }),
      },
      {
        module: "src/lib/security/guards.ts",
        symbols: ["assertLocal"],
        enforcement: "throws",
        provides: capabilities({ locality: true, originCsrf: true }),
      },
    ];
    const conjunction = registry({
      profiles: {
        operator: profile({
          auth: true,
          authorization: true,
          locality: true,
          originCsrf: true,
        }),
      },
      exactRoutes: [exact({ profile: "operator" })],
      providers,
    });

    const result = scanMutationRouteCapabilities({ root, registry: conjunction });
    expect(result.issues).toContain(
      "route-capability: incompatible branches for auth, authorization, locality, originCsrf -> POST src/app/api/example/route.ts [risk=medium effect=test profile=operator]",
    );
  });

  it("supports explicit internal-token or local-ops capability alternatives", () => {
    const root = makeRoot();
    write(root, "src/lib/security/guards.ts", `
      export function authorize() {}
      export function assertLocal() {}
    `);
    write(root, "src/app/api/example/route.ts", `
      import { authorize, assertLocal } from "@/lib/security/guards";
      export async function POST() {
        if (process.env.NODE_ENV === "production") authorize();
        else assertLocal();
        return new Response();
      }
    `);
    const operatorProfile = profile({});
    operatorProfile.alternatives = [
      { id: "internal", requirements: capabilities({ auth: true, authorization: true }) },
      { id: "local", requirements: capabilities({ locality: true, originCsrf: true }) },
    ];
    const custom = registry({
      profiles: { operator: operatorProfile },
      exactRoutes: [exact({ profile: "operator" })],
      providers: [
        {
          module: "src/lib/security/guards.ts",
          symbols: ["authorize"],
          enforcement: "throws",
          provides: capabilities({ auth: true, authorization: true }),
        },
        {
          module: "src/lib/security/guards.ts",
          symbols: ["assertLocal"],
          enforcement: "throws",
          provides: capabilities({ locality: true, originCsrf: true }),
        },
      ],
    });

    const result = scanMutationRouteCapabilities({ root, registry: custom });
    expect(result.issues).toEqual([]);
  });

  it("classifies every mutation in the current repository exactly once", () => {
    const result = scanMutationRouteCapabilities({ root: process.cwd() });

    expect(result.issues).toEqual([]);
    expect(result.stats.mutationMethods).toBeGreaterThan(0);
    expect(result.stats.classified).toBe(result.stats.mutationMethods);
  }, 30_000);
});
