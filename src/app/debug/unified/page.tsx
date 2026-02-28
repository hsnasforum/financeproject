import { notFound } from "next/navigation";
import DebugUnifiedClient from "@/components/DebugUnifiedClient";
import { isDebugPageAccessible } from "@/lib/dev/debugAccess";

export default async function DebugUnifiedPage() {
  if (!(await isDebugPageAccessible())) {
    notFound();
  }

  return <DebugUnifiedClient />;
}
