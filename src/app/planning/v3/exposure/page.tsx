import { cookies } from "next/headers";
import { ExposureProfileClient } from "./_components/ExposureProfileClient";

export default async function PlanningV3ExposurePage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <ExposureProfileClient csrf={csrf} />;
}
