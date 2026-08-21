import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { isPlanningAuthError, requireCurrentPlanningUser } from "@/lib/planning/auth/currentUser";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";
import { RecommendOwnerProvider } from "@/lib/recommend/RecommendOwnerContext";
import { recommendOwnerId } from "@/lib/recommend/ownerNamespace";

export const dynamic = "force-dynamic";
export const metadata = PUBLIC_PAGE_METADATA["/recommend"];

function requestFromHeaders(incoming: Headers): Request {
  return new Request("https://recommend.invalid/recommend", { headers: incoming });
}

function AuthRequiredState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-surface-muted px-4 py-16">
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-primary">추천 사용자 확인 필요</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-navy">로그인 후 추천 기록을 확인해 주세요.</h1>
        <p className="mt-4 text-sm font-medium leading-relaxed text-slate-600">{message}</p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
          추천 조건과 최근 결과, 저장 기록은 로그인한 사용자별로 분리됩니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/api/auth/signin?callbackUrl=%2Frecommend">
            <Button variant="primary">로그인하기</Button>
          </Link>
          <Link href="/">
            <Button variant="outline">홈으로 돌아가기</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

async function resolveRecommendOwner() {
  try {
    const currentUser = await requireCurrentPlanningUser(requestFromHeaders(await headers()));
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
  if (!owner.ok) return <AuthRequiredState message={owner.message} />;

  return (
    <RecommendOwnerProvider key={owner.ownerId} ownerId={owner.ownerId}>
      {children}
    </RecommendOwnerProvider>
  );
}
