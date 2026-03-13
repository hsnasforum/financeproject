import { HomePortalClient, type HomePortalFeaturedAction } from "@/components/HomePortalClient";
import { getDataSourceStatuses } from "@/lib/dataSources/registry";
import { HomeHero } from "@/components/home/HomeHero";
import { QuickTiles } from "@/components/home/QuickTiles";
import { TodayQueue, type TodayQueueActionSummary } from "@/components/home/TodayQueue";
import { HomeStatusStrip } from "@/components/home/HomeStatusStrip";
import { ServiceLinks } from "@/components/home/ServiceLinks";
import { listRuns } from "@/lib/planning/server/store/runStore";
import { safeBuildReportVMFromRun } from "@/app/planning/reports/_lib/reportViewModel";
import { buildPlanningBenefitSignals } from "@/app/planning/reports/_lib/recommendationSignals";
import { resolvePlanningQuickRuleStatus } from "@/app/planning/_lib/planningQuickStart";
import { BENEFIT_TOPICS } from "@/lib/publicApis/benefitsTopics";
import { getProfile } from "@/lib/planning/store/profileStore";

function summarizeStatus() {
  const statuses = getDataSourceStatuses();
  const configured = statuses.filter((entry) => entry.status.state === "configured").length;
  const p0Missing = statuses.filter((entry) => entry.priority === "P0" && entry.status.state !== "configured").length;
  return { configured, p0Missing, total: statuses.length };
}

function formatKrwCompact(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(abs >= 1_000_000_000 ? 0 : 1)}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
}

