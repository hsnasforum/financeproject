import { RecoveryClient } from "@/components/RecoveryClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/settings/recovery"];

export default function RecoverySettingsPage() {
  return <RecoveryClient />;
}
