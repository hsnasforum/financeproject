import Link from "next/link";
import { HelpDialog } from "@/components/HelpDialog";
import { Container } from "@/components/ui/Container";
import { uiTextKo } from "@/lib/uiText.ko";

const navItems = [
  { href: "/", label: uiTextKo.nav.home },
  { href: "/products/deposit", label: uiTextKo.nav.deposit },
  { href: "/products/saving", label: uiTextKo.nav.saving },
  { href: "/recommend", label: uiTextKo.nav.recommend },
  { href: "/planner", label: uiTextKo.nav.planner },
  { href: "/help", label: uiTextKo.nav.help },
  { href: "/public/dart", label: "기업개황" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur-md">
      <Container className="py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[180px]">
            <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
              {uiTextKo.app.brand}
            </Link>
            <p className="text-xs text-slate-500">예금 · 적금 · 추천 · 재무설계</p>
          </div>

          <nav className="order-3 w-full overflow-x-auto sm:order-2 sm:w-auto">
            <div className="flex min-w-max items-center gap-2 rounded-xl bg-surface-muted p-1.5 text-sm text-slate-700">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 transition hover:bg-white hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
            <form action="/products/deposit" method="GET" className="hidden sm:block">
              <input
                name="q"
                className="h-9 w-56 rounded-xl border border-border bg-surface px-3 text-sm outline-none ring-primary/20 placeholder:text-slate-400 focus:ring"
                placeholder="상품명을 입력하세요"
              />
            </form>
            <HelpDialog />
          </div>
        </div>
      </Container>
    </header>
  );
}
