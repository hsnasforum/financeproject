import { fetchEximExchange } from "../../publicApis/providers/exchange";

export type ExchangeProviderRequest = {
  dateYYYYMMDD?: string;
};

export type ExchangeProviderData = Awaited<ReturnType<typeof fetchEximExchange>> extends { ok: true; data: infer T }
  ? T
  : never;
