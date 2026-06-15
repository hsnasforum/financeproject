"use client";

import { PageShell } from "@/components/ui/PageShell";
import {
  buildAlertRuleDraftEffective,
  canSaveNewsSettings,
  getAlertRulesApplyStatus,
  getAlertRulesSectionStatus,
  getNewsSettingsSaveStatus,
  hasAlertRulesDraftChanges,
  parseAlertRuleOverridesJson,
  type NewsSettingsClientProps,
} from "./newsSettings/shared";
import { useNewsSettingsController } from "./newsSettings/useNewsSettingsController";
import {
  NewsSettingsAdvancedSection,
  NewsSettingsExposureSection,
  NewsSettingsHeroSection,
  NewsSettingsSourcesSection,
  NewsSettingsTopicsSection,
} from "./newsSettings/sections";

export {
  buildAlertRuleDraftEffective,
  canSaveNewsSettings,
  getAlertRulesApplyStatus,
  getAlertRulesSectionStatus,
  getNewsSettingsSaveStatus,
  hasAlertRulesDraftChanges,
  parseAlertRuleOverridesJson,
};

export function NewsSettingsClient({ csrf }: NewsSettingsClientProps) {
  const { hero, exposure, sources, topics, advanced, actions } = useNewsSettingsController({ csrf });

  return (
    <PageShell className="relative">
      <div className="space-y-6 md:space-y-8">
        <NewsSettingsHeroSection state={hero} onSave={() => { void actions.handleSave(); }} />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.95fr)]">
          <div className="space-y-6">
            <NewsSettingsExposureSection state={exposure} />
            <NewsSettingsSourcesSection state={sources} />
            <NewsSettingsTopicsSection state={topics} />
          </div>

          <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
            <NewsSettingsAdvancedSection state={advanced} />
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
