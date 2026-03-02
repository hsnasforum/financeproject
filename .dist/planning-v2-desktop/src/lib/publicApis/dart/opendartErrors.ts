import { type DartApiErrorCode } from "./types";

type Mapped = {
  httpStatus: number;
  code: DartApiErrorCode | "";
  message: string;
  noData: boolean;
};

export function mapOpenDartStatus(status: string, message?: string, api?: "list" | "company"): Mapped {
  void api;
  const s = status.trim();

  if (s === "000") {
    return { code: "", httpStatus: 200, message: "OK", noData: false };
  }

  if (s === "013") {
    return { code: "NO_DATA", httpStatus: 404, message: "조회된 데이터가 없습니다.", noData: true };
  }

  if (s === "020") {
    return { code: "RATE_LIMIT", httpStatus: 429, message: "요청 제한", noData: false };
  }

  if (s === "010") {
    return { code: "AUTH", httpStatus: 401, message: "인증키 오류", noData: false };
  }

  if (s === "011" || s === "012" || s === "901") {
    return { code: "FORBIDDEN", httpStatus: 403, message: "접근 권한 없음", noData: false };
  }

  if (s === "800") {
    return { code: "MAINTENANCE", httpStatus: 503, message: "점검 중", noData: false };
  }

  return { code: "UPSTREAM", httpStatus: 502, message: message || "업스트림 오류", noData: false };
}

export function mapDartErrorToHttp(error: { code: string }): number {
  if (error.code === "INPUT" || error.code === "CONFIG") return 400;
  if (error.code === "AUTH") return 401;
  if (error.code === "FORBIDDEN") return 403;
  if (error.code === "NO_DATA") return 404;
  if (error.code === "RATE_LIMIT") return 429;
  if (error.code === "MAINTENANCE") return 503;
  if (error.code === "UPSTREAM" || error.code === "INTERNAL") return 502;
  return 502;
}

export function toDartApiError(status: string | undefined, message: string | undefined, context: "list" | "company"): { code: DartApiErrorCode; message: string } {
  const mapped = mapOpenDartStatus((status ?? "").trim(), message, context);
  return {
    code: mapped.code || "UPSTREAM",
    message: mapped.message,
  };
}