function formatMonthsCompact(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "-";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toLocaleString("ko-KR") : rounded.toFixed(1)}개월`;
}

function statusBadge(status: string | undefined): string {
  if (status === "SUCCESS") return "LIVE";
  if (status === "PARTIAL_SUCCESS") return "PARTIAL";
  if (status === "FAILED") return "CHECK";
  if (status === "RUNNING") return "RUN";
  return "READY";
}

function compactText(value: string | undefined, maxLength: number): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

async function loadHomeHeroSlides(): Promise<{
  slides: Array<{
    id: string;
    eyebrow: string;
    title: string;
    metric: string;
    metricCaption: string;
    summary: string;
    footer: string;
    badge: string;
    theme: "sky" | "emerald" | "amber";
    href?: string;
    ctaLabel?: string;
  }>;
  actionSummary: TodayQueueActionSummary | null;
  featuredAction: HomePortalFeaturedAction | null;
}> {
  const runs = await listRuns({ limit: 5 });
  const featuredRun = runs.find((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS") ?? runs[0] ?? null;

  const slides: Array<{
    id: string;
    eyebrow: string;
    title: string;
    metric: string;
    metricCaption: string;
    summary: string;
    footer: string;
    badge: string;
    theme: "sky" | "emerald" | "amber";
    href?: string;
    ctaLabel?: string;
  }> = [];
  let actionSummary: TodayQueueActionSummary | null = null;
  let featuredAction: HomePortalFeaturedAction | null = null;

  if (featuredRun) {
    const profile = await getProfile(featuredRun.profileId);
    const reportVm = safeBuildReportVMFromRun(featuredRun, {
      id: featuredRun.id,
      createdAt: featuredRun.createdAt,
      runId: featuredRun.id,
    });
    const vm = reportVm.vm;
    if (!vm) {
      return { slides, actionSummary, featuredAction };
    }
    const topAction = vm.actionRows[0];
    const goalsAchieved = vm.summaryCards.goalsAchieved ?? "-";
    const monthlySurplus = formatKrwCompact(vm.summaryCards.monthlySurplusKrw);
    const endNetWorth = formatKrwCompact(vm.summaryCards.endNetWorthKrw);
    const worstCash = formatKrwCompact(vm.summaryCards.worstCashKrw);
    const reportHref = `/planning/reports?runId=${encodeURIComponent(featuredRun.id)}`;
    const benefitSignals = buildPlanningBenefitSignals(vm, profile?.profile ? {
      currentAge: profile.profile.currentAge,
      birthYear: profile.profile.birthYear,
      gender: profile.profile.gender,
      sido: profile.profile.sido,
      sigungu: profile.profile.sigungu,
    } : undefined);
    const benefitLabels = benefitSignals.topics.map((topic) => BENEFIT_TOPICS[topic].label);
    const benefitParams = new URLSearchParams();
    if (benefitSignals.query) benefitParams.set("query", benefitSignals.query);
    if (benefitSignals.topics.length > 0) benefitParams.set("topics", benefitSignals.topics.join(","));
    if (benefitSignals.profileContext?.sido) benefitParams.set("sido", benefitSignals.profileContext.sido);
    if (benefitSignals.profileContext?.sigungu) benefitParams.set("sigungu", benefitSignals.profileContext.sigungu);
    const benefitsHref = `/benefits${benefitParams.size > 0 ? `?${benefitParams.toString()}` : ""}`;
    const quickRuleStatus = profile?.profile ? resolvePlanningQuickRuleStatus({
      monthlyIncomeNet: profile.profile.monthlyIncomeNet,
      fixedExpense: profile.profile.monthlyEssentialExpenses,
      monthlySurplus: vm.summaryCards.monthlySurplusKrw,
    }) : null;

    slides.push({
      id: "planning-action",
      eyebrow: "내 금융 플랜",
      title: "이번 달 액션",
      metric: topAction ? "TOP 1" : goalsAchieved,
      metricCaption: compactText(topAction?.title, 18) || "우선 확인할 액션 없음",
      summary: compactText(topAction?.summary, 30) || `월 잉여금 ${monthlySurplus}`,
      footer: `말기 순자산 ${endNetWorth}`,
      badge: statusBadge(featuredRun.overallStatus),
      theme: "sky",
      href: reportHref,
      ctaLabel: "추천 액션 보기",
    });

    slides.push({
      id: "planning-summary",
      eyebrow: "최근 실행",
      title: "말기 순자산",
      metric: endNetWorth,
      metricCaption: `${goalsAchieved}개 목표 진행`,
      summary: `최저 현금 ${worstCash}`,
      footer: `${featuredRun.input.horizonMonths}개월 플랜`,
      badge: "REPORT",
      theme: "emerald",
      href: reportHref,
      ctaLabel: "리포트 열기",
    });

    slides.push({
      id: "benefits-flow",
      eyebrow: "맞춤 혜택",
      title: "먼저 볼 혜택",
      metric: compactText(benefitLabels[0], 8) || "혜택",
      metricCaption: benefitLabels.length > 1 ? `${compactText(benefitLabels[1], 8)} 포함` : "플랜 기준 연결",
      summary: compactText(`플랜 결과 기준 ${benefitLabels.slice(0, 2).join(" · ")}`, 26) || "플랜 결과 기준 혜택 연결",
      footer: profile?.profile.sido ? `${profile.profile.sido} 기준 이어보기` : "혜택 탐색으로 이어보기",
      badge: "BENEFIT",
      theme: "amber",
      href: benefitsHref,
      ctaLabel: "혜택 이어보기",
    });
    if (topAction) {
      const basis = compactText(
        vm.monthlyOperatingGuide?.basisLabel || vm.assumptionsLines[0],
        44,
      ) || "저장된 플랜 기준으로 다시 읽을 수 있습니다.";
      actionSummary = {
        badge: statusBadge(featuredRun.overallStatus),
        title: topAction.title,
        summary: compactText(topAction.summary, 84) || "이번 달 먼저 손볼 항목을 액션 형태로 정리했습니다.",
        basis,
        href: reportHref,
        ...(quickRuleStatus ? {
          quickRuleDetail: quickRuleStatus.detail,
          quickRuleLabel: quickRuleStatus.label,
        } : {}),
        metrics: [
          {
            label: "월 잉여금",
            value: monthlySurplus,
            hint: quickRuleStatus ? `${quickRuleStatus.label} · 현재 저장된 플랜 기준으로 남는 돈입니다.` : "현재 저장된 플랜 기준으로 남는 돈입니다.",
          },
          {
            label: "비상금 버팀력",
            value: formatMonthsCompact(vm.summaryCards.emergencyFundMonths),
            hint: "현재 현금 여력으로 버틸 수 있는 기간입니다.",
          },
          {
            label: "경고 신호",
            value: `${(vm.summaryCards.criticalWarnings ?? 0).toLocaleString("ko-KR")}건`,
            hint: `목표 진행 ${goalsAchieved} · 먼저 확인할 신호를 묶었습니다.`,
          },
        ],
      };
      featuredAction = {
        badge: statusBadge(featuredRun.overallStatus),
        title: topAction.title,
        summary: compactText(topAction.summary, 72) || "리포트에서 이번 달 액션과 근거를 바로 이어서 봅니다.",
        href: reportHref,
        basis,
        ...(quickRuleStatus ? {
          quickRuleDetail: quickRuleStatus.detail,
          quickRuleLabel: quickRuleStatus.label,
        } : {}),
      };
    }
    return { slides, actionSummary, featuredAction };
  }

  slides.push({
    id: "mmd-start",
    eyebrow: "MMD 시작",
    title: "플랜부터 저장",
    metric: "START",
    metricCaption: "내 상황 기준 반영",
    summary: "첫 플랜 저장 후 추천과 리포트 연결",
    footer: "지금 바로 시작",
    badge: "READY",
    theme: "sky",
    href: "/planning",
    ctaLabel: "플래닝 시작",
  });

  slides.push({
    id: "mmd-benefits",
    eyebrow: "MMD 혜택",
    title: "혜택까지 한 번에",
    metric: "혜택",
    metricCaption: "주제별 바로 탐색",
    summary: "플랜 전에도 주거·청년 혜택부터 확인",
    footer: "혜택 탐색으로 이동",
    badge: "NOW",
    theme: "amber",
    href: "/benefits",
    ctaLabel: "혜택 보기",
  });

  return { slides, actionSummary, featuredAction };
}

async function loadRecentPlanningRuns() {
  try {
    const runs = await listRuns({ limit: 10 });
    const pickedRuns = runs
      .filter((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS")
      .slice(0, 3);
    return pickedRuns.map((run) => ({
      id: run.id,
      profileId: run.profileId,
      title: run.title?.trim() || run.scenario?.name?.trim() || "플래닝 실행",
      createdAt: run.createdAt,
      horizonMonths: run.input.horizonMonths,
      policyId: run.input.policyId ?? "balanced",
      snapshotId: run.meta.snapshot?.id ?? run.input.snapshotId,
      overallStatus: run.overallStatus,
    }));
  } catch {
    return [];
  }
}

export default async function Home() {
  const status = summarizeStatus();
  const recentRuns = await loadRecentPlanningRuns();
  const heroContent = await loadHomeHeroSlides();

  return (
    <main className="min-h-screen bg-[#f6f7fb] pb-24">
      <HomeHero slides={heroContent.slides} />
      <QuickTiles />
      <TodayQueue actionSummary={heroContent.actionSummary} />
      <HomeStatusStrip status={status} />
      <ServiceLinks />
      <HomePortalClient featuredAction={heroContent.featuredAction} recentRuns={recentRuns} />
    </main>
  );
}
