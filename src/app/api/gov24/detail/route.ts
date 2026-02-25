import { NextResponse } from "next/server";
import { getSnapshotOrNull } from "@/lib/publicApis/benefitsSnapshot";
import { getBenefitItem } from "@/lib/publicApis/providers/benefits";
import { fetchOfficialGov24Detail } from "@/lib/gov24/officialClient";
import { normalizeEligibilityLines } from "@/lib/gov24/eligibilityNormalize";
import { extractApplyLinks } from "@/lib/gov24/applyLinks";

function splitLines(...texts: Array<string | undefined>): string[] {
  return texts
    .flatMap((text) => (text ?? "").split(/\n|\. (?=[A-Z가-힣])/))
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function inferVisitGuidance(item: {
  applyHow?: string;
  org?: string;
  region?: { sido?: string; sigungu?: string; tags?: string[] };
}): string | null {
  const applyHow = (item.applyHow ?? "").replace(/\s+/g, "").trim();
  if (!applyHow.includes("방문")) return null;
  const sigungu = item.region?.sigungu?.trim() ?? "";
  const sido = item.region?.sido?.trim() ?? "";
  const org = item.org?.trim() ?? "";
  const base = sigungu || sido || org;
  if (!base) return "방문 신청: 해당 지자체 민원창구/담당부서 또는 관할 읍·면·동 주민센터에 문의";
  if (sigungu.endsWith("시")) return `방문 신청: ${sigungu}청 또는 관할 읍·면·동 주민센터에 문의`;
  if (sigungu.endsWith("군")) return `방문 신청: ${sigungu}청 또는 관할 읍·면·동 주민센터에 문의`;
  if (sigungu.endsWith("구")) return `방문 신청: ${sigungu}청 또는 관할 동 주민센터에 문의`;
  if (sido.endsWith("시") || sido.endsWith("도")) return `방문 신청: 해당 지자체(${sido}) 민원창구 또는 관할 시·군·구청/읍·면·동 주민센터에 문의`;
  return `방문 신청: 해당 지자체(${base}) 민원창구 또는 관할 읍·면·동 주민센터에 문의`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const svcId = (searchParams.get("svcId") ?? "").trim();
  if (!svcId) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "svcId가 필요합니다." } }, { status: 400 });
  }

  const snapshot = getSnapshotOrNull({ ttlMs: 24 * 60 * 60 * 1000 });
  const item = snapshot?.snapshot.items.find((entry) => entry.id === svcId) ?? null;
  if (!item) {
    return NextResponse.json({ ok: false, error: { code: "NO_DATA", message: "서비스를 찾지 못했습니다." } }, { status: 404 });
  }

  const official = await fetchOfficialGov24Detail(svcId);
  const detail = await getBenefitItem(svcId);
  const conditions = detail.ok ? detail.data.conditions : [];
  const rawSupportTargetLines = splitLines(
    official?.sections?.target?.join("\n"),
    item.eligibilityText,
    item.eligibilityExcerpt,
    ...(item.eligibilityHints ?? []),
    ...conditions,
  ).slice(0, 20);
  const supportTarget = normalizeEligibilityLines(rawSupportTargetLines);

  const tabs = {
    overview: splitLines(official?.sections?.overview?.join("\n"), item.summary).slice(0, 5),
    target: supportTarget.raw.slice(0, 8),
    benefit: splitLines(official?.sections?.benefit?.join("\n"), item.summary).slice(0, 6),
    apply: splitLines(official?.sections?.apply?.join("\n"), official?.applyMethod, item.applyHow).slice(0, 6),
    contact: splitLines(
      official?.sections?.contact?.join("\n"),
      item.org,
      item.contact,
      inferVisitGuidance(item) ?? undefined,
    ).slice(0, 8),
  };
  const applyLinks = extractApplyLinks({
    serviceId: svcId,
    applyHow: [official?.applyMethod, item.applyHow, ...tabs.apply].filter(Boolean).join(" "),
    link: official?.externalUrl ?? item.link,
    title: item.title,
    orgName: item.org,
  });

  return NextResponse.json({
    ok: true,
    data: {
      id: item.id,
      title: official?.title ?? item.title,
      org: item.org,
      applyHow: item.applyHow,
      contact: item.contact,
      link: official?.externalUrl ?? item.link,
      applyLinks: applyLinks.links,
      primaryApplyUrl: applyLinks.primaryUrl,
      supportTarget,
      tabs,
      source: official ? "official" : detail.ok ? "openapi" : "fallback",
    },
  });
}
