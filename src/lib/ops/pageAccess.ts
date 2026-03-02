function normalizeBoolean(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isPackagedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return normalizeBoolean(env.PLANNING_PACKAGED_MODE)
    || normalizeBoolean(env.PLANNING_RUNTIME_PACKAGED)
    || (env.PLANNING_RUNTIME_MODE ?? "").trim().toLowerCase() === "packaged";
}

export function shouldBlockOpsPageInCurrentRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return false;
  return !isPackagedRuntime(env);
}

