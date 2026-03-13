const DEFAULT_DART_BASE_URL = "https://opendart.fss.or.kr";

type DartBaseUrlEnv = Readonly<Record<string, string | undefined>>;

export function resolveDartBaseUrl(env: DartBaseUrlEnv = process.env): string {
  const raw = (env.OPENDART_BASE_URL ?? env.OPENDART_API_URL ?? DEFAULT_DART_BASE_URL).trim();
  return raw.replace(/\/+$/, "") || DEFAULT_DART_BASE_URL;
}
