import { notFound } from "next/navigation";
import { OpsBackupClient } from "@/components/OpsBackupClient";

export default async function OpsBackupPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <OpsBackupClient />;
}
