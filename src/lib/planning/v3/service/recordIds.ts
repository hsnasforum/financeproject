import { sanitizeRecordId } from "../../store/paths";

export function normalizePlanningRecordId(value: string): string {
  return sanitizeRecordId(value);
}
