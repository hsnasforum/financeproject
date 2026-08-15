import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLANNING_DEPLOYMENT_MODES,
  resolvePlanningDeploymentPolicy,
  type PlanningDeploymentPolicyInput,
} from "../../../src/lib/planning/deployment/policy.mjs";

const originalDeploymentMode = process.env.PLANNING_DEPLOYMENT_MODE;
const originalPlanningNamespace = process.env.PLANNING_NAMESPACE_ENABLED;

function desktopLocalInput(
  overrides: Partial<PlanningDeploymentPolicyInput> = {},
): PlanningDeploymentPolicyInput {
  return {
    mode: "desktop-local",
    requestedBindHost: "127.0.0.1",
    singleUserModeEnabled: true,
    namespaceEnabled: false,
    forwardedHeadersTrusted: false,
    rawTrustedAuthHeadersEnabled: false,
    desktopLocalIdentityMode: "desktop-local-session",
    desktopLocalIdentityProvenance: "launcher-process",
    desktopLocalIdentityReady: true,
    databaseProvider: "sqlite",
    databaseConnection: "file",
    processModel: "single",
    dataRootKind: "local",
    proxyMode: "none",
    ...overrides,
  };
}

const EXACT_DESKTOP_LOCAL_DECISION = {
  ok: true,
  mode: "desktop-local",
  bindHost: "127.0.0.1",
  localOnly: true,
  remoteAccessAllowed: false,
  proxyTrust: "none",
  forwardedHeadersTrusted: false,
  processModel: "single",
  singleWriter: true,
  dataRootKind: "local",
  userScope: "default",
  databaseProvider: "sqlite",
  databaseConnection: "file",
  identityMode: "desktop-local-session",
  identityProvenance: "launcher-process",
  rawTrustedAuthHeadersAllowed: false,
  restoreApplyAllowed: false,
} as const;

afterEach(() => {
  if (typeof originalDeploymentMode === "string") {
    process.env.PLANNING_DEPLOYMENT_MODE = originalDeploymentMode;
  } else {
    delete process.env.PLANNING_DEPLOYMENT_MODE;
  }
  if (typeof originalPlanningNamespace === "string") {
    process.env.PLANNING_NAMESPACE_ENABLED = originalPlanningNamespace;
  } else {
    delete process.env.PLANNING_NAMESPACE_ENABLED;
  }
});

