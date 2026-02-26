import { notFound } from "next/navigation";
import DebugUnifiedClient from "@/components/DebugUnifiedClient";
import { isProductionEnv } from "@/lib/dev/onlyDev";

export default function DebugUnifiedPage() {
  if (isProductionEnv()) {
    notFound();
  }

  return <DebugUnifiedClient />;
}
