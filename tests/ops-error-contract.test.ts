import { describe, expect, it } from "vitest";
import { toOpsContractError } from "../src/lib/ops/errorContract";

describe("ops error contract fixHref mapping", () => {
  it("maps LOCKED to /ops/security", () => {
    const result = toOpsContractError({
      code: "LOCKED",
      message: "locked",
      status: 423,
    });
    expect(result.body.error.code).toBe("LOCKED");
    expect(result.body.error.fixHref).toBe("/ops/security");
  });

  it("maps STALE_ASSUMPTIONS to /ops/assumptions", () => {
    const result = toOpsContractError({
      code: "SNAPSHOT_STALE",
      message: "stale",
      status: 409,
    });
    expect(result.body.error.code).toBe("STALE_ASSUMPTIONS");
    expect(result.body.error.fixHref).toBe("/ops/assumptions");
  });

  it("maps SNAPSHOT_NOT_FOUND to STALE_ASSUMPTIONS", () => {
    const result = toOpsContractError({
      code: "SNAPSHOT_NOT_FOUND",
      message: "not found",
      status: 404,
    });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("STALE_ASSUMPTIONS");
    expect(result.body.error.fixHref).toBe("/ops/assumptions");
  });

  it("maps STORAGE_CORRUPT to /ops/doctor", () => {
    const result = toOpsContractError({
      code: "STORAGE_CORRUPT",
      message: "corrupt",
      status: 500,
    });
    expect(result.body.error.code).toBe("STORAGE_CORRUPT");
    expect(result.body.error.fixHref).toBe("/ops/doctor");
  });

  it("maps MIGRATION_FAILED to STORAGE_CORRUPT contract", () => {
    const result = toOpsContractError({
      code: "MIGRATION_FAILED",
      message: "migration failed",
      status: 500,
    });
    expect(result.body.error.code).toBe("STORAGE_CORRUPT");
    expect(result.body.error.fixHref).toBe("/ops/doctor");
  });

  it("maps BACKUP_INVALID to /ops/backup", () => {
    const result = toOpsContractError({
      code: "MANIFEST_INVALID_JSON",
      message: "invalid",
      status: 400,
    });
    expect(result.body.error.code).toBe("BACKUP_INVALID");
    expect(result.body.error.fixHref).toBe("/ops/backup");
  });
});
