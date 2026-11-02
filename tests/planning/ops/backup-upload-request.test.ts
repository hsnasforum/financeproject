import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __BACKUP_MULTIPART_OVERHEAD_BYTES_FOR_TESTS,
  parseBackupUploadFormData,
} from "../../../src/lib/ops/backup/backupUploadRequest";

const originalMaxUploadBytes = process.env.PLANNING_OPS_BACKUP_MAX_UPLOAD_BYTES;

describe("backup upload request parser", () => {
  beforeEach(() => {
    process.env.PLANNING_OPS_BACKUP_MAX_UPLOAD_BYTES = "1024";
  });

  afterEach(() => {
    if (typeof originalMaxUploadBytes === "string") {
      process.env.PLANNING_OPS_BACKUP_MAX_UPLOAD_BYTES = originalMaxUploadBytes;
    } else {
      delete process.env.PLANNING_OPS_BACKUP_MAX_UPLOAD_BYTES;
    }
  });

  it("preserves a valid multipart form and file", async () => {
    const formData = new FormData();
    formData.set("csrf", "csrf-token");
    formData.set("file", new File(["backup"], "backup.enc.json", { type: "application/json" }));
    const request = new Request("http://127.0.0.1:3000/api/settings/backup/preview", {
      method: "POST",
      body: formData,
    });

    const result = await parseBackupUploadFormData(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.formData.get("csrf")).toBe("csrf-token");
    const file = result.formData.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("backup.enc.json");
    expect(await (file as File).text()).toBe("backup");
  });

  it("rejects an oversized declared request without consuming the body", async () => {
    const maxRequestBytes = 1024 + __BACKUP_MULTIPART_OVERHEAD_BYTES_FOR_TESTS;
    const request = new Request("http://127.0.0.1:3000/api/settings/backup/preview", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=test-boundary",
        "content-length": String(maxRequestBytes + 1),
      },
      body: "not-read",
    });

    const result = await parseBackupUploadFormData(request);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION", status: 413 } });
    expect(request.bodyUsed).toBe(false);
  });

  it("rejects an oversized streamed body even when content-length is absent or understated", async () => {
    const maxRequestBytes = 1024 + __BACKUP_MULTIPART_OVERHEAD_BYTES_FOR_TESTS;
    for (const declaredLength of [undefined, "1"]) {
      const request = new Request("http://127.0.0.1:3000/api/settings/backup/preview", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=test-boundary",
          ...(declaredLength ? { "content-length": declaredLength } : {}),
        },
        body: new Uint8Array(maxRequestBytes + 1),
      });

      const result = await parseBackupUploadFormData(request);

      expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION", status: 413 } });
      expect(request.bodyUsed).toBe(true);
    }
  });
});
