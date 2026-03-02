import { cn } from "@/lib/utils";

type AssumptionsCalloutProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export function AssumptionsCallout({ title = "데이터 기준 및 가정", children, className }: AssumptionsCalloutProps) {
  return (
    <div className={cn("rounded-2xl bg-slate-50 p-4 border border-slate-100", className)}>
      <div className="flex items-center gap-2 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <p className="text-xs font-bold text-slate-600">{title}</p>
      </div>
      <div className="text-[11px] leading-relaxed text-slate-500">
        {children}
      </div>
    </div>
  );
}
