import { exchangeProvider } from "./exchange";
import { type Provider } from "./types";

import { samplebankProvider } from "./samplebank";
// provider-scaffold:imports

const providerMap = {
  exchange: exchangeProvider,
  samplebank: samplebankProvider,
  // provider-scaffold:entries
} as const;

export type ProviderId = keyof typeof providerMap;

export function getProvider<TReq = unknown, TData = unknown>(id: string): Provider<TReq, TData> | null {
  const picked = providerMap[id as ProviderId] as Provider<TReq, TData> | undefined;
  return picked ?? null;
}

export function listProviders(): Provider[] {
  return Object.values(providerMap) as unknown as Provider[];
}
