import { notFound } from "next/navigation";
import OpsPlanningFeedbackClient from "@/components/OpsPlanningFeedbackClient";

export default function OpsPlanningFeedbackPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <OpsPlanningFeedbackClient />;
}

