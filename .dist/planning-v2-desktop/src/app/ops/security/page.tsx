import { notFound } from "next/navigation";
import { OpsSecurityClient } from "@/components/OpsSecurityClient";

export default function OpsSecurityPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <OpsSecurityClient />;
}
