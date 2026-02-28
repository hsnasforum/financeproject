import { notFound } from "next/navigation";
import { RulesOpsClient } from "@/components/RulesOpsClient";

export default function OpsRulesPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <RulesOpsClient />;
}
