import { FxToolClient } from "@/components/FxToolClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/tools/fx"];

export default function FxToolPage() {
  return <FxToolClient />;
}
