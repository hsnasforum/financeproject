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

const LOCAL_HOST = "localhost:3000";

function buildGetRequest(urlPath: string, host = LOCAL_HOST): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
    },
  });
}

function buildJsonRequest(method: string, urlPath: string, body: unknown, host = LOCAL_HOST): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method,
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning profiles route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-profiles-route-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_PROFILE_META_PATH = path.join(root, "vault", "profiles.meta.json");
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

    fs.rmSync(root, { recursive: true, force: true });
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
});
