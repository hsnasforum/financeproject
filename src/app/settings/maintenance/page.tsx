import { MaintenanceSettingsClient } from "@/components/MaintenanceSettingsClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/settings/maintenance"];

export default function MaintenanceSettingsPage() {
  return <MaintenanceSettingsClient />;
}
