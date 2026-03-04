import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  detail: string;
  pathHint?: string;
  href: string;
  cta: string;
};

function asKst(iso: string | null): string {
  if (!iso) return "-";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(parsed));
}

function fileMeta(filePath: string): { exists: boolean; mtimeIso: string | null } {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: stat.isFile(),
      mtimeIso: stat.mtime.toISOString(),
    };
  } catch {
    return {
      exists: false,
      mtimeIso: null,
    };
  }
}

function countJsonFiles(dirPath: string): number {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((row) => row.isFile() && row.name.endsWith(".json"))
      .length;
  } catch {
    return 0;
  }
}

function readChecklist(): ChecklistItem[] {
  const dataRoot = path.join(process.cwd(), ".data");

  const todayCachePath = path.join(dataRoot, "news", "cache", "today.latest.json");
  const trend7Path = path.join(dataRoot, "news", "cache", "trends.7d.latest.json");
  const trend30Path = path.join(dataRoot, "news", "cache", "trends.30d.latest.json");
  const scenariosPath = path.join(dataRoot, "news", "cache", "scenarios.latest.json");
  const exposurePath = path.join(dataRoot, "exposure", "profile.json");
  const journalEntriesPath = path.join(dataRoot, "journal", "entries");

  const today = fileMeta(todayCachePath);
  const trend7 = fileMeta(trend7Path);
  const trend30 = fileMeta(trend30Path);
  const scenarios = fileMeta(scenariosPath);
  const exposure = fileMeta(exposurePath);
  const journalCount = countJsonFiles(journalEntriesPath);

  return [
    {
      id: "news-today",
      label: "오늘 Digest 캐시",
      description: "뉴스 수동 갱신이 1회 이상 실행되어야 생성됩니다.",
      completed: today.exists,
      detail: today.exists ? `갱신 시각: ${asKst(today.mtimeIso)}` : "캐시가 없습니다.",
      pathHint: ".data/news/cache/today.latest.json",
      href: "/planning/v3/news",
      cta: "뉴스 페이지",
    },
    {
      id: "news-trends",
      label: "트렌드 캐시(7일/30일)",
      description: "탐색/트렌드 화면에서 사용하는 요약 캐시입니다.",
      completed: trend7.exists && trend30.exists,
      detail: trend7.exists && trend30.exists
        ? `7일: ${asKst(trend7.mtimeIso)} / 30일: ${asKst(trend30.mtimeIso)}`
        : "7일 또는 30일 캐시가 누락되었습니다.",
      pathHint: ".data/news/cache/trends.{7d|30d}.latest.json",
      href: "/planning/v3/news/trends",
      cta: "트렌드 보기",
    },
    {
      id: "news-scenarios",
      label: "시나리오 캐시",
      description: "Base/Bull/Bear 카드 렌더링용 캐시입니다.",
      completed: scenarios.exists,
      detail: scenarios.exists ? `갱신 시각: ${asKst(scenarios.mtimeIso)}` : "시나리오 캐시가 없습니다.",
      pathHint: ".data/news/cache/scenarios.latest.json",
      href: "/planning/v3/news",
      cta: "시나리오 확인",
    },
    {
      id: "exposure",
      label: "내 노출 프로필",
      description: "내 상황 영향(Impact) 계산을 위한 필수 입력입니다.",
      completed: exposure.exists,
      detail: exposure.exists ? `저장 시각: ${asKst(exposure.mtimeIso)}` : "저장된 프로필이 없습니다.",
      pathHint: ".data/exposure/profile.json",
      href: "/planning/v3/exposure",
      cta: "프로필 설정",
    },
    {
      id: "journal",
      label: "판단 저널",
      description: "관찰/가정/옵션 이력을 누적해 회고 기반을 만듭니다.",
      completed: journalCount > 0,
      detail: journalCount > 0 ? `저장 엔트리: ${journalCount}건` : "저장된 엔트리가 없습니다.",
      pathHint: ".data/journal/entries/*.json",
      href: "/planning/v3/journal",
      cta: "저널 작성",
    },
  ];
}

export default function PlanningV3StartPage() {
  const checklist = readChecklist();
  const completed = checklist.filter((row) => row.completed).length;
  const total = checklist.length;

  return (
    <PageShell>
      <section className="space-y-6">
        <Card className="border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Planning v3</p>
              <h1 className="mt-1 text-2xl font-black text-slate-900">첫 실행 체크리스트</h1>
              <p className="mt-2 text-sm text-slate-600">
                로컬 산출물 존재 여부만 읽기 전용으로 점검합니다. 자동 저장/자동 수정은 수행하지 않습니다.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">완료</p>
              <p className="text-xl font-black text-slate-900">{completed} / {total}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/planning/v3/start"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              상태 새로고침
            </Link>
            <Link
              href="/planning/v3/news"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              뉴스 수동 갱신
            </Link>
            <Link
              href="/planning/v3/news/settings"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              뉴스 설정
            </Link>
          </div>
        </Card>

        <div className="grid gap-4">
          {checklist.map((item) => (
            <Card key={item.id} className="border border-slate-200 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold ${item.completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {item.completed ? "완료" : "대기"}
                    </span>
                    <h2 className="text-base font-bold text-slate-900">{item.label}</h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{item.detail}</p>
                  {item.pathHint ? (
                    <p className="mt-1 text-xs text-slate-500">기준 파일: <code>{item.pathHint}</code></p>
                  ) : null}
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {item.cta}
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
