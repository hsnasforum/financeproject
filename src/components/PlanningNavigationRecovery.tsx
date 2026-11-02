"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

const BLANK_BODY_GRACE_MS = 10_000;
const POLL_MS = 500;

// Only route-specific body/state surfaces establish arrival. A title or a
// stale previous page cannot prove that the planning body has committed.
function hasPlanningSurface(): boolean {
  const main = document.getElementById("main-content");
  if (!main) return true;
  return Array.from(main.querySelectorAll(
    '[data-testid="planning-profile-form"], [data-planning-navigation-state="/planning"], '
      + '[data-testid="planning-loading-state"], [data-testid="vault-loading-state"], '
      + '[data-testid="route-error-state"]',
  )).some((element) => {
    const style = window.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none"
      && bounds.width > 1 && bounds.height > 1;
  });
}

export function PlanningNavigationRecovery() {
  const [offered, setOffered] = useState(false);

  useEffect(() => {
    let route = "";
    let blankSince: number | null = null;
    let showing = false;
    function observe() {
      const currentRoute = window.location.pathname + window.location.search;
      if (currentRoute !== route) {
        route = currentRoute;
        blankSince = null;
        if (showing) {
          showing = false;
          setOffered(false);
        }
      }
      if (window.location.pathname !== "/planning" || hasPlanningSurface()) {
        blankSince = null;
        if (showing) {
          showing = false;
          setOffered(false);
        }
        return;
      }
      blankSince ??= Date.now();
      if (!showing && Date.now() - blankSince >= BLANK_BODY_GRACE_MS) {
        showing = true;
        // No identifiers, URL query, profile data or claimed root cause.
        console.warn("[planning-navigation-recovery] blank body; recovery offered");
        setOffered(true);
      }
    }
    observe();
    const interval = window.setInterval(observe, POLL_MS);
    return () => window.clearInterval(interval);
  }, []);

  function recover(destination: "reload" | "home") {
    // The body may have arrived since the last observer tick. Do not discard
    // newly available input through a stale recovery button.
    if (window.location.pathname !== "/planning" || hasPlanningSurface()) {
      return;
    }
    if (!window.confirm("저장하지 않은 입력은 사라질 수 있습니다. 계속하시겠습니까?")) return;
    console.info("[planning-navigation-recovery] user requested", destination);
    if (destination === "reload") window.location.reload();
    else window.location.assign("/dashboard");
  }

  if (!offered) return null;

  return (
    <section
      aria-label="재무진단 화면 복구"
      className="fixed bottom-24 left-4 right-4 z-[60] mx-auto max-w-xl rounded-2xl border border-amber-300 bg-white p-5 text-slate-900 shadow-xl sm:bottom-8"
    >
      <h2 className="text-lg font-bold">재무진단 화면이 아직 표시되지 않았습니다.</h2>
      <p role="alert" className="mt-2 text-sm leading-relaxed">
        화면을 다시 불러오거나 홈으로 이동할 수 있습니다. 저장하지 않은 입력은 사라질 수 있습니다.
        저장된 프로필과 실행 기록은 삭제하지 않습니다.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={() => recover("reload")}>다시 불러오기</Button>
        <Button type="button" variant="outline" onClick={() => recover("home")}>홈으로 이동</Button>
      </div>
    </section>
  );
}
