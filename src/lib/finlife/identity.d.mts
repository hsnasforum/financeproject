export class FinlifeIntegrityError extends Error { code: string; }
export function normalizeFinlifeCompany(value: unknown): string;
export function finlifeIdentity(kind: string, row: Record<string, unknown>): string;
export function finlifeRowKey(row: unknown): string;
export function canonicalFinlifeValue(value: unknown): string;
export function joinFinlifeRows(baseList: unknown[], optionList: unknown[], options?: {kind?: string; strict?: boolean}): Array<{raw: Record<string, unknown>; options: Record<string, unknown>[]}>;
export function validateFinlifeResponse(kind: string, payload: unknown, options?: {pageNo?: number}): Array<{raw: Record<string, unknown>; options: Record<string, unknown>[]}>;
export function mergeFinlifeProducts<T extends {fin_prdt_cd: string; fin_co_no?: string; raw: Record<string, unknown>; options: unknown[]}>(items: T[], options?: {kind?: string}): T[];
export function validateFinlifeProducts<T extends {fin_prdt_cd: string; fin_co_no?: string; raw: Record<string, unknown>; options: unknown[]}>(kind: string, items: T[]): T[];
