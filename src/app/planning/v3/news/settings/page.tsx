import { cookies } from "next/headers";
import { NewsSettingsClient } from "./_components/NewsSettingsClient";

export default async function PlanningV3NewsSettingsPage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return (
    <div className="bg-slate-100/80">
      <NewsSettingsClient csrf={csrf} />
    </div>
  );
}
