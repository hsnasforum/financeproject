import { NextResponse } from "next/server";

export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? "").trim() === "production";
}

export function onlyDev() {
  if (isProductionEnv()) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      },
      { status: 404 },
    );
  }
  return null;
}
