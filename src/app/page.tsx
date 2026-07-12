import { HomeHero } from "@/components/home/HomeHero";
import { QuickTiles } from "@/components/home/QuickTiles";
import { TodayQueue } from "@/components/home/TodayQueue";
import { LandingReportPreview } from "@/components/home/LandingReportPreview";
import {
  landingHeroSlides,
  landingReportPreview,
  landingTrustNotes,
} from "@/app/_lib/landingContent";

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
