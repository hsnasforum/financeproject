import PlanningTrashClient from "@/components/PlanningTrashClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/planning/trash"];

export default function PlanningTrashPage() {
  return <PlanningTrashClient />;
}
