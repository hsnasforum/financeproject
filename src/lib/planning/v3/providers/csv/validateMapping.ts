import { type CsvColumnMapping, type CsvMappingValidationError, type CsvMappingValidationResult } from "./types";

type ValidateCsvMappingOptions = {
  headers?: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pushError(errors: CsvMappingValidationError[], field: string, message: string): void {
  errors.push({ field, message });
}

export function validateCsvMapping(
  mapping: CsvColumnMapping,
  options: ValidateCsvMappingOptions = {},
): CsvMappingValidationResult {
  const errors: CsvMappingValidationError[] = [];

  const dateKey = asString(mapping.dateKey);
  const amountKey = asString(mapping.amountKey);
  const inflowKey = asString(mapping.inflowKey);
  const outflowKey = asString(mapping.outflowKey);
  const descKey = asString(mapping.descKey);

  if (!dateKey) {
    pushError(errors, "dateKey", "date 컬럼은 필수입니다.");
  }

  const hasAmount = amountKey.length > 0;
  const hasInflow = inflowKey.length > 0;
  const hasOutflow = outflowKey.length > 0;

  if (hasAmount && (hasInflow || hasOutflow)) {
    pushError(errors, "amount", "amountKey와 inflow/outflow는 동시에 사용할 수 없습니다.");
  }

  if (!hasAmount && (!hasInflow || !hasOutflow)) {
    pushError(errors, "amount", "amountKey 또는 inflowKey+outflowKey 조합이 필요합니다.");
  }

  const selectedHeaders: Array<[string, string]> = [
    ["dateKey", dateKey],
    ["amountKey", amountKey],
    ["inflowKey", inflowKey],
    ["outflowKey", outflowKey],
    ["descKey", descKey],
  ].filter((entry): entry is [string, string] => entry[1].length > 0);

  const byHeader = new Map<string, string[]>();
  for (const [field, header] of selectedHeaders) {
    const mappedFields = byHeader.get(header) ?? [];
    mappedFields.push(field);
    byHeader.set(header, mappedFields);
  }

  for (const [header, fields] of byHeader.entries()) {
    if (fields.length > 1) {
      pushError(errors, "conflict", `헤더 "${header}"가 여러 필드(${fields.join(", ")})에 중복 선택되었습니다.`);
    }
  }

  if (options.headers && options.headers.length > 0) {
    const headerSet = new Set(options.headers.map((header) => asString(header)).filter((header) => header.length > 0));
    for (const [field, header] of selectedHeaders) {
      if (!headerSet.has(header)) {
        pushError(errors, field, `헤더 "${header}"를 찾을 수 없습니다.`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return { ok: true };
}
