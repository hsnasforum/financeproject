import PlanningWorkspaceClient from "@/components/PlanningWorkspaceClient";
import { getPlanningFeatureFlags } from "@/lib/planning/config";
import { resolvePlanningLocale } from "@/lib/planning/i18n";

type PlanningPageProps = {
  searchParams?: {
    lang?: string | string[];
  };
};

function pickLang(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function PlanningPage({ searchParams }: PlanningPageProps) {
  const featureFlags = getPlanningFeatureFlags();
  const locale = resolvePlanningLocale(pickLang(searchParams?.lang), process.env.PLANNING_LOCALE);
  return <PlanningWorkspaceClient featureFlags={featureFlags} locale={locale} />;
}
