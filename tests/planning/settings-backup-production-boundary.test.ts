import fs from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as exportPOST } from "../../src/app/api/settings/backup/export/route";
import { POST as previewPOST } from "../../src/app/api/settings/backup/preview/route";
import { POST as restorePOST } from "../../src/app/api/settings/backup/restore/route";
import { GET as statusGET } from "../../src/app/api/settings/backup/status/route";
import { BackupExportCard } from "../../src/components/ops/backup/BackupExportCard";
import { BackupRestoreControlsCard } from "../../src/components/ops/backup/BackupRestoreControlsCard";

const LOCAL_HOST = "127.0.0.1:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const ENV_KEYS = [
  "ALLOW_REMOTE",
  "PLANNING_DEPLOYMENT_MODE",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_SINGLE_USER_MODE",
  "PLANNING_OPS_BACKUP_MAX_UPLOAD_BYTES",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function requestHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/settings/backup`,
    "sec-fetch-site": "same-origin",
    "x-planning-user-id": "backup-user",
    ...extra,
  };
}

function invalidCsrfFormRequest(pathname: string): Request {
  const formData = new FormData();
  formData.set("csrf", "body-token");
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers: requestHeaders({ cookie: "planning_vault_csrf=cookie-token" }),
    body: formData,
  });
}

describe("production settings backup boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_REMOTE = "0";
    delete process.env.PLANNING_DEPLOYMENT_MODE;
    process.env.PLANNING_AUTH_REQUIRED = "1";
    process.env.PLANNING_TRUST_AUTH_HEADERS = "1";
    process.env.PLANNING_NAMESPACE_ENABLED = "1";
    process.env.PLANNING_SINGLE_USER_MODE = "0";
    process.env.PLANNING_OPS_BACKUP_MAX_UPLOAD_BYTES = "1024";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (typeof value === "string") process.env[key] = value;
      else delete process.env[key];
    }
  });

  it("issues a user-scoped CSRF token in production instead of returning the dev-only 404", async () => {
    const response = await statusGET(new Request(`${LOCAL_ORIGIN}/api/settings/backup/status`, {
      headers: requestHeaders(),
    }));
    const payload = await response.json() as {
      ok?: boolean;
      csrfToken?: string;
      meta?: { userId?: string; authSource?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.csrfToken).toBeTruthy();
    expect(payload.meta).toEqual({
      userId: "backup-user",
      authSource: "trusted-header",
    });
    expect(response.headers.get("set-cookie")).toContain("planning_vault_csrf=");
  });

  it.each([
    ["export", () => exportPOST(new Request(`${LOCAL_ORIGIN}/api/settings/backup/export`, {
      method: "POST",
      headers: requestHeaders({
        cookie: "planning_vault_csrf=cookie-token",
        "content-type": "application/json",
      }),
      body: JSON.stringify({ csrf: "body-token", passphrase: "test-passphrase" }),
    }))],
    ["preview", () => previewPOST(invalidCsrfFormRequest("/api/settings/backup/preview"))],
    ["restore", () => restorePOST(invalidCsrfFormRequest("/api/settings/backup/restore"))],
  ])("keeps %s enabled in production and fails closed on CSRF", async (_name, invoke) => {
    const response = await invoke();
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });

  it.each([
    ["preview", previewPOST, "/api/settings/backup/preview"],
    ["restore", restorePOST, "/api/settings/backup/restore"],
  ])("rejects remote %s requests before consuming multipart data", async (_name, handler, pathname) => {
    const formData = new FormData();
    formData.set("csrf", "body-token");
    const request = new Request(`http://example.com${pathname}`, {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "http://example.com",
        referer: `http://example.com/settings/backup`,
        "sec-fetch-site": "same-origin",
        "x-planning-user-id": "backup-user",
      },
      body: formData,
    });

    const response = await handler(request);

    expect(response.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
  });

  it.each([
    ["preview", previewPOST, "/api/settings/backup/preview"],
    ["restore", restorePOST, "/api/settings/backup/restore"],
  ])("rejects cross-origin %s requests before consuming multipart data", async (_name, handler, pathname) => {
    const formData = new FormData();
    formData.set("csrf", "body-token");
    const request = new Request(`${LOCAL_ORIGIN}${pathname}`, {
      method: "POST",
      headers: requestHeaders({
        origin: "https://attacker.example",
        referer: "https://attacker.example/backup",
        "sec-fetch-site": "cross-site",
      }),
      body: formData,
    });

    const response = await handler(request);

    expect(response.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
  });

  it.each([
    ["preview", previewPOST, "/api/settings/backup/preview"],
    ["restore", restorePOST, "/api/settings/backup/restore"],
  ])("rejects unauthenticated %s requests before consuming multipart data", async (_name, handler, pathname) => {
    const formData = new FormData();
    formData.set("csrf", "body-token");
    const request = new Request(`${LOCAL_ORIGIN}${pathname}`, {
      method: "POST",
      headers: {
        host: LOCAL_HOST,
        origin: LOCAL_ORIGIN,
        referer: `${LOCAL_ORIGIN}/settings/backup`,
        "sec-fetch-site": "same-origin",
      },
      body: formData,
    });

    const response = await handler(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  });

  it.each([
    ["preview", previewPOST, "/api/settings/backup/preview"],
    ["restore", restorePOST, "/api/settings/backup/restore"],
  ])("rejects an oversized declared %s request before consuming its body", async (_name, handler, pathname) => {
    const request = new Request(`${LOCAL_ORIGIN}${pathname}`, {
      method: "POST",
      headers: requestHeaders({
        "content-type": "multipart/form-data; boundary=test-boundary",
        "content-length": String(1024 + 256 * 1024 + 1),
      }),
      body: "not-read",
    });

    const response = await handler(request);

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it.each([
    ["without credentials", ""],
    ["with a fake session cookie", "authjs.session-token=fake-session"],
  ])("rejects export %s before consuming JSON", async (_name, authCookie) => {
    const request = new Request(`${LOCAL_ORIGIN}/api/settings/backup/export`, {
      method: "POST",
      headers: {
        host: LOCAL_HOST,
        origin: LOCAL_ORIGIN,
        referer: `${LOCAL_ORIGIN}/settings/backup`,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        cookie: ["planning_vault_csrf=cookie-token", authCookie].filter(Boolean).join("; "),
      },
      body: JSON.stringify({ csrf: "cookie-token", passphrase: "test-passphrase" }),
    });

    const response = await exportPOST(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  });

  it("rejects an oversized declared export JSON request before consuming its body", async () => {
    const request = new Request(`${LOCAL_ORIGIN}/api/settings/backup/export`, {
      method: "POST",
      headers: requestHeaders({
        cookie: "planning_vault_csrf=cookie-token",
        "content-type": "application/json",
        "content-length": String(32 * 1024 + 1),
      }),
      body: "not-read",
    });

    const response = await exportPOST(request);

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it("stops a streamed export JSON request after the 32 KiB limit", async () => {
    const encoder = new TextEncoder();
    const request = new Request(`${LOCAL_ORIGIN}/api/settings/backup/export`, {
      method: "POST",
      headers: requestHeaders({
        cookie: "planning_vault_csrf=cookie-token",
        "content-type": "application/json",
      }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("x".repeat(16 * 1024)));
          controller.enqueue(encoder.encode("x".repeat(16 * 1024 + 1)));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await exportPOST(request);

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(true);
  });

  it("keeps the public settings UI off every dev-only backup and recovery endpoint", () => {
    const backupClient = fs.readFileSync(path.join(process.cwd(), "src/components/OpsBackupClient.tsx"), "utf8");
    const recoveryClient = fs.readFileSync(path.join(process.cwd(), "src/components/RecoveryClient.tsx"), "utf8");
    const routeSources = ["export", "preview", "restore", "status"].map((segment) => fs.readFileSync(
      path.join(process.cwd(), `src/app/api/settings/backup/${segment}/route.ts`),
      "utf8",
    ));
    const finalizeRouteSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/settings/backup/export/finalize/route.ts"),
      "utf8",
    );

    expect(backupClient).toContain("/api/settings/backup");
    expect(backupClient).toContain('formData.set("previewToken", previewToken)');
    expect(recoveryClient).not.toContain("/api/dev/");
    expect(recoveryClient).not.toContain("DoctorSummaryCard");
    for (const source of routeSources) {
      expect(source).not.toContain("onlyDev");
      expect(source).toContain("withPlanningRouteUser");
      expect(source).toContain("assertLocalHost");
      expect(source).toContain("assertSameOrigin");
    }
    expect(finalizeRouteSource).not.toContain("onlyDev");
    expect(finalizeRouteSource).toContain("withPlanningRouteUser");
    expect(finalizeRouteSource).toContain("readBoundedBackupJson");
  });

  it("requires an explicit saved-file confirmation instead of finalizing after blob receipt", () => {
    const backupClient = fs.readFileSync(path.join(process.cwd(), "src/components/OpsBackupClient.tsx"), "utf8");
    const exportHandlerStart = backupClient.indexOf("async function handleExport()");
    const finalizeHandlerStart = backupClient.indexOf("async function handleFinalizeExport()");
    expect(exportHandlerStart).toBeGreaterThanOrEqual(0);
    expect(finalizeHandlerStart).toBeGreaterThan(exportHandlerStart);

    const exportHandler = backupClient.slice(exportHandlerStart, finalizeHandlerStart);
    expect(exportHandler).toContain("await response.blob()");
    expect(exportHandler).toContain("setPendingExportConfirmation");
    expect(exportHandler).not.toContain("/export/finalize");
    expect(backupClient.slice(finalizeHandlerStart)).toContain("/export/finalize");
    expect(backupClient).toContain("파일 저장을 확인했습니다");
  });
});

describe("settings backup detail data guidance", () => {
  const FULL_REPLACE_LABEL = "백업 시점의 전체 사용자 데이터로 교체";
  const INCLUDED_ONLY_REPLACE_LABEL = "백업 파일에 포함된 기록으로 교체";
  const MISSING_DETAIL_NOTE = "이 백업에는 상세 계좌·거래·분류 데이터가 없";

  function renderRestoreCard(overrides: Partial<ComponentProps<typeof BackupRestoreControlsCard>> = {}): string {
    return renderToStaticMarkup(createElement(BackupRestoreControlsCard, {
      canUpload: true,
      file: new File(["{}"], "backup.enc.json"),
      hasCsrf: true,
      isSettingsSurface: true,
      mode: "replace",
      passphrase: "test-passphrase",
      previewIncludesPlanningV3: false,
      previewToken: "",
      previewing: false,
      restoring: false,
      selectedName: "backup.enc.json",
      selectedSize: 2,
      onFileChange: () => undefined,
      onModeChange: () => undefined,
      onPassphraseChange: () => undefined,
      onPreview: () => undefined,
      onRestore: () => undefined,
      ...overrides,
    }));
  }

  function restoreButtonTag(html: string): string {
    const tag = html.match(/<button[^>]*data-testid="ops-backup-restore-button"[^>]*>/u)?.[0];
    if (!tag) throw new Error("restore button not rendered");
    return tag;
  }

  function renderExportCard(isSettingsSurface: boolean): string {
    return renderToStaticMarkup(createElement(BackupExportCard, {
      exportGzip: true,
      exportMode: "full",
      exporting: false,
      finalizingExport: false,
      hasCsrf: true,
      isSettingsSurface,
      passphrase: "",
      pendingExportConfirmation: null,
      previewing: false,
      restoring: false,
      savedFileConfirmationLabel: "파일 저장을 확인했습니다",
      onExport: () => undefined,
      onExportGzipChange: () => undefined,
      onExportModeChange: () => undefined,
      onFinalizeExport: () => undefined,
      onPassphraseChange: () => undefined,
    }));
  }

  it("does not promise full replacement before a preview confirms the backup scope", () => {
    const html = renderRestoreCard();

    expect(html).toContain(INCLUDED_ONLY_REPLACE_LABEL);
    expect(html).not.toContain(FULL_REPLACE_LABEL);
    expect(html).not.toContain(MISSING_DETAIL_NOTE);
    expect(restoreButtonTag(html)).toMatch(/\sdisabled=""/u);
  });

  it.each([
    ["replace", "교체해도 상세 데이터는 바뀌지 않고, 백업에 담긴 프로필·실행 기록만 교체합니다."],
    ["merge", "이 백업에는 상세 계좌·거래·분류 데이터가 없어 복원되지 않습니다."],
  ] as const)("states the real %s scope for a previewed backup without detail data", (mode, expected) => {
    const html = renderRestoreCard({ mode, previewToken: "preview-token" });

    expect(html).toContain(expected);
    expect(html).toContain(INCLUDED_ONLY_REPLACE_LABEL);
    expect(html).not.toContain(FULL_REPLACE_LABEL);
    expect(html).not.toContain("상세 계좌·거래·분류 데이터까지 백업 시점 상태로 교체 복원합니다.");
    expect(restoreButtonTag(html)).not.toMatch(/\sdisabled=""/u);
  });

  it("keeps the existing guidance for a previewed backup with detail data", () => {
    const replaceHtml = renderRestoreCard({ previewIncludesPlanningV3: true, previewToken: "preview-token" });
    const mergeHtml = renderRestoreCard({ mode: "merge", previewIncludesPlanningV3: true, previewToken: "preview-token" });

    expect(replaceHtml).toContain(FULL_REPLACE_LABEL);
    expect(replaceHtml).toContain("상세 계좌·거래·분류 데이터까지 백업 시점 상태로 교체 복원합니다.");
    expect(replaceHtml).not.toContain(MISSING_DETAIL_NOTE);
    expect(mergeHtml).toContain("기존 기록 유지 방식에서는 현재 상세 데이터 변경을 보호하기 위해 계좌·거래·분류 데이터를 복원하지 않습니다.");
    expect(mergeHtml).not.toContain(MISSING_DETAIL_NOTE);
  });

  it("does not add the settings detail data note to the ops surface", () => {
    const html = renderRestoreCard({ isSettingsSurface: false, previewToken: "preview-token" });

    expect(html).toContain("백업 시점 기록으로 교체");
    expect(html).not.toContain(MISSING_DETAIL_NOTE);
  });

  it("points export users to the preview instead of asserting detail data is included", () => {
    const backupClient = fs.readFileSync(path.join(process.cwd(), "src/components/OpsBackupClient.tsx"), "utf8");
    const settingsHtml = renderExportCard(true);

    expect(settingsHtml).toContain("상세 계좌·거래·분류 데이터의 포함 여부는 내려받은 파일의 미리보기에서 확인해 주세요.");
    expect(settingsHtml).not.toContain("후속 행동 기록과 상세 계좌·거래·분류 데이터를");
    expect(renderExportCard(false)).toContain("프로필, 실행 결과, 가정 기록과 후속 행동 상태를 암호화 백업 파일로 내려받습니다.");
    expect(backupClient).toContain("미리보기에서 포함 여부를 확인해 주세요.");
    expect(backupClient).not.toContain("프로필·실행 기록과 상세 계좌·거래·분류 데이터가 포함됩니다.");
  });

  it("uses the detail data confirmation copy only for a backup that includes it", () => {
    const backupClient = fs.readFileSync(path.join(process.cwd(), "src/components/OpsBackupClient.tsx"), "utf8");

    expect(backupClient).toContain("const restoreConfirmUsesDetailCopy = isSettingsSurface && previewIncludesPlanningV3;");
    expect(backupClient).toContain("isSettingsSurface={restoreConfirmUsesDetailCopy}");
  });
});
