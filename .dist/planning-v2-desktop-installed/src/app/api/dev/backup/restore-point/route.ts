import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { onlyDev } from "@/lib/dev/onlyDev";

const RESTORE_POINT_PATH = path.join(process.cwd(), "tmp", "backup_restore_point.json");

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    if (!fs.existsSync(RESTORE_POINT_PATH)) {
      return NextResponse.json({
        ok: true,
        data: {
          exists: false,
          createdAt: null,
        },
      });
    }

    let createdAt: string | null = null;
    try {
      const stat = fs.statSync(RESTORE_POINT_PATH);
      createdAt = stat.mtime.toISOString();
    } catch {
      createdAt = null;
    }

    return NextResponse.json({
      ok: true,
      data: {
        exists: true,
        createdAt,
      },
    });
  } catch (error) {
    console.error("[dev/backup/restore-point] failed to inspect restore point", error);
    return NextResponse.json({
      ok: true,
      data: {
        exists: false,
        createdAt: null,
      },
      meta: {
        degraded: true,
        reasonCode: "RESTORE_POINT_READ_FAILED",
      },
    });
  }
}
