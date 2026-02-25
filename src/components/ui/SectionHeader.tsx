import type { ReactNode } from "react";
import Image from "next/image";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: string;
  className?: string;
};

export function SectionHeader({ title, subtitle, actions, icon, className = "" }: SectionHeaderProps) {
  return (
    <div className={`mb-8 flex flex-wrap items-center justify-between gap-6 ${className}`.trim()}>
      <div className="flex items-center gap-5">
        {icon && (
          <div className="relative h-16 w-16 shrink-0">
             <div className="absolute inset-0 bg-emerald-50 rounded-3xl rotate-6 group-hover:rotate-12 transition-transform duration-500" />
             <div className="relative h-full w-full rounded-3xl bg-white shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-center">
                <Image src={icon} alt="" aria-hidden="true" width={36} height={36} className="h-9 w-9 object-contain" />
             </div>
          </div>
        )}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm md:text-base font-medium text-slate-400 leading-relaxed">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
