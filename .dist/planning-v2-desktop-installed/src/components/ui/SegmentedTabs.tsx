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
};

export function SegmentedTabs({ options, activeTab, onChange, className }: SegmentedTabsProps) {
  return (
    <div
      className={cn(
        "inline-flex w-full items-center rounded-full bg-slate-100 p-1 md:w-auto",
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
              "relative flex-1 rounded-full px-6 py-2 text-sm font-semibold transition-colors duration-200 md:flex-none",
              isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="segmented-tab-active"
                className="absolute inset-0 rounded-full bg-white shadow-sm"
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
