import { notFound } from "next/navigation";
import { DevGitAdminClient } from "@/components/DevGitAdminClient";
import { isProductionEnv } from "@/lib/dev/onlyDev";

export default function DevGitPage() {
  if (isProductionEnv()) {
    notFound();
  }

  return <DevGitAdminClient />;
}
