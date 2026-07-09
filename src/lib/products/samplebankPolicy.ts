export function isSamplebankPublicAccessAllowed(input?: {
  nodeEnv?: string;
  publicFlag?: string;
}): boolean {
  const nodeEnv = input?.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === "production") return false;

  const flag = (input?.publicFlag ?? process.env.NEXT_PUBLIC_PRODUCTS_SAMPLEBANK_VISIBLE ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") return false;
  return true;
}

export function isSamplebankProductId(id: string): boolean {
  return id.trim().toLowerCase().startsWith("samplebank:");
}
