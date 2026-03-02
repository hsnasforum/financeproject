import { notFound } from "next/navigation";
import DebugPlanningV2Client from "@/components/DebugPlanningV2Client";
import { isDebugPageAccessible } from "@/lib/dev/debugAccess";

export default async function Page() {
  if (!(await isDebugPageAccessible())) {
    notFound();
  }

  return <DebugPlanningV2Client />;
}
