"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import {
  OpsDashboardConfirmModalSection,
  OpsDashboardDoctorSection,
  OpsDashboardQuickActionsSection,
  OpsDashboardRecentEventsSection,
  OpsDashboardSchedulerSection,
  OpsDashboardTopNoticesSection,
} from "./opsDashboard/sections";
import { useOpsDashboardController } from "./opsDashboard/useOpsDashboardController";
import { Button } from "@/components/ui/Button";

export function OpsDashboardClient({ csrf }: { csrf: string }) {
  const controller = useOpsDashboardController({ csrf });

  return (
    <PageShell>
      <div data-testid="ops-home">
        <PageHeader
          title="Ops Dashboard"
          description="Doctor SSOT 기반 운영 이슈와 즉시 조치 액션을 한 곳에서 관리합니다."
          action={(
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void controller.pageHeader.onRefresh();
                }}
                disabled={controller.pageHeader.loading || !controller.pageHeader.hasCsrf}
              >
                {controller.pageHeader.loading ? "새로고침 중..." : "새로고침"}
              </Button>
              <Link href="/ops/about">
                <Button type="button" size="sm" variant="outline">Ops About</Button>
              </Link>
              <Link href="/ops/support">
                <Button type="button" size="sm" variant="outline">진단 번들 내보내기</Button>
              </Link>
            </div>
          )}
        />

        <OpsDashboardTopNoticesSection
          pageHeader={controller.pageHeader}
          topNotices={controller.topNotices}
        />
        <OpsDashboardSchedulerSection scheduler={controller.scheduler} />
        <OpsDashboardDoctorSection doctor={controller.doctor} />

        <div className="grid gap-4 lg:grid-cols-2">
          <OpsDashboardQuickActionsSection quickActions={controller.quickActions} />
          <OpsDashboardRecentEventsSection recentEvents={controller.recentEvents} />
        </div>

        <OpsDashboardConfirmModalSection dialogs={controller.dialogs} />
      </div>
    </PageShell>
  );
}
