import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as profilesGET, POST as profilesPOST } from "../../src/app/api/planning/profiles/route";
import { PATCH as profilePATCH } from "../../src/app/api/planning/profiles/[id]/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalProfileMetaPath = process.env.PLANNING_PROFILE_META_PATH;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

const LOCAL_HOST = "localhost:3000";

function buildGetRequest(urlPath: string, host = LOCAL_HOST, extraHeaders: Record<string, string> = {}): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
      ...extraHeaders,
    },
  });
}

function buildJsonRequest(
  method: string,
  urlPath: string,
  body: unknown,
  host = LOCAL_HOST,
  extraHeaders: Record<string, string> = {},
): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method,
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function userHeaders(userId: string): Record<string, string> {
  return { "x-planning-user-id": userId };
}

describe("planning profiles route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-profiles-route-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_PROFILE_META_PATH = path.join(root, "vault", "profiles.meta.json");
    env.PLANNING_AUTH_REQUIRED = "0";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalProfileMetaPath === "string") env.PLANNING_PROFILE_META_PATH = originalProfileMetaPath;
    else delete env.PLANNING_PROFILE_META_PATH;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    if (typeof originalNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalNamespaceEnabled;
    else delete env.PLANNING_NAMESPACE_ENABLED;

    if (typeof originalAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;

    if (typeof originalTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalTrustAuthHeaders;
    else delete env.PLANNING_TRUST_AUTH_HEADERS;

    if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
    else delete env.AUTH_SECRET;

    if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
    else delete env.NEXTAUTH_SECRET;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps profile routes behind the profiles repository boundary", () => {
    const routePaths = [
      "src/app/api/planning/profiles/route.ts",
      "src/app/api/planning/profiles/[id]/route.ts",
      "src/app/api/planning/v2/profiles/route.ts",
      "src/app/api/planning/v2/profiles/[id]/route.ts",
      "src/app/api/planning/v2/trash/route.ts",
      "src/app/api/planning/v2/trash/restore/route.ts",
    ];

    for (const routePath of routePaths) {
      const routeSource = fs.readFileSync(path.join(process.cwd(), routePath), "utf-8");
      expect(routeSource).not.toContain("planning/server/store/profileStore");
      expect(routeSource).toContain("planning/server/profiles/repository");
    }
  });

  it("returns the standard 401 response when profile list auth is required", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    const res = await profilesGET(buildGetRequest("/api/planning/profiles"));
    const payload = await res.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
      meta?: unknown;
    };

    expect(res.status).toBe(401);
    expect(payload).toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
      },
    });
  });

  it("returns the standard 403 response when trusted profile headers are disabled", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    const res = await profilesGET(buildGetRequest(
      "/api/planning/profiles",
      LOCAL_HOST,
      userHeaders("attacker"),
    ));
    const payload = await res.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
      meta?: unknown;
    };

    expect(res.status).toBe(403);
    expect(payload).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "신뢰된 인증 헤더가 비활성화되어 있습니다.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("attacker");
  });

  it("keeps the profile list local fallback explicit when auth is disabled", async () => {
    env.PLANNING_AUTH_REQUIRED = "0";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    const res = await profilesGET(buildGetRequest("/api/planning/profiles"));
    const payload = await res.json() as {
      ok?: boolean;
      data?: unknown[];
      meta?: { userId?: string; authSource?: string };
    };

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.meta).toMatchObject({
      userId: "default",
      authSource: "local-namespace",
    });
  });

  it("accepts profile list trusted headers only through the explicit local bridge", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";

    const res = await profilesGET(buildGetRequest(
      "/api/planning/profiles",
      LOCAL_HOST,
      userHeaders("alice"),
    ));
    const payload = await res.json() as {
      ok?: boolean;
      data?: unknown[];
      meta?: { userId?: string; authSource?: string };
    };

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
    });
  });

  it("supports list/create/rename/set-default", async () => {
    const createARes = await profilesPOST(buildJsonRequest("POST", "/api/planning/profiles", {
      name: "가계부 A",
      isDefault: true,
    }));
    const createA = await createARes.json() as {
      ok?: boolean;
      data?: { profileId?: string; isDefault?: boolean };
    };
    expect(createARes.status).toBe(201);
    expect(createA.ok).toBe(true);
    const profileAId = String(createA.data?.profileId ?? "");
    expect(profileAId).toBeTruthy();

    const createBRes = await profilesPOST(buildJsonRequest("POST", "/api/planning/profiles", {
      name: "가계부 B",
    }));
    const createB = await createBRes.json() as {
      ok?: boolean;
      data?: { profileId?: string };
    };
    expect(createBRes.status).toBe(201);
    const profileBId = String(createB.data?.profileId ?? "");
    expect(profileBId).toBeTruthy();

    const patchRes = await profilePATCH(
      buildJsonRequest("PATCH", `/api/planning/profiles/${profileBId}`, {
        name: "가계부 B-수정",
        isDefault: true,
      }),
      { params: Promise.resolve({ id: profileBId }) },
    );
    const patched = await patchRes.json() as {
      ok?: boolean;
      data?: { profileId?: string; name?: string; isDefault?: boolean };
    };
    expect(patchRes.status).toBe(200);
    expect(patched.ok).toBe(true);
    expect(patched.data?.profileId).toBe(profileBId);
    expect(patched.data?.name).toBe("가계부 B-수정");
    expect(patched.data?.isDefault).toBe(true);

    const listRes = await profilesGET(buildGetRequest("/api/planning/profiles"));
    const listed = await listRes.json() as {
      ok?: boolean;
      data?: Array<{ profileId?: string; isDefault?: boolean }>;
      meta?: { defaultProfileId?: string };
    };
    expect(listRes.status).toBe(200);
    expect(listed.ok).toBe(true);
    expect(listed.meta?.defaultProfileId).toBe(profileBId);
    expect((listed.data ?? []).some((row) => row.profileId === profileAId)).toBe(true);
    expect((listed.data ?? []).find((row) => row.profileId === profileBId)?.isDefault).toBe(true);
  });

  it("scopes profile reads and writes to the current planning user when namespace is enabled", async () => {
    delete env.PLANNING_PROFILES_DIR;
    delete env.PLANNING_RUNS_DIR;
    delete env.PLANNING_PROFILE_META_PATH;
    env.PLANNING_DATA_DIR = path.join(root, "planning-data");
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";

    const createAliceRes = await profilesPOST(buildJsonRequest("POST", "/api/planning/profiles", {
      name: "Alice profile",
      isDefault: true,
    }, LOCAL_HOST, userHeaders("alice")));
    const createAlice = await createAliceRes.json() as {
      ok?: boolean;
      data?: { profileId?: string; name?: string };
      meta?: { userId?: string };
    };
    expect(createAliceRes.status).toBe(201);
    expect(createAlice.ok).toBe(true);
    expect(createAlice.meta?.userId).toBe("alice");
    const aliceProfileId = String(createAlice.data?.profileId ?? "");
    expect(aliceProfileId).toBeTruthy();

    const createBobRes = await profilesPOST(buildJsonRequest("POST", "/api/planning/profiles", {
      name: "Bob profile",
      isDefault: true,
    }, LOCAL_HOST, userHeaders("bob")));
    const createBob = await createBobRes.json() as {
      ok?: boolean;
      data?: { profileId?: string; name?: string };
      meta?: { userId?: string };
    };
    expect(createBobRes.status).toBe(201);
    expect(createBob.ok).toBe(true);
    expect(createBob.meta?.userId).toBe("bob");
    const bobProfileId = String(createBob.data?.profileId ?? "");
    expect(bobProfileId).toBeTruthy();
    expect(bobProfileId).not.toBe(aliceProfileId);

    const aliceListRes = await profilesGET(buildGetRequest("/api/planning/profiles", LOCAL_HOST, userHeaders("alice")));
    const aliceList = await aliceListRes.json() as {
      ok?: boolean;
      data?: Array<{ profileId?: string; name?: string }>;
      meta?: { defaultProfileId?: string; userId?: string };
    };
    expect(aliceListRes.status).toBe(200);
    expect(aliceList.ok).toBe(true);
    expect(aliceList.meta?.userId).toBe("alice");
    expect(aliceList.meta?.defaultProfileId).toBe(aliceProfileId);
    expect((aliceList.data ?? []).map((row) => row.profileId)).toEqual([aliceProfileId]);

    const bobListRes = await profilesGET(buildGetRequest("/api/planning/profiles", LOCAL_HOST, userHeaders("bob")));
    const bobList = await bobListRes.json() as {
      ok?: boolean;
      data?: Array<{ profileId?: string; name?: string }>;
      meta?: { defaultProfileId?: string; userId?: string };
    };
    expect(bobListRes.status).toBe(200);
    expect(bobList.ok).toBe(true);
    expect(bobList.meta?.userId).toBe("bob");
    expect(bobList.meta?.defaultProfileId).toBe(bobProfileId);
    expect((bobList.data ?? []).map((row) => row.profileId)).toEqual([bobProfileId]);
  });
});
