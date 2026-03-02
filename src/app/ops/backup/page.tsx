import { notFound } from "next/navigation";
import { OpsBackupClient } from "@/components/OpsBackupClient";
import { shouldBlockOpsPageInCurrentRuntime } from "@/lib/ops/pageAccess";

export default async function OpsBackupPage() {
  if (shouldBlockOpsPageInCurrentRuntime()) {
    notFound();
  }
  return <OpsBackupClient />;
}
