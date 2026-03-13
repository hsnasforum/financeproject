import { redirect } from "next/navigation";
import { resolveLegacyPlannerRedirectFromSlug } from "@/lib/planning/legacyPlannerRedirect";

type PlannerLegacyCatchAllPageProps = {
  params: Promise<{ slug: string[] }>;
};

export default async function PlannerLegacyCatchAllPage(props: PlannerLegacyCatchAllPageProps) {
  const { slug } = await props.params;
  redirect(resolveLegacyPlannerRedirectFromSlug(slug));
}
