import {
  type CsvColumnMapping,
  type CsvMappingValidationError,
  type CsvMappingValidationResult,
} from "./types";

type ValidateCsvMappingOptions = {
  headers?: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasHeader(headers: string[] | undefined, key: string): boolean {
  if (!headers || headers.length < 1) return true;
  return headers.some((header) => asString(header) === key);
}

function pushKeyError(
  errors: CsvMappingValidationError[],
  field: keyof CsvColumnMapping,
  value: string,
  headers?: string[],
): void {
  if (!value) return;
  if (hasHeader(headers, value)) return;
  errors.push({
    field,
    message: `${field} 헤더를 찾을 수 없습니다.`,
  });
}

export function validateCsvMapping(
  mapping: Partial<CsvColumnMapping>,
  options: ValidateCsvMappingOptions = {},
): CsvMappingValidationResult {
  const dateKey = asString(mapping.dateKey);
  const amountKey = asString(mapping.amountKey);
  const inflowKey = asString(mapping.inflowKey);
  const outflowKey = asString(mapping.outflowKey);
  const descKey = asString(mapping.descKey);
  const headers = options.headers;

  const errors: CsvMappingValidationError[] = [];

  if (!dateKey) {
    errors.push({ field: "dateKey", message: "date 컬럼은 필수입니다." });
  }

  const hasAmount = amountKey.length > 0;
  const hasInflow = inflowKey.length > 0;
  const hasOutflow = outflowKey.length > 0;

  if (hasAmount && (hasInflow || hasOutflow)) {
    errors.push({
      field: "amountKey",
      message: "amount 또는 inflow/outflow 중 하나의 모드만 선택할 수 있습니다.",
    });
  }

  if (!hasAmount && (!hasInflow || !hasOutflow)) {
    errors.push({
      field: "amountKey",
      message: "amount 컬럼 또는 inflow+outflow 컬럼이 필요합니다.",
    });
  }

  if (!hasAmount && hasInflow && !hasOutflow) {
    errors.push({
      field: "outflowKey",
      message: "inflow를 사용할 때 outflow도 필요합니다.",
    });
  }

  if (!hasAmount && !hasInflow && hasOutflow) {
    errors.push({
      field: "inflowKey",
      message: "outflow를 사용할 때 inflow도 필요합니다.",
    });
  }

  pushKeyError(errors, "dateKey", dateKey, headers);
  pushKeyError(errors, "amountKey", amountKey, headers);
  pushKeyError(errors, "inflowKey", inflowKey, headers);
  pushKeyError(errors, "outflowKey", outflowKey, headers);
  pushKeyError(errors, "descKey", descKey, headers);

  if (errors.length < 1) return { ok: true };
  return { ok: false, errors };
}

