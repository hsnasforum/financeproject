import {
  defaults,
  parseSubscriptionFilters,
  type SubscriptionHouseType,
  type SubscriptionMode,
} from "../schemas/subscriptionFilters";

export type { SubscriptionHouseType, SubscriptionMode };

export type SubscriptionInit = {
  region: string;
  from: string;
  to: string;
  q: string;
  houseType: SubscriptionHouseType;
  mode: SubscriptionMode;
};

type RawParams = URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

export function parseSubscriptionInit(params: RawParams, options?: { now?: Date }): SubscriptionInit {
  const parsed = parseSubscriptionFilters(params, { now: options?.now });
  const fallback = defaults({ now: options?.now });
  const value = parsed.value;

  return {
    region: value.region || fallback.region,
    from: value.from || fallback.from,
    to: value.to || fallback.to,
    q: value.q,
    houseType: value.houseType,
    mode: value.mode,
  };
}
