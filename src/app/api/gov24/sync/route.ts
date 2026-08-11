import { NextResponse } from "next/server";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "OPERATOR_COMMAND_REQUIRED",
        message: "Gov24 전체 갱신은 HTTP 요청으로 실행할 수 없습니다.",
        hint: "로컬 운영 터미널에서 pnpm gov24:sync:if-stale 명령을 실행하세요.",
      },
    },
    { status: 403 },
  );
}
