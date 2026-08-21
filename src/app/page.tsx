import { HomeHero } from "@/components/home/HomeHero";
import { QuickTiles } from "@/components/home/QuickTiles";
import { TodayQueue } from "@/components/home/TodayQueue";
import { LandingReportPreview } from "@/components/home/LandingReportPreview";
import {
  landingHeroSlides,
  landingReportPreview,
  landingTrustNotes,
} from "@/app/_lib/landingContent";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/"];

export default function Home() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <HomeHero slides={landingHeroSlides} />
      <QuickTiles />
      <LandingReportPreview preview={landingReportPreview} trustNotes={landingTrustNotes} />
      <TodayQueue />
    </div>
  );
}
