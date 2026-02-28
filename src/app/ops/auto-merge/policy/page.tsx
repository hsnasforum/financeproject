import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AutoMergePolicyClient } from "@/components/AutoMergePolicyClient";
import { loadAutoMergePolicy } from "@/lib/ops/autoMergePolicy";

function parseEnvEnabledFlag(): boolean {
  return String(process.env.AUTO_MERGE_ENABLED ?? "").trim().toLowerCase() === "true";
}

export default async function AutoMergePolicyPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  const policy = await loadAutoMergePolicy();
  const envEnabledFlag = parseEnvEnabledFlag();

  return (
    <AutoMergePolicyClient
      csrf={csrf}
      envEnabledFlag={envEnabledFlag}
      initialPolicy={policy}
    />
  );
}
