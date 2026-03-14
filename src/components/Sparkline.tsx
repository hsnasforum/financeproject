"use client";

import { useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  formatValue?: (value: number, index: number) => string;
  className?: string;
};

export function Sparkline({
  values,
  width = 140,
  height = 32,
  color = "#0f172a",
  fillOpacity = 0.1,
  formatValue,
  className,
}: SparklineProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { points, fillPoints, svgPoints } = useMemo(() => {
    if (!values.length) return { points: [], fillPoints: "", svgPoints: "" };

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const rangeVal = maxVal - minVal || 1;

    const calculatedPoints = values.map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - minVal) / rangeVal) * height;
      return { x, y, value: v, index: i };
    });

    const svgPointsStr = calculatedPoints.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const fillPointsStr = `${svgPointsStr} ${width.toFixed(2)},${height.toFixed(2)} 0,${height.toFixed(2)}`;

    return {
      points: calculatedPoints,
      svgPoints: svgPointsStr,
      fillPoints: fillPointsStr,
    };
  }, [values, width, height]);

  if (!values.length) {
    return <div className={cn("rounded bg-slate-100", className)} style={{ width, height }} />;
  }

  const handleMouseMove = (e: React.MouseEvent | React.FocusEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ("clientX" in e ? e.clientX : (e.target as HTMLElement).getBoundingClientRect().left) - rect.left;
    const ratio = Math.max(0, Math.min(1, x / width));
    const index = Math.round(ratio * (values.length - 1));
    setHoveredIndex(index);
  };

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div
      ref={containerRef}
      className={cn("relative group/sparkline cursor-crosshair touch-none", className)}
      style={{ width, height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredIndex(null)}
      onFocus={handleMouseMove}
      onBlur={() => setHoveredIndex(null)}
      tabIndex={0}
      role="img"
      aria-label="Sparkline chart"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="overflow-visible"
      >
        {fillOpacity > 0 && (
          <polygon
            fill={color}
            fillOpacity={fillOpacity}
            points={fillPoints}
            className="transition-all duration-300"
          />
        )}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={svgPoints}
          className="transition-all duration-300"
        />

        <AnimatePresence>
          {hoveredPoint && (
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              {/* Vertical Guide Line */}
              <line
                x1={hoveredPoint.x}
                y1={0}
                x2={hoveredPoint.x}
                y2={height}
                stroke={color}
                strokeWidth="1"
                strokeDasharray="2,2"
                opacity={0.4}
              />
              {/* Point Highlight */}
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="3"
                fill="white"
                stroke={color}
                strokeWidth="1.5"
                className="shadow-sm"
              />
            </motion.g>
          )}
        </AnimatePresence>
      </svg>

      {/* Tooltip Overlay */}
      <AnimatePresence>
        {hoveredPoint && formatValue && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute z-50 pointer-events-none"
            style={{
              left: hoveredPoint.x,
              bottom: height + 8,
              transform: "translateX(-50%)"
            }}
          >
            <div className="bg-slate-900 text-white text-[10px] font-black px-2 py-1 rounded shadow-xl whitespace-nowrap flex flex-col items-center gap-0.5">
              <span className="opacity-60 uppercase tracking-tighter">Point {hoveredPoint.index + 1}</span>
              <span className="tabular-nums">{formatValue(hoveredPoint.value, hoveredPoint.index)}</span>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
