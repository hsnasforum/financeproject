export type EximExchangeContext = { requestedDate?: string };

export type ValidatedEximExchange = {
  asOf: string;
  rates: Record<string, number>;
  rowCount: number;
};

export function parseExchangeRate(value: unknown): number | null;
export function normalizeExchangeCurrencyUnit(raw: string): { code: string; scale: number } | null;
export function normalizeExchangeQuoteDate(value: unknown): string | null;
export function extractEximExchangeRows(raw: unknown): unknown[];
export function validateEximExchangeRows(raw: unknown, context?: EximExchangeContext): ValidatedEximExchange | null;
