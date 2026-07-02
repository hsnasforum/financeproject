import { redirect } from "next/navigation";
import { PLANNING_CANONICAL_ROUTES } from "@/lib/planning/routes";

export default function Page() {
  redirect(PLANNING_CANONICAL_ROUTES.user.home);
}
