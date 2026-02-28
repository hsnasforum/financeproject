import { HomePortalClient } from "@/components/HomePortalClient";
import { Container } from "@/components/ui/Container";
import { getDataSourceStatuses } from "@/lib/dataSources/registry";
import { HomeHero } from "@/components/home/HomeHero";
import { QuickTiles } from "@/components/home/QuickTiles";
import { TodayQueue } from "@/components/home/TodayQueue";
import { HomeStatusStrip } from "@/components/home/HomeStatusStrip";
import { ServiceLinks } from "@/components/home/ServiceLinks";

function summarizeStatus() {
  const statuses = getDataSourceStatuses();
  const configured = statuses.filter((entry) => entry.status.state === "configured").length;
  const p0Missing = statuses.filter((entry) => entry.priority === "P0" && entry.status.state !== "configured").length;
  return { configured, p0Missing, total: statuses.length };
}

export default async function Home() {
  const status = summarizeStatus();

  return (
    <main className="min-h-screen pb-24">
      <Container className="pt-8 md:pt-12">
        {/* Section 1: Hero (Dark) */}
        <HomeHero />

        {/* Section 2: Quick Links (Icon Tiles) */}
        <QuickTiles />

        {/* Section 3: Today's Queue (Work Queue) */}
        <TodayQueue />

        {/* Section 4: Status / Guide */}
        <HomeStatusStrip status={status} />

        {/* Section 5: Service Links */}
        <ServiceLinks />

        {/* Client side portal logic */}
        <section className="mt-20 border-t border-slate-200 pt-12">
          <HomePortalClient />
        </section>
      </Container>
    </main>
  );
}
