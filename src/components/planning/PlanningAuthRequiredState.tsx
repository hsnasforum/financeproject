import { ButtonLink } from "@/components/ui/Button";
import { type DashboardAuthCallbackPath } from "@/lib/planning/auth/callbackPath";
import { type PlanningAuthError } from "@/lib/planning/auth/currentUser";

// Internal paths only. The dashboard variant carries a validated profile selection query.
type PlanningAuthCallbackPath = "/planning" | "/settings/backup" | DashboardAuthCallbackPath;

export function PlanningAuthRequiredState({
  error,
  callbackPath = "/planning",
}: {
  error: PlanningAuthError;
  callbackPath?: PlanningAuthCallbackPath;
}) {
  const unauthenticated = error.code === "UNAUTHENTICATED";
  const desktopRecovery = error.recovery === "desktop-launcher";
  const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const navigationState = callbackPath.split("?", 1)[0];
  return (
    <div className="min-h-screen bg-surface-muted px-4 py-16">
      <section data-planning-navigation-state={navigationState} className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-primary">
          {desktopRecovery ? "앱 세션 확인 필요" : unauthenticated ? "사용자 확인 필요" : "로컬 실행 설정 확인 필요"}
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-navy">
          {desktopRecovery ? "앱 실행 경로로 다시 열어 주세요." : unauthenticated ? "로그인 후 재무 설계를 시작해 주세요." : "안전한 로컬 사용자 상태를 준비하지 못했습니다."}
        </h1>
        <p className="mt-4 text-sm font-medium leading-relaxed text-slate-600">{error.message}</p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
          {desktopRecovery
            ? "이 설치본은 외부 계정 로그인을 사용하지 않습니다. 앱 실행 아이콘이나 시작 명령으로 브라우저를 다시 열면 로컬 세션을 확인할 수 있습니다. 저장 데이터는 그대로 유지됩니다."
            : unauthenticated
            ? "프로필과 실행 기록은 확인된 사용자 범위 안에서만 불러옵니다."
            : "저장 데이터를 열지 않은 상태입니다. 로컬 실행 설정을 확인한 뒤 다시 시도해 주세요."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {desktopRecovery ? (
            <ButtonLink href={callbackPath} prefetch={false} variant="primary">세션 다시 확인</ButtonLink>
          ) : unauthenticated ? (
            <ButtonLink href={signInHref} prefetch={false} variant="primary">로그인하기</ButtonLink>
          ) : null}
          <ButtonLink href="/" variant="outline">홈으로 돌아가기</ButtonLink>
        </div>
      </section>
    </div>
  );
}
