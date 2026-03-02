import { Suspense } from "react";
import { FeedbackListClient } from "@/components/FeedbackListClient";

export default function FeedbackListPage() {
  return (
    <Suspense fallback={null}>
      <FeedbackListClient />
    </Suspense>
  );
}
