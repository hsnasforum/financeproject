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
        description="각 화면이 무엇을 비교하는지와 다음에 어디를 다시 보면 되는지 빠르게 찾습니다."
      />

      <Card className="mb-6 rounded-[2rem] p-8 shadow-sm">
        <p className="text-sm font-black text-slate-800">도움말을 읽는 기준</p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
          이 앱의 결과는 확정 답안이 아니라 현재 조건과 기준 시점으로 다시 비교해 보는 참고 정보입니다.
        </p>
        <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">
          계산 결과, 금리, 공고, 기업 정보는 상세 화면과 원문 링크에서 한 번 더 확인해 주세요.
        </p>
      </Card>

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
