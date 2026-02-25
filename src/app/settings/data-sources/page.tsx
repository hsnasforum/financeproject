import { getDataSourceStatuses } from "@/lib/dataSources/registry";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { DataSourcePingButton } from "@/components/DataSourcePingButton";

function badgeClass(state: "configured" | "missing" | "error") {
  if (state === "configured") return "bg-emerald-100 text-emerald-700";
  if (state === "missing") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export default function DataSourcesSettingsPage() {
  const sources = getDataSourceStatuses();
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
    <main className="py-8">
      <Container>
        <h1 className="text-2xl font-semibold text-slate-900">Data Sources Status</h1>
        <p className="mt-2 text-sm text-slate-500">키 값은 표시하지 않으며, 설정 상태만 확인합니다. P1 소스는 샘플 호출 후 스키마 확정이 필요합니다. 연결 테스트 버튼은 개발 환경에서만 표시됩니다.</p>

        <div className="mt-6 grid gap-3">
          {sources.map((source) => {
            const pingSource = pingMap[source.id];
            return (
              <Card key={source.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{source.label}</p>
                    <p className="text-xs text-slate-500">{source.id} · {source.priority}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass(source.status.state)}`}>
                    {source.status.state}
                  </span>
                </div>
                <div className="mt-3 text-xs text-slate-600">
                  <p>필요 ENV: {source.env.map((entry) => `${entry.key}${entry.optional ? "(optional)" : ""}`).join(", ")}</p>
                  {autoEndpointHints[source.id] ? (
                    <p className="mt-1 text-slate-500">자동 보완 경로: {autoEndpointHints[source.id]}</p>
                  ) : null}
                  {source.status.message ? <p className="mt-1 text-amber-700">{source.status.message}</p> : null}
                  {canPing && pingSource ? <DataSourcePingButton source={pingSource} /> : null}
                </div>
              </Card>
            );
          })}
        </div>
      </Container>
    </main>
  );
}
