import { headers } from "next/headers";
import { isLocalRequest } from "./localRequest";
import { getPlanningFeatureFlags } from "../planning/config";
import { isProductionEnv } from "./onlyDev";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getPlanningFeatureFlags(env).debugEnabled;
}

export async function isDebugPageAccessible(): Promise<boolean> {
  if (isProductionEnv()) return false;
  if (!isDebugEnabled()) return false;

  const headerStore = await headers();
  const host = asString(headerStore.get("x-forwarded-host") ?? headerStore.get("host"));
  if (!host) return false;

  return isLocalRequest({
    url: `http://${host}`,
    headers: headerStore,
  }, process.env);
}
