import { FeedbackFormClient } from "@/components/FeedbackFormClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/feedback"];

export default function FeedbackPage() {
  return <FeedbackFormClient />;
}