describe("planning deployment policy", () => {
  it("publishes the three canonical modes and freezes the inventory", () => {
    expect(PLANNING_DEPLOYMENT_MODES).toEqual([
      "desktop-local",
      "web-single",
      "web-multi",
    ]);
    expect(Object.isFrozen(PLANNING_DEPLOYMENT_MODES)).toBe(true);
  });

  it("returns the exact immutable desktop-local invariant", () => {
    const decision = resolvePlanningDeploymentPolicy(desktopLocalInput());

    expect(decision).toEqual(EXACT_DESKTOP_LOCAL_DECISION);
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it.each([undefined, "", " ", "\t"])(
    "fails closed for a missing deployment mode: %s",
    (mode) => {
      expect(resolvePlanningDeploymentPolicy(desktopLocalInput({ mode }))).toEqual({
        ok: false,
        code: "DEPLOYMENT_MODE_MISSING",
        message: "Planning deployment mode is required.",
      });
    },
  );

  it("fails closed when a JavaScript caller supplies null as the mode", () => {
    const input = {
      ...desktopLocalInput(),
      mode: null,
    } as unknown as PlanningDeploymentPolicyInput;

    expect(resolvePlanningDeploymentPolicy(input)).toMatchObject({
      ok: false,
      code: "DEPLOYMENT_MODE_MISSING",
    });
  });

  it.each(["desktop", "DESKTOP-LOCAL", "desktop-local ", "future-mode"])(
    "fails closed for an unknown deployment mode: %s",
    (mode) => {
      expect(resolvePlanningDeploymentPolicy(desktopLocalInput({ mode }))).toEqual({
        ok: false,
        code: "DEPLOYMENT_MODE_UNKNOWN",
        message: "Planning deployment mode is unknown.",
      });
    },
  );

  it.each(["web-single", "web-multi"] as const)(
    "fails closed for the unsupported reserved mode: %s",
    (mode) => {
      expect(resolvePlanningDeploymentPolicy(desktopLocalInput({ mode }))).toEqual({
        ok: false,
        code: "DEPLOYMENT_MODE_UNSUPPORTED",
        message: "Planning deployment mode is not supported.",
      });
    },
  );

  it("rejects an unsupported mode before inspecting desktop-local capabilities", () => {
    expect(resolvePlanningDeploymentPolicy(desktopLocalInput({
      mode: "web-single",
      requestedBindHost: "0.0.0.0",
      desktopLocalIdentityReady: false,
    }))).toMatchObject({
      ok: false,
      code: "DEPLOYMENT_MODE_UNSUPPORTED",
    });
  });

  it.each([
    ["localhost bind", { requestedBindHost: "localhost" }, ["requestedBindHost"]],
    ["all-interface bind", { requestedBindHost: "0.0.0.0" }, ["requestedBindHost"]],
    ["IPv6 loopback bind", { requestedBindHost: "::1" }, ["requestedBindHost"]],
    ["missing bind", { requestedBindHost: undefined }, ["requestedBindHost"]],
    ["trusted proxy", { proxyMode: "trusted" }, ["proxyMode"]],
    ["untrusted proxy", { proxyMode: "untrusted" }, ["proxyMode"]],
    ["unknown proxy", { proxyMode: "unknown" }, ["proxyMode"]],
    ["forwarded header trust", { forwardedHeadersTrusted: true }, ["forwardedHeadersTrusted"]],
    ["raw trusted auth headers", { rawTrustedAuthHeadersEnabled: true }, ["rawTrustedAuthHeadersEnabled"]],
    ["other identity mode", { desktopLocalIdentityMode: "other" }, ["desktopLocalIdentityMode"]],
    ["unknown identity mode", { desktopLocalIdentityMode: "unknown" }, ["desktopLocalIdentityMode"]],
    ["other identity provenance", { desktopLocalIdentityProvenance: "other" }, ["desktopLocalIdentityProvenance"]],
    ["unknown identity provenance", { desktopLocalIdentityProvenance: "unknown" }, ["desktopLocalIdentityProvenance"]],
    ["multi process", { processModel: "multi" }, ["processModel"]],
    ["unknown process model", { processModel: "unknown" }, ["processModel"]],
    ["single-user flag disabled", { singleUserModeEnabled: false }, ["singleUserModeEnabled"]],
    ["raw multi-user namespace enabled", { namespaceEnabled: true }, ["namespaceEnabled"]],
    ["shared data root", { dataRootKind: "shared" }, ["dataRootKind"]],
    ["unknown data root", { dataRootKind: "unknown" }, ["dataRootKind"]],
    ["PostgreSQL provider", { databaseProvider: "postgresql" }, ["databaseProvider"]],
    ["unknown database provider", { databaseProvider: "unknown" }, ["databaseProvider"]],
    ["network database connection", { databaseConnection: "network" }, ["databaseConnection"]],
    ["unknown database connection", { databaseConnection: "unknown" }, ["databaseConnection"]],
  ] satisfies readonly [
    string,
    Partial<PlanningDeploymentPolicyInput>,
    readonly string[],
  ][])("returns a policy conflict for %s", (_label, overrides, conflicts) => {
    expect(resolvePlanningDeploymentPolicy(desktopLocalInput(overrides))).toEqual({
      ok: false,
      code: "DEPLOYMENT_POLICY_CONFLICT",
      message: "Desktop-local deployment policy conflicts with the supplied facts.",
      conflicts,
    });
  });

  it.each([
    ["proxy mode", { proxyMode: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["proxyMode"]],
    ["forwarded header trust", { forwardedHeadersTrusted: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["forwardedHeadersTrusted"]],
    ["raw trusted auth header flag", { rawTrustedAuthHeadersEnabled: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["rawTrustedAuthHeadersEnabled"]],
    ["identity mode", { desktopLocalIdentityMode: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["desktopLocalIdentityMode"]],
    ["identity provenance", { desktopLocalIdentityProvenance: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["desktopLocalIdentityProvenance"]],
    ["identity readiness", { desktopLocalIdentityReady: undefined }, "DEPLOYMENT_AUTH_NOT_READY", ["desktopLocalIdentityReady"]],
    ["process model", { processModel: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["processModel"]],
    ["single-user flag", { singleUserModeEnabled: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["singleUserModeEnabled"]],
    ["namespace flag", { namespaceEnabled: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["namespaceEnabled"]],
    ["data root", { dataRootKind: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["dataRootKind"]],
    ["database provider", { databaseProvider: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["databaseProvider"]],
    ["database connection", { databaseConnection: undefined }, "DEPLOYMENT_POLICY_CONFLICT", ["databaseConnection"]],
  ] satisfies readonly [
    string,
    Partial<PlanningDeploymentPolicyInput>,
    "DEPLOYMENT_POLICY_CONFLICT" | "DEPLOYMENT_AUTH_NOT_READY",
    readonly string[],
  ][])("fails closed when the normalized %s fact is missing", (_label, overrides, code, conflicts) => {
    expect(resolvePlanningDeploymentPolicy(desktopLocalInput(overrides))).toMatchObject({
      ok: false,
      code,
      conflicts,
    });
  });

  it("returns the typed auth-not-ready result when only desktop identity is missing", () => {
    expect(resolvePlanningDeploymentPolicy(desktopLocalInput({
      desktopLocalIdentityReady: false,
    }))).toEqual({
      ok: false,
      code: "DEPLOYMENT_AUTH_NOT_READY",
      message: "Desktop-local identity is not ready.",
      conflicts: ["desktopLocalIdentityReady"],
    });
  });

  it("orders multiple conflicts deterministically", () => {
    expect(resolvePlanningDeploymentPolicy(desktopLocalInput({
      requestedBindHost: "localhost",
      proxyMode: "unknown",
      forwardedHeadersTrusted: true,
      rawTrustedAuthHeadersEnabled: true,
      desktopLocalIdentityMode: "other",
      desktopLocalIdentityProvenance: "other",
      processModel: "multi",
      singleUserModeEnabled: false,
      namespaceEnabled: true,
      dataRootKind: "shared",
      databaseProvider: "postgresql",
      databaseConnection: "network",
      desktopLocalIdentityReady: false,
    }))).toEqual({
      ok: false,
      code: "DEPLOYMENT_POLICY_CONFLICT",
      message: "Desktop-local deployment policy conflicts with the supplied facts.",
      conflicts: [
        "requestedBindHost",
        "proxyMode",
        "forwardedHeadersTrusted",
        "rawTrustedAuthHeadersEnabled",
        "desktopLocalIdentityMode",
        "desktopLocalIdentityProvenance",
        "processModel",
        "singleUserModeEnabled",
        "namespaceEnabled",
        "dataRootKind",
        "databaseProvider",
        "databaseConnection",
        "desktopLocalIdentityReady",
      ],
    });
  });

  it("does not mutate its input", () => {
    const input = desktopLocalInput();
    const before = structuredClone(input);

    resolvePlanningDeploymentPolicy(input);

    expect(input).toEqual(before);
  });

  it("does not let output mutation affect a later call", () => {
    const first = resolvePlanningDeploymentPolicy(desktopLocalInput());
    expect(Reflect.set(first, "bindHost", "0.0.0.0")).toBe(false);

    const second = resolvePlanningDeploymentPolicy(desktopLocalInput());
    expect(second).toEqual(EXACT_DESKTOP_LOCAL_DECISION);
    expect(second).not.toBe(first);
  });

  it("freezes conflict inventories", () => {
    const decision = resolvePlanningDeploymentPolicy(desktopLocalInput({
      proxyMode: "trusted",
    }));
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("expected a rejected policy decision");

    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.conflicts)).toBe(true);
    expect(Reflect.set(decision.conflicts ?? [], "0", "requestedBindHost")).toBe(false);
  });

  it("is independent from process.env for the same normalized input", () => {
    const input = desktopLocalInput();
    const before = resolvePlanningDeploymentPolicy(input);

    process.env.PLANNING_DEPLOYMENT_MODE = "web-multi";
    process.env.PLANNING_NAMESPACE_ENABLED = "true";

    expect(resolvePlanningDeploymentPolicy(input)).toEqual(before);
  });

  it("does not make OAuth provider count a desktop-local capability", () => {
    const input = {
      ...desktopLocalInput(),
      oauthProviderCount: 0,
    };

    expect(resolvePlanningDeploymentPolicy(input)).toEqual(EXACT_DESKTOP_LOCAL_DECISION);
  });

  it("is directly importable by plain Node ESM without a TypeScript loader", () => {
    const moduleUrl = pathToFileURL(path.resolve(
      process.cwd(),
      "src/lib/planning/deployment/policy.mjs",
    )).href;
    const program = [
      `import { resolvePlanningDeploymentPolicy } from ${JSON.stringify(moduleUrl)};`,
      `const decision = resolvePlanningDeploymentPolicy(${JSON.stringify(desktopLocalInput())});`,
      `if (!decision.ok) process.exit(2);`,
      `process.stdout.write(decision.mode);`,
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("desktop-local");
  });

  it("contains no environment, request, filesystem, or network reads", () => {
    const moduleSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/planning/deployment/policy.mjs"),
      "utf8",
    );

    expect(moduleSource).not.toContain("process.env");
    expect(moduleSource).not.toContain("node:fs");
    expect(moduleSource).not.toContain("node:net");
    expect(moduleSource).not.toContain(".headers");
  });

  it("remains disconnected from all Phase B runtime consumers", () => {
    const runtimeConsumers = [
      "middleware.ts",
      "src/lib/dev/localRequest.ts",
      "src/lib/planning/api/routeAuth.ts",
      "src/lib/planning/auth/currentUser.ts",
      "src/lib/planning/store/namespace.ts",
      "scripts/next_prod_safe.mjs",
      "scripts/start_local.mjs",
      "scripts/planning_v2_desktop_launch.mjs",
    ];

    for (const file of runtimeConsumers) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("planning/deployment/policy");
      expect(source, file).not.toContain("resolvePlanningDeploymentPolicy");
    }
  });
});
