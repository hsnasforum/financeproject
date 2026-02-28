import { getDataSourceStatuses } from "@/lib/dataSources/registry";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataSourcePingButton } from "@/components/DataSourcePingButton";
import { DataSourceHealthTable } from "@/components/DataSourceHealthTable";
import { OpenDartStatusCard } from "@/components/OpenDartStatusCard";
import { cn } from "@/lib/utils";

function badgeClass(state: "configured" | "missing" | "error") {
  if (state === "configured") return "bg-primary text-white border-none shadow-sm";
  if (state === "missing") return "bg-amber-100 text-amber-800 border-none font-bold";
  return "bg-rose-100 text-rose-800 border-none font-bold";
}

export default function DataSourcesSettingsPage() {
  const sources = getDataSourceStatuses();
  const openDartConfigured = Boolean((process.env.OPENDART_API_KEY ?? "").trim());
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
        description="시스템 연동 키 값의 유효성 및 활성화 상태를 확인합니다."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {sources.map((source) => {
          const pingSource = pingMap[source.id];
          return (
            <Card key={source.id} className="p-0 overflow-hidden flex flex-col justify-between group">
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{source.label}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{source.id}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", badgeClass(source.status.state))}>
                    {source.status.state}
                  </span>
                </div>
                
                <div className="text-[11px] text-slate-600 font-medium space-y-1.5">
                  <p className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span className="font-bold text-slate-400 mr-1">필요 ENV:</span>
                    {source.env.map((entry) => `${entry.key}${entry.optional ? "(선택)" : ""}`).join(", ")}
                  </p>
                  {autoEndpointHints[source.id] ? (
                    <p className="flex items-start gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-slate-300 mt-1.5" />
                      <span><span className="font-bold text-slate-400 mr-1">경로:</span> {autoEndpointHints[source.id]}</span>
                    </p>
                  ) : null}
                  {source.status.message ? (
                    <div className="mt-3 p-2 bg-amber-50 rounded-lg text-amber-700 border border-amber-100 font-bold">
                      {source.status.message}
                    </div>
                  ) : null}
                </div>
              </div>
              
              {canPing && pingSource && (
                <div className="bg-surface border-t border-border/50 p-3 flex justify-end">
                  <DataSourcePingButton source={pingSource} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
      
      <div className="space-y-6">
        <OpenDartStatusCard configured={openDartConfigured} />
        <DataSourceHealthTable />
      </div>
    </PageShell>
  );
}
