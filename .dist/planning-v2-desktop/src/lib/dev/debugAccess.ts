import { headers } from "next/headers";
import { getPlanningFeatureFlags } from "../planning/config";
import { isProductionEnv } from "./onlyDev";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hostToHostname(host: string): string {
  const value = host.trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 0) return value.slice(1, end);
  }
  const idx = value.indexOf(":");
  return idx >= 0 ? value.slice(0, idx) : value;
}

export function isDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getPlanningFeatureFlags(env).debugEnabled;
}

export async function isDebugPageAccessible(): Promise<boolean> {
  if (isProductionEnv()) return false;
  if (!isDebugEnabled()) return false;

  const headerStore = await headers();
  const host = asString(headerStore.get("x-forwarded-host") ?? headerStore.get("host"));
  const hostname = hostToHostname(host);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
