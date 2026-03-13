"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type TabOption = {
  id: string;
  label: string;
};

type SegmentedTabsProps = {
  options: TabOption[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  tone?: "light" | "dark";
};

export function SegmentedTabs({ options, activeTab, onChange, className, tone = "light" }: SegmentedTabsProps) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "flex w-full items-center gap-1 overflow-x-auto rounded-full p-1 md:w-auto md:overflow-visible",
        dark ? "bg-white/10 backdrop-blur" : "bg-slate-100",
        className
      )}
    >
      {options.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative min-w-[88px] flex-none rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-200 md:min-w-0",
              dark
                ? (isActive ? "text-white" : "text-white/65 hover:text-white")
                : (isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-700")
            )}
          >
            {isActive && (
              <motion.div
                layoutId="segmented-tab-active"
                className={cn(
                  "absolute inset-0 rounded-full shadow-sm",
                  dark ? "bg-white/16 ring-1 ring-white/10" : "bg-white"
                )}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
