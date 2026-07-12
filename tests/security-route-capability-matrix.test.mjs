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
  });
});
