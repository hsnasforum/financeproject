import { cookies } from "next/headers";
import { ScenarioLibraryClient } from "./_components/ScenarioLibraryClient";

export default async function PlanningV3ScenariosPage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <ScenarioLibraryClient csrf={csrf} />;
}
