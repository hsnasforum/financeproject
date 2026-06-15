import { NextResponse } from "next/server";
import { guardDevReadRequest } from "@/lib/dev/devGuards";
import { readArtifact } from "../../../../lib/dev/readWhitelistedFile";

export async function GET(request: Request) {
  const blocked = guardDevReadRequest(request);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") ?? "";
  const result = readArtifact(name);
  if (!result.ok) {
    const status = result.error.code === "INPUT" ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    data: result.data,
  });
}
