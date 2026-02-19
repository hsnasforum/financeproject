import { type DartApiError, type DartApiErrorCode } from "./types";

type Context = "company" | "list" | "common";

type Mapped = {
  httpStatus: number;
  code: DartApiErrorCode;
  message: string;
  noData: boolean;
};

export function mapOpenDartStatus(status: string | undefined, message: string | undefined, context: Context): Mapped {
  const s = (status ?? "").trim();
  const m = (message ?? "").trim() || "OpenDART 요청에 실패했습니다.";

  if (s === "000") {
    return { httpStatus: 200, code: "UPSTREAM", message: m, noData: false };
  }

  if (s === "013") {
    return {
      httpStatus: context === "list" ? 200 : 404,
      code: "NO_DATA",
      message: context === "list" ? "조회된 공시가 없습니다." : "조회된 데이터가 없습니다.",
      noData: true,
    };
  }

  if (s === "020") {
    return { httpStatus: 429, code: "RATE_LIMIT", message: "요청 제한을 초과했습니다. 잠시 후 다시 시도하세요.", noData: false };
  }

  if (s === "010") {
    return { httpStatus: 401, code: "AUTH", message: "등록되지 않은 API 키입니다.", noData: false };
  }

  if (s === "011" || s === "012" || s === "901") {
    return { httpStatus: 403, code: "FORBIDDEN", message: "사용 권한이 없는 API 키입니다.", noData: false };
  }

  if (s === "800") {
    return { httpStatus: 503, code: "MAINTENANCE", message: "OpenDART 점검 중입니다. 잠시 후 다시 시도하세요.", noData: false };
  }

  if (s === "900") {
    return { httpStatus: 502, code: "UPSTREAM", message: "OpenDART 응답을 처리하지 못했습니다.", noData: false };
  }

  return { httpStatus: 502, code: "UPSTREAM", message: m, noData: false };
}

export function mapDartErrorToHttp(error: DartApiError): number {
  const table: Record<DartApiErrorCode, number> = {
    CONFIG: 503,
    INPUT: 400,
    NO_INDEX: 409,
    NO_DATA: 404,
    RATE_LIMIT: 429,
    AUTH: 401,
    FORBIDDEN: 403,
    MAINTENANCE: 503,
    UPSTREAM: 502,
    INTERNAL: 500,
  };
  return table[error.code] ?? 500;
}

export function toDartApiError(status: string | undefined, message: string | undefined, context: Context): DartApiError {
  const mapped = mapOpenDartStatus(status, message, context);
  return {
    code: mapped.code,
    message: mapped.message,
  };
}
