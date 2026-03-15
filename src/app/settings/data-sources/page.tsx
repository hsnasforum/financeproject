import { getDataSourceStatuses } from "@/lib/dataSources/registry";
import { loadDataSourceImpactSnapshot } from "@/lib/dataSources/impactSnapshot";
import { buildDataSourceExpansionCandidates, buildDataSourceUserImpactCards } from "@/lib/dataSources/userImpact";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { DataSourceHealthTable } from "@/components/DataSourceHealthTable";
import { OpenDartStatusCard } from "@/components/OpenDartStatusCard";
import { DataSourceImpactCardsClient } from "@/components/DataSourceImpactCardsClient";
import { DataSourceStatusCard } from "@/components/DataSourceStatusCard";
import { cn } from "@/lib/utils";

function impactBadgeClass(state: "ready" | "partial" | "missing") {
  if (state === "ready") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (state === "partial") return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function impactBadgeLabel(state: "ready" | "partial" | "missing") {
  if (state === "ready") return "바로 활용";
  if (state === "partial") return "일부 준비";
  return "준비 필요";
}

export default async function DataSourcesSettingsPage() {
  const sources = getDataSourceStatuses();
  const impactSnapshot = await loadDataSourceImpactSnapshot();
  const openDartConfigured = impactSnapshot.openDartConfigured;
  const configuredSourceIds = [
    ...sources.filter((source) => source.status.state === "configured").map((source) => source.id),
    ...(openDartConfigured ? ["OPENDART"] : []),
  ];
  const impactCards = buildDataSourceUserImpactCards(configuredSourceIds);
  const expansionCandidates = buildDataSourceExpansionCandidates(configuredSourceIds);
  const sourceLabels = new Map(sources.map((source) => [source.id, source.label]));
  const canPing = process.env.NODE_ENV !== "production";
  const pingMap: Partial<Record<string, "exim_exchange" | "mois_benefits" | "reb_subscription" | "finlife" | "molit_sales" | "molit_rent">> = {
    EXIM_EXCHANGE: "exim_exchange",
    MOIS_BENEFITS: "mois_benefits",
    REB_SUBSCRIPTION: "reb_subscription",
    FINLIFE: "finlife",
    MOLIT_SALES: "molit_sales",
    MOLIT_RENT: "molit_rent",
  };
  const autoEndpointHints: Partial<Record<string, string>> = {
    MOIS_BENEFITS: "/gov24/v3/serviceList",
    REB_SUBSCRIPTION: "/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail",
  };

  return (
    <PageShell>
      <PageHeader
        title="데이터 소스 연동 상태"
        description="시스템 연동 키 값의 유효성과, 각 API가 사용자 화면에서 어떤 도움으로 이어지는지 확인합니다. 최근 연결 확인은 dev에서만 함께 보고, ping이 없는 소스는 저장된 최신 기준을 read-only로 보여줍니다."
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
        {sources.map((source) => {
          const pingSource = pingMap[source.id];
          return (
            <DataSourceStatusCard
              key={source.id}
              source={source}
              pingSource={pingSource}
              autoEndpointHint={autoEndpointHints[source.id]}
              canPing={canPing}
            />
          );
        })}
      </div>

      <DataSourceImpactCardsClient
        cards={impactCards}
        readOnlyHealthByCardId={impactSnapshot.impactReadOnlyByCardId}
        sourceLabels={Object.fromEntries(sourceLabels)}
        showRecentPing={canPing}
      />

      <Card className="mb-12 rounded-[2rem] p-8 shadow-sm">
        <SubSectionHeader 
          title="확장 후보" 
          description="현재 환경에 있는 선택 API 중, 다음 단계에서 사용자 도움으로 이어질 수 있는 후보군입니다." 
        />
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {expansionCandidates.map((candidate) => (
            <div key={candidate.id} className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 flex flex-col" data-testid={`data-source-expansion-${candidate.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex-1">
                  <p className="text-base font-black text-slate-900 tracking-tight">{candidate.title}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{candidate.description}</p>
                </div>
                <span className={cn("shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", impactBadgeClass(candidate.state))}>
                  {impactBadgeLabel(candidate.state)}
                </span>
              </div>
              <p className="text-sm font-medium leading-relaxed text-slate-600 mb-6">{candidate.note}</p>
              
              <div className="mt-auto space-y-4 pt-4 border-t border-slate-100">
                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">노출 전 체크</p>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">{candidate.gate}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">기반 API:</span>
                  <p className="text-[10px] font-bold text-slate-500">
                    {candidate.sourceIds.map((id) => sourceLabels.get(id) ?? id).join(" · ")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-8">
        <OpenDartStatusCard configured={openDartConfigured} />
        {canPing ? (
          <DataSourceHealthTable />
        ) : (
          <Card className="rounded-[2rem] p-8 shadow-sm border-dashed border-slate-200 bg-slate-50/30">
            <SubSectionHeader title="운영 환경 진단" description="Production 환경에서는 상세 진단 노출을 제한합니다." />
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
              상세 운영 진단은 dev 환경에서만 노출합니다. production에서는 위 카드의 `운영 최신 기준`만 read-only로 확인합니다.
            </p>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
