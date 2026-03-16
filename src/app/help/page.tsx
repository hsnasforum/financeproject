import { uiTextKo } from "@/lib/uiText.ko";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";

export default function HelpPage() {
  return (
    <PageShell>
      <PageHeader 
        title={uiTextKo.help.title} 
        description={uiTextKo.help.subtitle}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {uiTextKo.help.sections.map((section) => (
          <Card key={section.title} className="rounded-[2rem] p-8 shadow-sm">
            <SubSectionHeader title={section.title} />
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm font-medium leading-relaxed text-slate-600">
              {section.body.map((line) => (
                <li key={line} className="pl-1">{line}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
