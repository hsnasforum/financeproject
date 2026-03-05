import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as noteDELETE, PATCH as notePATCH } from "../src/app/api/planning/v3/news/notes/[noteId]/route";
import { GET as notesGET, POST as notesPOST } from "../src/app/api/planning/v3/news/notes/route";
import { resolveNewsNotesDir } from "../planning/v3/news/notes";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const NOTES_DIR = resolveNewsNotesDir();

function requestGet(pathname: string, host = LOCAL_HOST, withOriginHeaders = false): Request {
  const origin = `http://${host}`;
  const headers = new Headers({ host });
  if (withOriginHeaders) {
    headers.set("origin", origin);
    headers.set("referer", `${origin}/planning/v3/news`);
  }
  return new Request(`${origin}${pathname}`, { method: "GET", headers });
}

function requestPost(pathname: string, body: unknown, withAuth = true): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/news`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function requestPatch(pathname: string, body: unknown, withAuth = true): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/news`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function requestDelete(pathname: string, body: unknown, withAuth = true): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/news`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });
}

function backupNotesDir(): string | null {
  if (!fs.existsSync(NOTES_DIR)) return null;
  const backup = `${NOTES_DIR}.backup-test`;
  fs.rmSync(backup, { recursive: true, force: true });
  fs.renameSync(NOTES_DIR, backup);
  return backup;
}

function restoreNotesDir(backup: string | null): void {
  fs.rmSync(NOTES_DIR, { recursive: true, force: true });
  if (!backup) return;
  fs.mkdirSync(path.dirname(NOTES_DIR), { recursive: true });
  fs.renameSync(backup, NOTES_DIR);
}

describe("planning v3 news notes api", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("GET notes blocks non-local host", async () => {
    const response = await notesGET(requestGet("/api/planning/v3/news/notes", "example.com", true));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("notes CRUD works with local + csrf guards", async () => {
    const backup = backupNotesDir();
    try {
      const denied = await notesPOST(requestPost("/api/planning/v3/news/notes", {
        csrf: "csrf-token",
        targetType: "item",
        targetId: "https://example.com/item-1",
        tags: ["금리"],
        note: "초기 메모",
      }, false));
      expect(denied.status).toBe(403);

      const createdRes = await notesPOST(requestPost("/api/planning/v3/news/notes", {
        csrf: "csrf-token",
        targetType: "item",
        targetId: "https://example.com/item-1",
        tags: ["금리", "관찰"],
        note: "초기 메모",
      }));
      const createdPayload = await createdRes.json() as {
        ok?: boolean;
        data?: { id?: string; tags?: string[]; note?: string; targetType?: string; targetId?: string };
      };
      expect(createdRes.status).toBe(200);
      expect(createdPayload.ok).toBe(true);
      expect(createdPayload.data?.targetType).toBe("item");
      expect(createdPayload.data?.targetId).toBe("https://example.com/item-1");
      const noteId = createdPayload.data?.id ?? "";
      expect(noteId.length).toBeGreaterThan(10);

      const listRes = await notesGET(requestGet("/api/planning/v3/news/notes", LOCAL_HOST, true));
      const listPayload = await listRes.json() as {
        ok?: boolean;
        data?: { total?: number; notes?: Array<{ id?: string; note?: string; tags?: string[] }> };
      };
      expect(listRes.status).toBe(200);
      expect(listPayload.ok).toBe(true);
      expect(listPayload.data?.total).toBe(1);
      expect(listPayload.data?.notes?.[0]?.id).toBe(noteId);
      expect(listPayload.data?.notes?.[0]?.note).toBe("초기 메모");

      const patchRes = await notePATCH(
        requestPatch(`/api/planning/v3/news/notes/${noteId}`, {
          csrf: "csrf-token",
          tags: ["업데이트"],
          note: "수정 메모",
        }),
        { params: Promise.resolve({ noteId }) },
      );
      const patchPayload = await patchRes.json() as {
        ok?: boolean;
        data?: { note?: string; tags?: string[] };
      };
      expect(patchRes.status).toBe(200);
      expect(patchPayload.ok).toBe(true);
      expect(patchPayload.data?.note).toBe("수정 메모");
      expect(patchPayload.data?.tags).toEqual(["업데이트"]);

      const deleteRes = await noteDELETE(
        requestDelete(`/api/planning/v3/news/notes/${noteId}`, {
          csrf: "csrf-token",
        }),
        { params: Promise.resolve({ noteId }) },
      );
      const deletePayload = await deleteRes.json() as { ok?: boolean };
      expect(deleteRes.status).toBe(200);
      expect(deletePayload.ok).toBe(true);

      const listAfterDeleteRes = await notesGET(requestGet("/api/planning/v3/news/notes", LOCAL_HOST, true));
      const listAfterDeletePayload = await listAfterDeleteRes.json() as {
        ok?: boolean;
        data?: { total?: number };
      };
      expect(listAfterDeleteRes.status).toBe(200);
      expect(listAfterDeletePayload.ok).toBe(true);
      expect(listAfterDeletePayload.data?.total).toBe(0);
    } finally {
      restoreNotesDir(backup);
    }
  });
});
