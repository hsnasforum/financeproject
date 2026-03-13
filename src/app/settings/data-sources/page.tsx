import { getDataSourceStatuses } from "@/lib/dataSources/registry";
import { loadDataSourceImpactSnapshot } from "@/lib/dataSources/impactSnapshot";
import { buildDataSourceExpansionCandidates, buildDataSourceUserImpactCards } from "@/lib/dataSources/userImpact";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataSourceHealthTable } from "@/components/DataSourceHealthTable";
import { OpenDartStatusCard } from "@/components/OpenDartStatusCard";
import { DataSourceImpactCardsClient } from "@/components/DataSourceImpactCardsClient";
import { DataSourceStatusCard } from "@/components/DataSourceStatusCard";
import { cn } from "@/lib/utils";

function impactBadgeClass(state: "ready" | "partial" | "missing") {
  if (state === "ready") return "bg-emerald-100 text-emerald-700";
  if (state === "partial") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
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
    <PageShell className="bg-surface-muted">
      <PageHeader
        title="데이터 소스 연동 상태"
        description="시스템 연동 키 값의 유효성과, 각 API가 사용자 화면에서 어떤 도움으로 이어지는지 확인합니다. 최근 연결 확인은 dev에서만 함께 보고, ping이 없는 소스는 저장된 최신 기준을 read-only로 보여줍니다."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
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

      <Card className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-900">확장 후보</p>
            <p className="mt-1 text-sm text-slate-600">
              `.env.local`에 있는 선택 API 중, 다음 단계에서 사용자 도움으로 이어질 수 있는 후보를 내부 안건 기준으로 정리했습니다.
            </p>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            직접 노출 전이므로 안전한 문구와 기준 시점 표시가 먼저 필요합니다.
          </p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {expansionCandidates.map((candidate) => (
            <div key={candidate.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4" data-testid={`data-source-expansion-${candidate.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{candidate.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{candidate.description}</p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", impactBadgeClass(candidate.state))}>
                  {impactBadgeLabel(candidate.state)}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">{candidate.note}</p>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">노출 전 체크</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{candidate.gate}</p>
              </div>
              <p className="mt-3 text-[11px] font-semibold text-slate-500">
                기반 API: {candidate.sourceIds.map((id) => sourceLabels.get(id) ?? id).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        <OpenDartStatusCard configured={openDartConfigured} />
        {canPing ? (
          <DataSourceHealthTable />
        ) : (
          <Card className="p-4">
            <p className="text-sm font-semibold text-slate-900">dev 전용 진단</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              상세 운영 진단은 dev 운영 환경에서만 노출합니다. production에서는 위 카드의 `운영 최신 기준`만 read-only로 확인합니다.
            </p>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
