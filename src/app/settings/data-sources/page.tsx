import type { ReactNode } from "react";
import { getDataSourceStatuses } from "@/lib/dataSources/registry";
import { loadDataSourceImpactSnapshot } from "@/lib/dataSources/impactSnapshot";
import { buildDataSourceExpansionCandidates, buildDataSourceUserImpactCards } from "@/lib/dataSources/userImpact";
import { buildDataSourceSettingsOverview } from "@/lib/dataSources/settingsOverview";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { DataSourceHealthTable } from "@/components/DataSourceHealthTable";
import { OpenDartStatusCard } from "@/components/OpenDartStatusCard";
import { DataSourceImpactCardsClient } from "@/components/DataSourceImpactCardsClient";
import { DataSourceStatusCard } from "@/components/DataSourceStatusCard";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";
import { cn } from "@/lib/utils";

export const metadata = PUBLIC_PAGE_METADATA["/settings/data-sources"];

function impactBadgeClass(state: "ready" | "partial" | "missing") {
  if (state === "ready") return "bg-primary/5 text-navy border-primary/10";
  if (state === "partial") return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-surface-muted text-slate-600 border-slate-200";
}

function impactBadgeLabel(state: "ready" | "partial" | "missing") {
  if (state === "ready") return "설정됨";
  if (state === "partial") return "일부 설정";
  return "설정 필요";
}

