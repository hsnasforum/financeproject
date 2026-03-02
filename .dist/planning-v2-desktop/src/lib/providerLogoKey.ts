/**
 * Resolves a safe and consistent key for provider logos.
 * Only returns the official institution code (fin_co_no) if it matches the 7-digit format.
 */
export function resolveProviderKey(input: {
  providerKey?: string;
  providerName?: string;
}): string | undefined {
  const key = input.providerKey?.trim();
  
  // Only accept 7-digit numeric institution codes (e.g., 0010001)
  if (key && /^\d{7}$/.test(key)) {
    return key;
  }

  const name = (input.providerName ?? "").replace(/\s+/g, "").replace(/주식회사|\(주\)|㈜/g, "");
  if (!name) return undefined;

  const byName: Array<[RegExp, string]> = [
    [/국민|kb/i, "0010927"],
    [/신한/i, "0011625"],
    [/하나/i, "0013909"],
    [/우리/i, "0010001"],
    [/농협|nh/i, "0013175"],
    [/기업|ibk/i, "0010026"],
    [/산업|kdb/i, "0010030"],
    [/부산/i, "0010017"],
    [/대구|아이엠|im/i, "0010016"],
    [/경남/i, "0010024"],
    [/광주/i, "0010019"],
    [/수협/i, "0014807"],
    [/카카오/i, "0015130"],
    [/케이뱅크|kbank/i, "0014674"],
    [/토스/i, "0017801"],
    [/스탠다드|sc/i, "0010002"],
  ];

  for (const [pattern, mapped] of byName) {
    if (pattern.test(name)) return mapped;
  }
  return undefined;
}
