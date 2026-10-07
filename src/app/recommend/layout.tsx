import { headers } from "next/headers";
import type { ReactNode } from "react";
import { RecommendAuthRequiredState } from "@/components/recommend/RecommendAuthRequiredState";
import { isPlanningAuthError, requireCurrentPlanningUser } from "@/lib/planning/auth/currentUser";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";
import { RecommendOwnerProvider } from "@/lib/recommend/RecommendOwnerContext";
import { buildRecommendOwnerRequest } from "@/lib/recommend/ownerRequest";
import { recommendOwnerId } from "@/lib/recommend/ownerNamespace";

export const dynamic = "force-dynamic";
export const metadata = PUBLIC_PAGE_METADATA["/recommend"];

async function resolveRecommendOwner() {
  try {
    const currentUser = await requireCurrentPlanningUser(buildRecommendOwnerRequest(await headers()));
    return { ok: true as const, ownerId: recommendOwnerId(currentUser.id) };
  } catch (error) {
    if (isPlanningAuthError(error)) {
      return { ok: false as const, message: error.message };
    }
    throw error;
  }
}

export default async function RecommendLayout({ children }: { children: ReactNode }) {
  const owner = await resolveRecommendOwner();
  if (!owner.ok) return <RecommendAuthRequiredState message={owner.message} />;

  return (
    <RecommendOwnerProvider key={owner.ownerId} ownerId={owner.ownerId}>
      {children}
    </RecommendOwnerProvider>
  );
}
