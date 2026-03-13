function hasNonEmptyEnvValue(value) {
  return typeof value === "string" ? value.trim().length > 0 : false;
}

export function sanitizeInheritedColorEnv(sourceEnv = process.env) {
  const env = { ...sourceEnv };
  if (hasNonEmptyEnvValue(env.NO_COLOR) && hasNonEmptyEnvValue(env.FORCE_COLOR)) {
    delete env.FORCE_COLOR;
  }
  return env;
}

export function sanitizePlaywrightColorEnv(sourceEnv = process.env) {
  const env = { ...sourceEnv };
  delete env.NO_COLOR;
  return sanitizeInheritedColorEnv(env);
}
