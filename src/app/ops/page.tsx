import { notFound } from "next/navigation";
import { OpsHubClient } from "@/components/OpsHubClient";

export default function OpsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <OpsHubClient />;
}
