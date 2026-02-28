import { notFound } from "next/navigation";
import { LabelingClient } from "@/components/LabelingClient";

export default function OpsLabelsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <LabelingClient />;
}
