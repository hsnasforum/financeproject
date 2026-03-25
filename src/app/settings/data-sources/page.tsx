import Link from "next/link";
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
        title="데이터 신뢰 및 연동 상태"
        description="추천, 공시, 혜택, 주거 화면이 지금 어떤 데이터 기준으로 보이는지 먼저 확인하고, 필요할 때만 세부 점검까지 이어서 읽는 화면입니다."
      />

      <Card className="mb-12 rounded-[2rem] p-8 shadow-sm">
        <SubSectionHeader
          title="먼저 확인할 신뢰 요약"
          description="상단에서는 지금 결과를 어떤 데이터 기준으로 읽는지 먼저 보고, 필요한 경우에만 카드별 세부 확인과 운영 진단으로 이어서 읽도록 정리했습니다."
        />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">1. 지금 어떤 기준으로 읽나요</p>
            <p className="mt-3 text-sm font-black leading-relaxed text-slate-900">
              추천, 공시, 혜택, 주거 탐색이 각각 어떤 데이터 기준으로 보이는지 먼저 확인합니다.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">2. 비거나 늦으면 무엇이 달라지나요</p>
            <p className="mt-3 text-sm font-black leading-relaxed text-slate-900">
              카드별 사용자 영향과 최근 연결 확인을 함께 읽어, 지금 결과를 어디까지 참고하면 되는지 살핍니다.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">3. 더 자세한 점검은 어디서 보나요</p>
            <p className="mt-3 text-sm font-black leading-relaxed text-slate-900">
              일부 데이터가 비거나 늦어도 핵심 흐름은 유지됩니다. raw 운영 진단은 이 페이지 하단에서만 따로 확인합니다.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="#impact-summary"
            className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            질문별 기준 먼저 보기
          </Link>
          <Link
            href="#source-status"
            className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            데이터별 상태 확인
          </Link>
          <Link
            href="#open-dart-status"
            className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            공시 데이터 기준 보기
          </Link>
          <Link
            href="#operations-diagnostics"
            className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            운영 진단은 아래에서 보기
          </Link>
        </div>
      </Card>

      <div id="impact-summary">
        <DataSourceImpactCardsClient
          cards={impactCards}
          readOnlyHealthByCardId={impactSnapshot.impactReadOnlyByCardId}
          sourceLabels={Object.fromEntries(sourceLabels)}
          showRecentPing={canPing}
        />
      </div>

      <div id="source-status" className="mb-12 space-y-6">
        <SubSectionHeader
          title="데이터별 최신 기준"
          description="자주 쓰는 데이터부터 사용자 영향, 지금 읽는 기준, 최근 연결 확인 순서로 차례로 읽습니다."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
      </div>

      <div id="open-dart-status">
        <OpenDartStatusCard configured={openDartConfigured} />
      </div>

      <Card className="mb-12 rounded-[2rem] p-8 shadow-sm">
        <SubSectionHeader 
          title="확장 후보" 
          description="위 신뢰 기준을 읽은 뒤, 다음 단계에서 사용자 도움으로 확장할 수 있는 후보만 보조 메모처럼 따로 모았습니다."
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

      <div id="operations-diagnostics" className="space-y-8">
        {canPing ? (
          <div className="space-y-4">
            <SubSectionHeader
              title="상세 운영 진단"
              description="위 신뢰 기준과 확장 후보를 다 본 뒤에만 여는 개발용 진단입니다. 사용자용 최신 기준과 분리해 뒤에서 참고용으로만 읽습니다."
            />
            <DataSourceHealthTable />
          </div>
        ) : (
          <Card className="rounded-[2rem] p-8 shadow-sm border-dashed border-slate-200 bg-slate-50/30">
            <SubSectionHeader title="상세 운영 진단" description="Production 환경에서는 상세 운영 진단을 직접 노출하지 않고, 위 신뢰 기준과 도움 안내까지만 남깁니다." />
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
              일반 사용자 화면에서는 위 신뢰 기준과 다음 단계 도움 안내까지만 read-only로 확인하고, raw 진단과 운영 점검 흐름은 개발 환경에서만 따로 엽니다.
            </p>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