function DisclosureSection({
  id,
  testId,
  title,
  description,
  summaryLabel = "자세히 보기",
  children,
}: {
  id: string;
  testId: string;
  title: string;
  description: string;
  summaryLabel?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      data-testid={testId}
      className="group mb-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-5 marker:content-none sm:px-8 sm:py-6">
        <span className="min-w-0">
          <span className="block text-base font-black tracking-tight text-navy sm:text-lg">{title}</span>
          <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500 sm:text-sm">{description}</span>
        </span>
        <span className="mt-0.5 shrink-0 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[10px] font-black text-primary group-open:hidden">
          {summaryLabel}
        </span>
        <span className="mt-0.5 hidden shrink-0 rounded-full border border-slate-200 bg-surface-muted px-3 py-1 text-[10px] font-black text-slate-600 group-open:inline-flex">
          접기
        </span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-6 sm:px-8 sm:py-8">{children}</div>
    </details>
  );
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
  const primarySources = sources.filter((source) => source.priority === "P0");
  const optionalSources = sources.filter((source) => source.priority !== "P0");
  const overview = buildDataSourceSettingsOverview({
    cards: impactCards,
    readOnlyHealthByCardId: impactSnapshot.impactReadOnlyByCardId,
    sources: primarySources,
  });
  const visibleAttentionItems = overview.attentionItems.slice(0, 3);
  const hiddenAttentionCount = Math.max(0, overview.attentionItems.length - visibleAttentionItems.length);
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

      <Card className="mb-8 rounded-[2rem] p-5 shadow-sm sm:p-8" data-testid="data-source-overview">
        <SubSectionHeader
          title="지금 확인할 데이터 상태"
          description="결과에 바로 영향을 줄 수 있는 상태만 먼저 보여드립니다. 세부 연결 정보와 운영 진단은 아래 항목을 열어 확인할 수 있습니다."
        />
        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          <div className="min-w-0 rounded-2xl border border-slate-100 bg-surface-muted/60 p-3 sm:p-5">
            <p className="text-[10px] font-black leading-tight text-slate-400">연결 준비된 질문</p>
            <p className="mt-2 text-xl font-black tabular-nums text-navy sm:text-2xl">{overview.readyImpactCount}/{overview.totalImpactCount}</p>
          </div>
          <div className="min-w-0 rounded-2xl border border-amber-100 bg-amber-50/70 p-3 sm:p-5">
            <p className="text-[10px] font-black leading-tight text-amber-700">주의 상태</p>
            <p className="mt-2 text-xl font-black tabular-nums text-amber-800 sm:text-2xl">{overview.warningCount}개</p>
          </div>
          <div className="min-w-0 rounded-2xl border border-slate-100 bg-surface-muted/60 p-3 sm:p-5">
            <p className="text-[10px] font-black leading-tight text-slate-400">연결 확인 필요</p>
            <p className="mt-2 text-xl font-black tabular-nums text-navy sm:text-2xl">{overview.sourceAttentionCount}개</p>
          </div>
        </div>
        {visibleAttentionItems.length > 0 ? (
          <div className="mt-5 space-y-2" data-testid="data-source-priority-attention">
            {visibleAttentionItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/40 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-navy">{item.label}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">{item.reason}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">{item.statusLabel}</span>
              </div>
            ))}
            {hiddenAttentionCount > 0 ? (
              <p className="px-1 pt-1 text-xs font-bold text-slate-500">그 밖의 {hiddenAttentionCount}개 항목은 아래 질문별 기준에서 확인할 수 있습니다.</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm font-bold text-navy">
            현재 바로 확인할 최신 기준 경고는 없습니다. 실제 신청이나 판단 전에는 각 원문과 기준 시점을 다시 확인해 주세요.
          </p>
        )}
      </Card>

      <DisclosureSection
        id="impact-summary"
        testId="data-source-disclosure-impact"
        title="질문별 데이터 기준"
        description={`추천·공시·혜택·주거 등 ${overview.totalImpactCount}개 질문의 사용자 영향과 기준 시점을 확인합니다.`}
      >
        <DataSourceImpactCardsClient
          cards={impactCards}
          readOnlyHealthByCardId={impactSnapshot.impactReadOnlyByCardId}
          sourceLabels={Object.fromEntries(sourceLabels)}
          showRecentPing={canPing}
        />
      </DisclosureSection>

      <DisclosureSection
        id="source-status"
        testId="data-source-disclosure-primary"
        title="주요 기능 데이터 연결"
        description={`금융상품·주거·혜택·환율에 직접 쓰는 ${primarySources.length}개 연결의 설정 상태와 최근 확인 결과를 봅니다.`}
        summaryLabel={primarySources.some((source) => source.status.state !== "configured") ? "확인 필요" : "자세히 보기"}
      >
        <SubSectionHeader
          title="주요 기능 연결 상태"
          description="설정 여부와 실제 연결 확인은 다를 수 있습니다. 각 카드에서 사용자 영향과 최근 확인 결과를 함께 읽어 주세요."
        />
        <div className="mt-6 grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {primarySources.map((source) => {
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
      </DisclosureSection>

      <DisclosureSection
        id="open-dart-status"
        testId="data-source-disclosure-dart"
        title="기업 공시 데이터 자세히 보기"
        description="회사 검색과 공시 모니터링에 쓰는 키 설정, 검색 인덱스 기준과 갱신 방법을 확인합니다."
        summaryLabel={impactSnapshot.impactReadOnlyByCardId.dart?.tone === "warning" ? "최신 기준 확인" : "자세히 보기"}
      >
        <OpenDartStatusCard configured={openDartConfigured} />
      </DisclosureSection>

      <DisclosureSection
        id="optional-source-status"
        testId="data-source-disclosure-optional"
        title="선택 기능과 확장 후보"
        description="연금·보험·거시지표처럼 아직 선택적으로 연결하거나 다음 단계에서 검토할 항목을 모았습니다."
      >
        <SubSectionHeader title="선택 데이터 연결" description="설정하지 않아도 현재 핵심 흐름은 유지됩니다. 필요한 기능을 확장할 때만 확인해 주세요." />
        <div className="mt-6 grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {optionalSources.map((source) => (
            <DataSourceStatusCard key={source.id} source={source} canPing={false} />
          ))}
        </div>
        <div className="mt-10 border-t border-slate-100 pt-8">
          <SubSectionHeader
            title="확장 후보"
            description="배지는 API 설정 범위만 뜻합니다. 실제 사용 가능 여부는 데이터 계약과 기준 시점 검토가 끝난 뒤 판단합니다."
          />
        </div>
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-3">
          {expansionCandidates.map((candidate) => (
            <div key={candidate.id} className="rounded-3xl border border-slate-100 bg-surface-muted/50 p-6 flex flex-col" data-testid={`data-source-expansion-${candidate.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex-1">
                  <p className="text-base font-black text-navy tracking-tight">{candidate.title}</p>
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
      </DisclosureSection>

      <DisclosureSection
        id="operations-diagnostics"
        testId="data-source-disclosure-operations"
        title="운영 진단"
        description={canPing ? "개발 환경에서만 쓰는 원본 상태와 점검 기록입니다." : "일반 사용자에게는 내부 진단을 노출하지 않습니다."}
      >
        {canPing ? (
          <div className="space-y-4">
            <SubSectionHeader
              title="상세 운영 진단"
              description="사용자용 상태와 분리된 개발용 원본 진단입니다. 문제를 재현하거나 연결을 점검할 때만 확인합니다."
            />
            <DataSourceHealthTable />
          </div>
        ) : (
          <Card className="rounded-[2rem] p-8 shadow-sm border-dashed border-slate-200 bg-surface-muted/30">
            <SubSectionHeader title="상세 운영 진단" description="Production 환경에서는 상세 운영 진단을 직접 노출하지 않고, 위 신뢰 기준과 도움 안내까지만 남깁니다." />
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
              일반 사용자 화면에서는 위 신뢰 기준과 다음 단계 도움 안내까지만 read-only로 확인하고, raw 진단과 운영 점검 흐름은 개발 환경에서만 따로 엽니다.
            </p>
          </Card>
        )}
      </DisclosureSection>
    </PageShell>
  );
}
