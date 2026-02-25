export type FinlifeDataMode = "live" | "replay";

type ResolveFinlifeModeInput = {
  searchParams: URLSearchParams;
  env?: Record<string, string | undefined>;
};

function isTruthy(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveFinlifeMode(input: ResolveFinlifeModeInput): FinlifeDataMode {
  const env = input.env ?? process.env;

  if (isTruthy(input.searchParams.get("fromFile"))) return "replay";
  if (isTruthy(input.searchParams.get("replay"))) return "replay";
  if (isTruthy(env.FINLIFE_REPLAY)) return "replay";

  return "live";
}
