export type DepositProtectionMode = "any" | "prefer" | "require";

export function buildIntegratedDepositMetaUrl(input: {
  includeKdb: boolean;
  depositProtection: DepositProtectionMode;
  includeKdbOnly: boolean;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  params.set("mode", "integrated");
  params.set("kind", "deposit");
  params.set("includeSources", input.includeKdb ? "finlife,datago_kdb" : "finlife");
  params.set("depositProtection", input.depositProtection);
  params.set("limit", String(input.limit ?? 1000));
  params.set("sort", "name");
  if (input.includeKdb && input.includeKdbOnly) {
    params.set("includeKdbOnly", "1");
  }
  return `/api/products/unified?${params.toString()}`;
}
