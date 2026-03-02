export const DEFAULT_PREFERRED_PORT = 3100;
export const DEFAULT_SCAN_FROM = 3101;
export const DEFAULT_SCAN_TO = 3199;

function toInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clampPort(value, fallback) {
  const parsed = toInt(value, fallback);
  if (parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

export function buildPortCandidates(options = {}) {
  const preferredPort = clampPort(options.preferredPort, DEFAULT_PREFERRED_PORT);
  const scanFrom = clampPort(options.scanFrom, DEFAULT_SCAN_FROM);
  const scanTo = clampPort(options.scanTo, DEFAULT_SCAN_TO);
  const from = Math.min(scanFrom, scanTo);
  const to = Math.max(scanFrom, scanTo);

  const seen = new Set();
  const out = [];

  if (!seen.has(preferredPort)) {
    seen.add(preferredPort);
    out.push(preferredPort);
  }

  for (let port = from; port <= to; port += 1) {
    if (seen.has(port)) continue;
    seen.add(port);
    out.push(port);
  }

  return out;
}

export async function choosePort(candidates, isAvailable) {
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65535) continue;
    const ok = await isAvailable(candidate);
    if (ok) return candidate;
  }
  return 0;
}

